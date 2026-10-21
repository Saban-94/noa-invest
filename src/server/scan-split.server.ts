import { createHash, timingSafeEqual } from "node:crypto";
import { PDFDocument } from "pdf-lib";

/* ---------- Types ---------- */

export type SplitNote = {
  pages: number[]; // 1-based pages of the source scan
  noteId: string;
  orderId: string;
  deliveryDate: string; // DD/MM/YYYY
  customerNo: string;
  customerName: string;
  siteAddress: string;
  yard: string;
  driver: string;
  itemsSummary: string;
  bales60002: number;
  pallets60060: number;
  craneTime: string;
  signedBy: string;
  fileName: string;
  pdfBase64: string;
};

export type SplitResult = {
  totalPages: number;
  notes: SplitNote[];
  warnings: string[];
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ---------- Auth ---------- */

export function assertAuthorized(request: Request): void {
  const expected = process.env.SPLIT_API_KEY;
  if (!expected) throw new HttpError(500, "SPLIT_API_KEY is not configured");
  const given = request.headers.get("x-saban-key") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) throw new HttpError(401, "unauthorized");
}

/* ---------- Helpers ---------- */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Returns DD/MM/YYYY or "" when the date cannot be parsed. */
export function normalizeDate(raw: string): string {
  const m = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return "";
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${dd}/${mm}/${yyyy}`;
}

export function safeName(s: string): string {
  return s
    .replace(/[\\/:*?"<>|\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function buildFileName(noteId: string, customerName: string, date: string): string {
  const datePart = date ? date.replace(/\//g, "-") : "ללא-תאריך";
  return `ת.מ_${noteId}_${safeName(customerName) || "ללא-לקוח"}_${datePart}.pdf`;
}

/* ---------- Gemini: key and model rotation ---------- */

// GEMINI_API_KEYS = key1,key2,key3,...   (falls back to GEMINI_API_KEY)
// GEMINI_MODELS   = model-a,model-b,...  (priority order; falls back to GEMINI_MODEL)
const DEFAULT_MODELS = "gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite";
const TOTAL_BUDGET_MS = 50_000; // total time for all attempts in one request
const PER_ATTEMPT_MS = 25_000;
const MIN_ATTEMPT_MS = 3_000;
const MAX_ATTEMPTS = 12;
const HOUR = 3_600_000;
const INVALID_KEY = /API_KEY_INVALID|API key not valid|API key expired/i;

type Candidate = { keyIndex: number; apiKey: string; model: string };
type CallResult = { ok: true; text: string } | { ok: false; status: number; detail: string };

function splitList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

function loadKeys(): string[] {
  return splitList(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "");
}

function loadModels(): string[] {
  return splitList(process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || DEFAULT_MODELS);
}

// Cooldowns live in memory of a warm serverless instance only (best effort).
const blocks = new Map<string, number>();

function block(id: string, ms: number): void {
  blocks.set(id, Date.now() + ms);
}

function isBlocked(c: Candidate): boolean {
  const now = Date.now();
  return [`k${c.keyIndex}`, `k${c.keyIndex}:${c.model}`, `m:${c.model}`].some(
    (id) => (blocks.get(id) ?? 0) > now,
  );
}

function applyFailure(c: Candidate, status: number, detail: string): void {
  if (status === 402 || status === 401 || status === 403) {
    block(`k${c.keyIndex}`, 6 * HOUR); // credits depleted / key rejected
  } else if (status === 400 && INVALID_KEY.test(detail)) {
    block(`k${c.keyIndex}`, 6 * HOUR);
  } else if (status === 429) {
    block(`k${c.keyIndex}:${c.model}`, 90_000); // rate / quota for this key+model
  } else if (status === 404) {
    block(`m:${c.model}`, HOUR); // model not available
  } else if (status >= 500 || status === 0) {
    block(`k${c.keyIndex}:${c.model}`, 30_000);
  }
}

/** Errors that rotating keys cannot fix (bad request, payload too large). */
function isFatal(status: number, detail: string): boolean {
  return (status === 400 && !INVALID_KEY.test(detail)) || status === 413;
}

async function callOnce(
  apiKey: string,
  model: string,
  body: unknown,
  timeoutMs: number,
): Promise<CallResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        detail: (await res.text().catch(() => "")).slice(0, 400),
      };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return { ok: true, text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "" };
  } catch (err) {
    return { ok: false, status: 0, detail: err instanceof Error ? err.name : "network error" };
  }
}

async function generateWithRotation(body: unknown): Promise<string> {
  const keys = loadKeys();
  if (keys.length === 0) throw new HttpError(500, "GEMINI_API_KEYS is not configured");
  const models = loadModels();

  // Models in priority order; keys rotated from a random start to spread load.
  const start = Math.floor(Math.random() * keys.length);
  const all: Candidate[] = [];
  for (const model of models) {
    for (let n = 0; n < keys.length; n++) {
      const keyIndex = (start + n) % keys.length;
      all.push({ keyIndex, apiKey: keys[keyIndex], model });
    }
  }
  const live = all.filter((c) => !isBlocked(c));
  const queue = (live.length > 0 ? live : all).slice(0, MAX_ATTEMPTS);

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const trail: string[] = [];

  for (const c of queue) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      trail.push("time budget exhausted");
      break;
    }

    const label = `key#${c.keyIndex + 1}/${c.model}`;
    const r = await callOnce(c.apiKey, c.model, body, Math.min(remaining, PER_ATTEMPT_MS));

    if (r.ok && r.text) return r.text;

    const status = r.ok ? 204 : r.status;
    const detail = r.ok ? "empty response" : r.detail;
    console.warn(`Gemini ${label} -> ${status}: ${detail.slice(0, 200)}`);
    trail.push(`${label}:${status}`);

    if (isFatal(status, detail)) {
      throw new HttpError(502, `Gemini rejected the request (${status}): ${detail}`);
    }
    applyFailure(c, status, detail);
  }

  throw new HttpError(502, `All Gemini keys/models failed: ${trail.join(", ")}`);
}

