/**
 * ituran-pto.ts — שליפה ועיצוב דטרמיניסטי של אירועי PTO (פתיחת מנוף) מגיליון איתוראן_PTO.
 *
 * צד שרת בלבד: קורא ל־GAS action=getIturanPto עם טוקן ממשתני סביבה.
 * המידע הוא אירועי התראת PTO מהמאגר — לא מיקום GPS חי.
 * התשובה נבנית ישירות מהנתונים, בלי מודל שפה, כדי שלא תהיה תלות בזמינות/קרדיט של Gemini.
 */

export type PtoRawEvent = {
  plate?: string;
  driver?: string;
  open?: string;
  close?: string;
  min?: number | string;
  address?: string;
};

export type PtoQuery = {
  /** לוחית מלאה לשליחה ל־GAS (truck=) */
  truck?: string;
  /** סינון מקומי לפי תחילית לוחית (למשל 615) */
  platePrefix?: string;
  /** סינון מקומי לפי שם נהג */
  driverName?: string;
};

export type PtoFetchResult =
  | {
      ok: true;
      events: PtoRawEvent[];
      fetchedAt: string;
      query: PtoQuery;
    }
  | {
      ok: false;
      reason: "missing_server_config" | "gas_http_error" | "gas_error" | "network_error";
      detail?: string | undefined;
      query: PtoQuery;
    };

export type PtoAnswer = {
  text: string;
  evidenceLabelHe: string;
};

const LABEL_FROM_STORE = "נמצא במאגר";
const LABEL_UNAVAILABLE = "לא זמין / נדרש אימות";

/** מיפוי נהגים ידועים ללוחית (לשליחת truck= ל־GAS) */
const KNOWN_DRIVER_PLATES: Record<string, string> = {
  חכמת: "615-41-002",
};

/** מיפוי תחילית לוחית ידועה ללוחית מלאה */
const KNOWN_PLATE_PREFIXES: Record<string, string> = {
  "615": "615-41-002",
};

function normalizePlate(p: string): string {
  return String(p || "")
    .replace(/\s+/g, "")
    .replace(/[־–]/g, "-")
    .trim();
}

