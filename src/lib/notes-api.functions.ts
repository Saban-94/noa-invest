import { createServerFn } from "@tanstack/react-start";
import type { DeliveryNote } from "@/lib/data";
import { buildLogisticsFindings } from "@/lib/logistics-audit";

/**
 * גשר שרת ← Google Apps Script (Api.js).
 * הטוקן נשאר בשרת בלבד (process.env.API_TOKEN) ולא מגיע לדפדפן.
 * אין כאן שום נתוני דמה: כל כשל נזרק כשגיאה ומוצג למשתמש.
 */

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbx9AaPx0do-4UlRwPgnr4oUYrCaMVt_YLXY-nuMK0RTHZJNLZlsXeh12tDw69eqg00Haw/exec";

let activeGasUrl: string | null = null;

function gasUrl(): string {
  if (activeGasUrl) return activeGasUrl;
  const envUrl = process.env["GAS_URL"];
  // אם הכתובת בסביבה מכילה את הפריסה השבורה הידועה שאין בה doGet/doPost, השתמש ישירות ב-DEFAULT_GAS_URL
  if (
    envUrl &&
    (envUrl.includes("TwXhw") ||
      envUrl.includes("AKfycbx9AaPx0do-4UlRwPgnr4oUYrCaMVt_YLXY-nuMK0RTHZJNLZlsXeh12tDw69eqg00Haw"))
  ) {
    return DEFAULT_GAS_URL;
  }
  return envUrl || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת (Environment Variables)");
  return t;
}

function extractDiagnosticFromText(text: string, host: string, status: number): string {
  let issue = "";
  if (text.includes("nicht gefunden: doGet") || text.includes("not found: doGet")) {
    issue = "פונקציית doGet לא נמצאה בקובץ הפריסה ב-Apps Script (Script function not found: doGet)";
  } else if (text.includes("nicht gefunden: doPost") || text.includes("not found: doPost")) {
    issue =
      "פונקציית doPost לא נמצאה בקובץ הפריסה ב-Apps Script (Script function not found: doPost)";
  } else if (
    text.includes("accounts.google.com") ||
    text.includes("ServiceLogin") ||
    text.includes("Sign in")
  ) {
    issue = "דף התחברות של Google — הרשאת הגישה אינה מוגדרת ל-Anyone (כל אחד)";
  } else if (text.includes("DocumentApp.create") || text.includes("documents")) {
    issue =
      "שגיאת הרשאה DocumentApp ב-Apps Script. יש לעדכן את קובץ Code.gs לשמירה ישירה דרך DriveApp";
  } else {
    issue = `התקבל תוכן HTML באורך ${text.length} תווים במקום JSON`;
  }

  const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
  return `תשובה לא תקינה מ-Apps Script (HTTP ${status}) מאת ${host}. פירוט: ${issue}. [קטע תגובה: "${snippet}"]. סיבות אפשריות: 1) פונקציית doGet/doPost חסרה בפרויקט Apps Script שנפרס 2) גישת הפריסה אינה Anyone 3) כתובת פריסה ישנה.`;
}

async function parseGas(res: Response, attemptedUrl: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    const host = new URL(attemptedUrl).hostname;
    throw new Error(extractDiagnosticFromText(text, host, res.status));
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) throw new Error(String(data.error || "הפעולה נכשלה"));
  return data;
}