/** Lightweight probe of every configured key (no key values are returned). */
export async function checkGeminiKeys(): Promise<
  { key: string; model: string; ok: boolean; status: number; detail: string }[]
> {
  const keys = loadKeys();
  const model = loadModels()[0];
  const probe = {
    contents: [{ role: "user", parts: [{ text: "ping" }] }],
    generationConfig: { maxOutputTokens: 1 },
  };
  return Promise.all(
    keys.map(async (apiKey, i) => {
      const r = await callOnce(apiKey, model, probe, 15_000);
      return {
        key: `key#${i + 1}`,
        model,
        ok: r.ok,
        status: r.ok ? 200 : r.status,
        detail: r.ok ? "" : r.detail.slice(0, 160),
      };
    }),
  );
}

/* ---------- Gemini OCR ---------- */

const NOTE_PROPERTIES = {
  pages: { type: "ARRAY", items: { type: "INTEGER" } },
  noteId: { type: "STRING" },
  orderId: { type: "STRING" },
  deliveryDate: { type: "STRING" },
  customerNo: { type: "STRING" },
  customerName: { type: "STRING" },
  siteAddress: { type: "STRING" },
  yard: { type: "STRING" },
  driver: { type: "STRING" },
  itemsSummary: { type: "STRING" },
  bales60002: { type: "INTEGER" },
  pallets60060: { type: "INTEGER" },
  craneTime: { type: "STRING" },
  signedBy: { type: "STRING" },
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    notes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: NOTE_PROPERTIES,
        required: ["pages", "noteId", "customerNo", "customerName"],
      },
    },
  },
  required: ["notes"],
};

function buildPrompt(totalPages: number): string {
  return [
    `המסמך המצורף הוא סריקה מרוכזת של תעודות משלוח של ח. סבן חומרי בניין. יש בו ${totalPages} עמודים, ממוספרים מ-1.`,
    "עמוד 1 הוא מניפסט: רשימת תעודות המשלוח, מספרי לקוח ושמות הלקוחות.",
    `עמודים 2 עד ${totalPages - 1} הם תעודות המשלוח עצמן. תעודה יכולה להימשך על יותר מעמוד אחד.`,
    "העמוד האחרון אינו תעודת משלוח.",
    "החזר JSON בלבד לפי הסכמה, אובייקט אחד לכל תעודת משלוח, עם רשימת העמודים (pages) שלה.",
    "חוקים:",
    "- deliveryDate בפורמט DD/MM/YYYY.",
    "- bales60002 = מספר בלות פקדון (פריט 60002). pallets60060 = מספר משטחי עץ (פריט 60060). אם לא מופיע: 0.",
    '- yard: "4 (החרש)" או "1 (התלמיד)" לפי המחסן בתעודה.',
    '- craneTime: משך הנפת מנוף כפי שכתוב, למשל "26 דק׳ מנוף". אם אין: "".',
    '- signedBy: שם החותם בתעודה. אם אין חתימה: "".',
    '- אל תמציא נתונים. שדה שלא קריא או לא קיים: "" או 0.',
  ].join("\n");
}

