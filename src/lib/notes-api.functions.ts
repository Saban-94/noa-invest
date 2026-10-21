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

async function parseGas(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${res.status})`);
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) throw new Error(String(data.error || "הפעולה נכשלה"));
  return data;
}

async function gasGet(params: Record<string, string>) {
  const u = new URL(gasUrl());
  for (const [k, v] of Object.entries({ ...params, token: apiToken() })) u.searchParams.set(k, v);
  const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  return parseGas(res);
}

async function gasPost(body: Record<string, unknown>) {
  const res = await fetch(gasUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, token: apiToken() }),
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  return parseGas(res);
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
