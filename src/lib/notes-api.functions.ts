import { createServerFn } from "@tanstack/react-start";

/**
 * גשר שרת ← Google Apps Script (Api.js).
 * הטוקן נשאר בשרת בלבד (process.env.API_TOKEN) ולא מגיע לדפדפן.
 * אין כאן שום נתוני דמה: כל כשל נזרק כשגיאה ומוצג למשתמש.
 */

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxp3CnxhBb2vpcV_fiIBKIxIaGtsD1mYE-tpBApVCWRU4i7kcGDy4csBv2JOKfBi_pI/exec";

function gasUrl(): string {
  return process.env["GAS_URL"] || DEFAULT_GAS_URL;
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
    issue = "פונקציית doPost לא נמצאה בקובץ הפריסה ב-Apps Script (Script function not found: doPost)";
  } else if (text.includes("accounts.google.com") || text.includes("ServiceLogin") || text.includes("Sign in")) {
    issue = "דף התחברות של Google — הרשאת הגישה אינה מוגדרת ל-Anyone (כל אחד)";
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
    const res = await fetch(buildUrl(primaryUrl), { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    return await parseGas(res, primaryUrl);
  } catch (err) {
    if (primaryUrl !== DEFAULT_GAS_URL) {
      console.warn(`[AppsScript] primary GAS_URL failed: ${err instanceof Error ? err.message : String(err)}. Falling back to DEFAULT_GAS_URL...`);
      try {
        const fallbackRes = await fetch(buildUrl(DEFAULT_GAS_URL), { redirect: "follow", signal: AbortSignal.timeout(30_000) });
        return await parseGas(fallbackRes, DEFAULT_GAS_URL);
      } catch (fallbackErr) {
        console.error("[AppsScript] Fallback DEFAULT_GAS_URL also failed:", fallbackErr);
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
      console.warn(`[AppsScript] primary POST failed: ${err instanceof Error ? err.message : String(err)}. Falling back to DEFAULT_GAS_URL...`);
      try {
        return await executePost(DEFAULT_GAS_URL);
      } catch (fallbackErr) {
        console.error("[AppsScript] Fallback POST also failed:", fallbackErr);
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

export const listNotesFn = createServerFn({ method: "POST" }).handler(async () => {
  const data = await gasGet({ action: "getNotes" });
  return { notes: (Array.isArray(data.notes) ? data.notes : []) as SheetNote[] };
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
  .inputValidator((d: { noteId: string; approver: "rami" | "harel"; note?: string }) => {
    if (!String(d?.noteId || "")) throw new Error("חסר מספר תעודה");
    if (d.approver !== "rami" && d.approver !== "harel") throw new Error("approver לא תקין");
    return {
      noteId: String(d.noteId),
      approver: d.approver,
      note: String(d.note || "").slice(0, 500),
    };
  })
  .handler(async ({ data }) => {
    await gasPost({ action: "submitApproval", ...data });
    return { success: true as const };
  });

export const pingFn = createServerFn({ method: "GET" }).handler(async () => {
  const data = await gasGet({ action: "ping" });
  return { version: String(data.version || "unknown"), success: true as const };
});