type RawNote = Record<string, unknown>;

async function extractManifest(pdfBase64: string, totalPages: number): Promise<RawNote[]> {
  const text = await generateWithRotation({
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
          { text: buildPrompt(totalPages) },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  try {
    const parsed = JSON.parse(text) as { notes?: RawNote[] };
    return Array.isArray(parsed.notes) ? parsed.notes : [];
  } catch {
    throw new HttpError(502, "Gemini returned invalid JSON");
  }
}

/* ---------- Main ---------- */

export async function splitScan(pdfBase64: string): Promise<SplitResult> {
  const bytes = Buffer.from(pdfBase64, "base64");
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new HttpError(400, "payload is not a PDF");
  }

  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = src.getPageCount();
  if (totalPages < 3) {
    throw new HttpError(422, "scan has fewer than 3 pages (manifest, notes, last page)");
  }

  const rawNotes = await extractManifest(pdfBase64, totalPages);

  const warnings: string[] = [];
  const claimed = new Set<number>();
  const seenIds = new Set<string>();
  const notes: SplitNote[] = [];

  for (const raw of rawNotes) {
    const noteId = str(raw.noteId);
    const pages = Array.from(
      new Set(
        (Array.isArray(raw.pages) ? raw.pages : [])
          .map((p) => Math.trunc(Number(p)))
          .filter((p) => Number.isInteger(p) && p >= 2 && p <= totalPages - 1),
      ),
    ).sort((a, b) => a - b);

    if (!noteId) {
      warnings.push(`תעודה ללא מספר (עמודים: ${pages.join(",") || "לא ידוע"}) - דולגה`);
      continue;
    }
    if (seenIds.has(noteId)) {
      warnings.push(`תעודה ${noteId} הופיעה פעמיים - הכפילות דולגה`);
      continue;
    }
    if (pages.length === 0) {
      warnings.push(`תעודה ${noteId}: אין עמודים תקינים - דולגה`);
      continue;
    }
    if (pages.some((p) => claimed.has(p))) {
      warnings.push(`תעודה ${noteId}: חפיפת עמודים עם תעודה אחרת - דולגה`);
      continue;
    }

    const customerNo = str(raw.customerNo);
    const customerName = str(raw.customerName);
    const deliveryRaw = str(raw.deliveryDate);
    const deliveryDate = normalizeDate(deliveryRaw);
    if (!deliveryDate) warnings.push(`תעודה ${noteId}: תאריך לא תקין ("${deliveryRaw}")`);
    if (!/^\d{3,10}$/.test(customerNo)) {
      warnings.push(`תעודה ${noteId}: מספר לקוח לא תקין ("${customerNo}")`);
    }

    const out = await PDFDocument.create();
    const copied = await out.copyPages(
      src,
      pages.map((p) => p - 1),
    );
    copied.forEach((page) => out.addPage(page));

    pages.forEach((p) => claimed.add(p));
    seenIds.add(noteId);

    notes.push({
      pages,
      noteId,
      orderId: str(raw.orderId),
      deliveryDate,
      customerNo,
      customerName,
      siteAddress: str(raw.siteAddress),
      yard: str(raw.yard),
      driver: str(raw.driver),
      itemsSummary: str(raw.itemsSummary),
      bales60002: num(raw.bales60002),
      pallets60060: num(raw.pallets60060),
      craneTime: str(raw.craneTime),
      signedBy: str(raw.signedBy),
      fileName: buildFileName(noteId, customerName, deliveryDate),
      pdfBase64: await out.saveAsBase64(),
    });
  }

  const missing: number[] = [];
  for (let p = 2; p <= totalPages - 1; p++) if (!claimed.has(p)) missing.push(p);
  if (missing.length > 0) {
    warnings.push(`עמודים שלא שויכו לאף תעודה: ${missing.join(",")}`);
  }

  return { totalPages, notes, warnings };
}
