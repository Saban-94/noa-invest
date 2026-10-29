/**
 * OneSignal — התראות שרת בלבד (REST API Key לא בצד לקוח)
 *
 * Vercel env:
 *   ONESIGNAL_APP_ID=06fa3292-cfc4-42e4-a64a-d629e58ec9b3
 *   ONESIGNAL_REST_API_KEY=...
 */

import { createServerFn } from "@tanstack/react-start";

const DEFAULT_APP_ID = "06fa3292-cfc4-42e4-a64a-d629e58ec9b3";
const APP_ORIGIN = "https://noa-invest.vercel.app";

function appId() {
  return process.env["ONESIGNAL_APP_ID"] || DEFAULT_APP_ID;
}

function restKey() {
  const k = process.env["ONESIGNAL_REST_API_KEY"];
  if (!k) throw new Error("ONESIGNAL_REST_API_KEY לא מוגדר בשרת (Vercel env)");
  return k;
}

type NotifyPayload = {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
};

async function sendOneSignal(payload: NotifyPayload) {
  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Key ${restKey()}`,
    },
    body: JSON.stringify({
      app_id: appId(),
      included_segments: ["All"],
      headings: { he: payload.title, en: payload.title },
      contents: { he: payload.body, en: payload.body },
      url: payload.url,
      data: payload.data || {},
      chrome_web_icon: "https://noa-invest.vercel.app/favicon.ico",
    }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`OneSignal ${res.status}: ${text.slice(0, 200)}`);
  }
  // תשובה מנורמלת וסריאלית: id ריק או errors לא ריק = הבקשה לא התקבלה
  const rawErrors = json["errors"];
  return {
    id: typeof json["id"] === "string" ? (json["id"] as string) : "",
    errors:
      rawErrors == null ||
      (Array.isArray(rawErrors) && rawErrors.length === 0) ||
      (typeof rawErrors === "object" && Object.keys(rawErrors as object).length === 0)
        ? ""
        : JSON.stringify(rawErrors).slice(0, 300),
  };
}

export const notifyNewNoteFn = createServerFn({ method: "POST" })
  .validator((d: { noteId: string; customer?: string | undefined }) => d)
  .handler(async ({ data }) => {
    return sendOneSignal({
      title: "תעודת משלוח חדשה",
      body: `ת.מ. ${data.noteId}${data.customer ? ` · ${data.customer}` : ""}`,
      url: `https://noa-invest.vercel.app/notes/${data.noteId}`,
      data: { type: "new_note", noteId: data.noteId },
    });
  });

export const notifyHarelQueueFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      noteId: string;
      customer?: string | undefined;
      kind: "pending_harel" | "returned_to_rami" | "rami_replied";
    }) => d,
  )
  .handler(async ({ data }) => {
    const titles = {
      pending_harel: "ממתין לאישור הראל",
      returned_to_rami: "הוחזר לבירור ראמי",
      rami_replied: "ראמי ענה — לבדיקת הראל",
    };
    return sendOneSignal({
      title: titles[data.kind],
      body: `ת.מ. ${data.noteId}${data.customer ? ` · ${data.customer}` : ""}`,
      // deep-link לאותה משימה בשני הכיוונים: הראל→ראמי נוחת על /inquiry, ראמי→הראל על /harel
      url:
        data.kind === "returned_to_rami"
          ? `${APP_ORIGIN}/inquiry?task=${encodeURIComponent(data.noteId)}&tab=tasks`
          : `${APP_ORIGIN}/harel?task=${encodeURIComponent(data.noteId)}`,
      data: { type: data.kind, noteId: data.noteId },
    });
  });