async function gasGet(params: Record<string, string>) {
  const primaryUrl = gasUrl();
  const buildUrl = (baseUrl: string) => {
    const u = new URL(baseUrl);
    for (const [k, v] of Object.entries({ ...params, token: apiToken() })) u.searchParams.set(k, v);
    return u;
  };

  try {
    const res = await fetch(buildUrl(primaryUrl), {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    return await parseGas(res, primaryUrl);
  } catch (err) {
    if (primaryUrl !== DEFAULT_GAS_URL) {
      console.warn(
        `[AppsScript] primary GAS_URL failed: ${err instanceof Error ? err.message : String(err)}. Falling back to DEFAULT_GAS_URL...`,
      );
      try {
        const fallbackRes = await fetch(buildUrl(DEFAULT_GAS_URL), {
          redirect: "follow",
          signal: AbortSignal.timeout(30_000),
        });
        const result = await parseGas(fallbackRes, DEFAULT_GAS_URL);
        activeGasUrl = DEFAULT_GAS_URL;
        return result;
      } catch (fallbackErr) {
        console.error("[AppsScript] Fallback DEFAULT_GAS_URL also failed:", fallbackErr);
        throw fallbackErr;
      }
    }
    throw err;
  }
}

async function gasPost(body: Record<string, unknown>) {
  const primaryUrl = gasUrl();
  const executePost = async (targetUrl: string) => {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, token: apiToken() }),
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    return await parseGas(res, targetUrl);
  };

  try {
    return await executePost(primaryUrl);
  } catch (err) {
    if (primaryUrl !== DEFAULT_GAS_URL) {
      console.warn(
        `[AppsScript] primary POST failed: ${err instanceof Error ? err.message : String(err)}. Falling back to DEFAULT_GAS_URL...`,
      );
      try {
        const result = await executePost(DEFAULT_GAS_URL);
        activeGasUrl = DEFAULT_GAS_URL;
        return result;
      } catch (fallbackErr) {
        console.error("[AppsScript] Fallback POST also failed:", fallbackErr);
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export type SheetNote = {
  id: string;
  key: string;
  date: string;
  time: string;
  docNumber: string;
  comaxOrder: string;
  customerNo: string;
  customer: string;
  address: string;
  driver: string;
  truck: string;
  fileId: string;
  driveUrl: string;
  items: { sku: string; name: string; qty: number; unit: string }[];
  depositsText: string;
  craneNotes: string;
  extractStatus: string;
  approvalStatus: string;
  signedUrl: string;
  ramiApprovedAt: string;
  harelApprovedAt: string;
};

type ResolvedFile = { fileId?: string; viewUrl?: string; source?: string };

function auditNoteFromSheet(n: SheetNote): DeliveryNote {
  const parseDeposit = (code: string): number | null => {
    const text = String(n.depositsText || "");
    const match = text.match(new RegExp(code + "[^0-9]{0,25}([0-9]+)"));
    return match ? Number.parseInt(match[1], 10) : null;
  };
  const bales = parseDeposit("60002");
  const pallets = parseDeposit("60060");
  return {
    id: String(n.id),
    customer: n.customer || "לא זוהה שם לקוח",
    date: n.date || "",
    comaxOrder: n.comaxOrder || undefined,
    fileId: n.fileId || undefined,
    driveUrl: n.driveUrl || undefined,
    driver: [n.driver, n.truck].filter(Boolean).join(" · ") || undefined,
    items: (n.items || []).map((item) => ({
      name: String(item.name || ""),
      sku: item.sku || undefined,
      qty: Number(item.qty),
      ordered: Number(item.qty),
      weightKg: 0,
      unit: item.unit || "יח׳",
    })),
    deposits: {
      ...(bales !== null ? { bales60002: { delivered: bales, billed: bales } } : {}),
      ...(pallets !== null ? { pallets60060: { delivered: pallets, billed: pallets } } : {}),
    },
    live: true,
  };
}

/**
 * תעודות שהגיליון החזיר בלי fileId (לינק חסר, או נוסחת HYPERLINK שנקראה כתווית בלבד):
 * מבקשים מ-Apps Script לאתר את הקובץ (גיליון, טאב בירור, תיקיית הארכיון) ומשלימים.
 * כשל כאן לא שובר את הרשימה.
 */
async function fillMissingFiles(notes: SheetNote[]): Promise<void> {
  const missing = notes
    .filter((n) => !n.fileId && n.id)
    .map((n) => n.id)
    .slice(0, 100);
  if (missing.length === 0) return;
  try {
    const r = await gasGet({ action: "resolveNoteFiles", ids: missing.join(",") });
    const files = (r.files && typeof r.files === "object" ? r.files : {}) as Record<
      string,
      ResolvedFile
    >;
    for (const n of notes) {
      const f = files[n.id];
      if (!n.fileId && f?.fileId) {
        n.fileId = f.fileId;
        n.driveUrl = n.driveUrl || f.viewUrl || "";
      }
    }
  } catch (err) {
    console.warn(
      "[AppsScript] resolveNoteFiles failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export const listNotesFn = createServerFn({ method: "POST" }).handler(async () => {
  const data = await gasGet({ action: "getNotes" });
  const notes = (Array.isArray(data.notes) ? data.notes : []) as SheetNote[];
  await fillMissingFiles(notes);
  return { notes };
});

export const getScanFn = createServerFn({ method: "POST" })
  .inputValidator((d: { fileId: string }) => {
    const id = String(d?.fileId || "");
    if (!/^[\w-]{10,}$/.test(id)) throw new Error("fileId לא תקין");
    return { fileId: id };
  })
  .handler(async ({ data }) => {
    const r = await gasGet({ action: "getFile", id: data.fileId });
    return { mimeType: String(r.mimeType || ""), base64: String(r.base64 || "") };
  });

export const saveSignedNoteFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      noteId: string;
      customer?: string;
      signedBy?: string;
      statusNote?: string;
      dataUrl: string;
    }) => {
      if (!String(d?.noteId || "")) throw new Error("חסר מספר תעודה");
      if (!/^data:image\/png;base64,/.test(String(d?.dataUrl || ""))) {
        throw new Error("נדרשת תמונת PNG של הקנבס");
      }
      if (d.dataUrl.length > 25_000_000) throw new Error("התמונה גדולה מדי");
      return {
        noteId: String(d.noteId),
        customer: String(d.customer || ""),
        signedBy: String(d.signedBy || ""),
        statusNote: String(d.statusNote || ""),
        dataUrl: d.dataUrl,
      };
    },
  )
  .handler(async ({ data }) => {
    const r = await gasPost({
      action: "saveSignedNote",
      noteId: data.noteId,
      customer: data.customer,
      signedBy: data.signedBy,
      statusNote: data.statusNote,
      signedScanDataUrl: data.dataUrl,
    });
    return { driveUrl: String(r.driveUrl || ""), folder: String(r.folder || "") };
  });

export const approvalFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    noteId: string;
    approver: "rami" | "harel";
    note?: string;
    auditEvidence?: Record<string, string>;
  }) => {
    if (!String(d?.noteId || "")) throw new Error("חסר מספר תעודה");
    if (d.approver !== "rami" && d.approver !== "harel") throw new Error("approver לא תקין");
    if (!d.auditEvidence || typeof d.auditEvidence !== "object") {
      throw new Error("נדרשת בדיקת לוגיסטיקה ותיעוד אסמכתאות לפני אישור");
    }
    const auditEvidence = Object.fromEntries(
      Object.entries(d.auditEvidence).map(([key, value]) => [String(key), String(value || "").slice(0, 2000)]),
    );
    return {
      noteId: String(d.noteId),
      approver: d.approver,
      note: String(d.note || "").slice(0, 500),
      auditEvidence,
    };
  })
  .handler(async ({ data }) => {
    const response = await gasGet({ action: "getNotes" });
    const notes = (Array.isArray(response.notes) ? response.notes : []) as SheetNote[];
    await fillMissingFiles(notes);
    const source = notes.find((item) => String(item.id) === data.noteId);
    if (!source) throw new Error("לא ניתן לאמת אישור: התעודה לא נמצאה במקור החי");
    const findings = buildLogisticsFindings(auditNoteFromSheet(source));
    const missing = findings.filter((finding) => (data.auditEvidence[finding.id] || "").trim().length < 12);
    if (missing.length) {
      throw new Error(`האישור נחסם בשרת: חסרות אסמכתאות ל-${missing.length} בדיקות מתוך ${findings.length}`);
    }
    await gasPost({ action: "submitApproval", ...data });
    return { success: true as const };
  });

export const pingFn = createServerFn({ method: "GET" }).handler(async () => {
  const data = await gasGet({ action: "ping" });
  return { version: String(data.version || "unknown"), success: true as const };
});
