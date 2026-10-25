/**
 * OneSignal — התראות שרת בלבד (REST API Key לא בצד לקוח)
 *
 * Vercel env:
 *   ONESIGNAL_APP_ID=06fa3292-cfc4-42e4-a64a-d629e58ec9b3
 *   ONESIGNAL_REST_API_KEY=...
 */

import { createServerFn } from "@tanstack/react-start";

const DEFAULT_APP_ID = "06fa3292-cfc4-42e4-a64a-d629e58ec9b3";

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
  return json;
}

export const notifyNewNoteFn = createServerFn({ method: "POST" })
  .validator((d: { noteId: string; customer?: string }) => d)
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
      customer?: string;
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
      url:
        data.kind === "returned_to_rami"
          ? `https://noa-invest.vercel.app/inquiry/${data.noteId}`
          : `https://noa-invest.vercel.app/harel`,
      data: { type: data.kind, noteId: data.noteId },
    });
  });