/** חילוץ משאית / נהג מתוך שאלה חופשית */
export function extractPtoQuery(question: string): PtoQuery {
  const q = String(question || "");
  const full = q.match(/\d{3}[-־–]?\d{2}[-־–]?\d{3}/);
  if (full) {
    const digits = full[0].replace(/\D/g, "");
    return { truck: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` };
  }

  for (const [name, plate] of Object.entries(KNOWN_DRIVER_PLATES)) {
    if (q.includes(name)) return { truck: plate, driverName: name };
  }

  const prefix = q.match(/(?<!\d)(\d{3})(?!\d)/)?.[1];
  if (prefix) {
    const known = KNOWN_PLATE_PREFIXES[prefix];
    if (known) return { truck: known };
    return { platePrefix: prefix };
  }

  return {};
}

function getPtoConfig(): { gasUrl: string | undefined; token: string | undefined } {
  return {
    gasUrl: process.env["ITURAN_GAS_URL"] || process.env["GAS_URL"],
    token: process.env["ITURAN_TOKEN"] || process.env["API_TOKEN"],
  };
}

export function isPtoConfigured(): boolean {
  const { gasUrl, token } = getPtoConfig();
  return Boolean(gasUrl && token);
}

/** שליפת אירועי PTO מ־GAS (צד שרת בלבד) */
export async function fetchIturanPto(
  query: PtoQuery,
  opts?: { timeoutMs?: number },
): Promise<PtoFetchResult> {
  const { gasUrl, token } = getPtoConfig();
  if (!gasUrl || !token) return { ok: false, reason: "missing_server_config", query };

  try {
    const url = new URL(gasUrl);
    url.searchParams.set("action", "getIturanPto");
    url.searchParams.set("token", token);
    if (query.truck) url.searchParams.set("truck", query.truck);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 12_000),
    });
    if (!res.ok) return { ok: false, reason: "gas_http_error", detail: String(res.status), query };

    const data = (await res.json()) as {
      success?: boolean;
      pto?: PtoRawEvent[];
      at?: string;
      error?: string;
    };
    if (data.success === false) {
      return { ok: false, reason: "gas_error", detail: data.error, query };
    }

    const events = filterPtoEvents(Array.isArray(data.pto) ? data.pto : [], query);
    return {
      ok: true,
      events,
      fetchedAt: data.at ?? new Date().toISOString(),
      query,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      detail: err instanceof Error ? err.message : String(err),
      query,
    };
  }
}

/** סינון מקומי (גם אם GAS כבר סינן — הגנה כפולה) */
export function filterPtoEvents(events: PtoRawEvent[], query: PtoQuery): PtoRawEvent[] {
  return events.filter((e) => {
    const plate = normalizePlate(e.plate ?? "");
    if (query.truck && plate && plate !== normalizePlate(query.truck)) {
      // אם יש שם נהג תואם — עדיין רלוונטי
      if (!(query.driverName && (e.driver ?? "").includes(query.driverName))) return false;
    }
    if (query.platePrefix && !plate.startsWith(query.platePrefix)) return false;
    return true;
  });
}

function parseEventTime(raw?: string): number {
  if (!raw) return 0;
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) return iso;
  // dd/mm/yyyy hh:mm
  const m = raw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\D+(\d{1,2}):(\d{2})/);
  if (m) {
    const [, day, month, yearRaw, hour, minute] = m;
    const year = yearRaw
      ? yearRaw.length === 2
        ? 2000 + Number(yearRaw)
        : Number(yearRaw)
      : new Date().getFullYear();
    return Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute));
  }
  return 0;
}

function formatEventTime(raw?: string): string {
  if (!raw) return "זמן לא צוין";
  // רק מחרוזת ISO מלאה מומרת לשעון ישראל; פורמט אחר מוצג כפי שהגיע מהגיליון
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return raw;
}

function describeQuery(q: PtoQuery): string {
  if (q.truck && q.driverName) return `משאית ${q.truck} (${q.driverName})`;
  if (q.truck) return `משאית ${q.truck}`;
  if (q.platePrefix) return `משאיות ${q.platePrefix}-*`;
  return "כל המשאיות";
}

const NOT_LIVE_GPS = "אלה אירועי התראת PTO מהמאגר — לא מיקום GPS חי.";

/** בניית תשובה דטרמיניסטית מתוצאת השליפה — בלי מודל שפה */
export function formatPtoAnswer(result: PtoFetchResult, opts?: { maxEvents?: number }): PtoAnswer {
  const max = opts?.maxEvents ?? 10;
  const scope = describeQuery(result.query);

  if (!result.ok) {
    const why =
      result.reason === "missing_server_config"
        ? "חיבור איתוראן_PTO אינו מוגדר בשרת (ITURAN_GAS_URL / ITURAN_TOKEN)."
        : result.reason === "gas_http_error"
          ? `שרת GAS החזיר שגיאה (${result.detail}).`
          : result.reason === "gas_error"
            ? `שרת GAS דחה את הבקשה${result.detail ? `: ${result.detail}` : ""}.`
            : "לא ניתן היה להתחבר לשרת GAS.";
    return {
      text: `לא ניתן לשלוף כרגע אירועי מנוף (PTO) עבור ${scope}.\n${why}\nלא הוצגו נתוני דוגמה.`,
      evidenceLabelHe: LABEL_UNAVAILABLE,
    };
  }

  const fetched = formatEventTime(result.fetchedAt);
  if (result.events.length === 0) {
    return {
      text: `לא נמצאו במאגר איתוראן_PTO אירועי פתיחת מנוף עבור ${scope}.\nנשלף: ${fetched}\n${NOT_LIVE_GPS}`,
      evidenceLabelHe: LABEL_UNAVAILABLE,
    };
  }

  const sorted = [...result.events].sort((a, b) => parseEventTime(b.open) - parseEventTime(a.open));
  const shown = sorted.slice(0, max);
  const lines = shown.map((e, i) => {
    const parts = [formatEventTime(e.open)];
    parts.push(e.address?.trim() ? e.address.trim() : "כתובת לא צוינה");
    const who = [e.plate ? `משאית ${e.plate}` : "", e.driver ? `נהג ${e.driver}` : ""]
      .filter(Boolean)
      .join(", ");
    if (who) parts.push(who);
    const minNum = Number(e.min);
    if (e.close) {
      parts.push(
        `סגירה ${formatEventTime(e.close)}${Number.isFinite(minNum) && minNum > 0 ? ` (${Math.round(minNum)} דק׳)` : ""}`,
      );
    }
    return `${i + 1}. ${parts.join(" · ")}`;
  });

  const more =
    sorted.length > shown.length ? `\nמוצגים ${shown.length} מתוך ${sorted.length} אירועים.` : "";

  return {
    text: `אירועי פתיחת מנוף (PTO) — ${scope}:\n${lines.join("\n")}${more}\n\nמקור: גיליון איתוראן_PTO · נשלף: ${fetched}\n${NOT_LIVE_GPS}`,
    evidenceLabelHe: LABEL_FROM_STORE,
  };
}
