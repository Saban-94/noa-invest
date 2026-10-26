/**
 * ai.functions.ts — שירותי AI וחיבור קונטקסט לצ׳אט נועה (כולל אירועי PTO/מנוף)
 */

export type PtoContextEvent = {
  truck: string;
  driver?: string;
  eventType: string;
  eventTimeIso: string;
  address: string;
  ingestedAt: string;
};

export type PtoContextResponse = {
  success: boolean;
  source: string;
  events: PtoContextEvent[];
  meta: {
    count: number;
    truckFilter?: string | null;
    since: string;
    fetchedAt: string;
    warning?: string;
  };
  error?: string;
};

// הגדרת כתובת ה־GAS וטוקן האבטחה (ניתן לקרוא מ־ENV או להגדיר קבוע)
const ITURAN_GAS_URL =
  import.meta.env.VITE_ITURAN_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbx9NpLEnJ5904JqaeeuuR8NslN66F4r6IYddyvr-Q7AeGx5HFHfSAjW8CoP2oT6NoQrvA/exec";

const ITURAN_TOKEN = import.meta.env.VITE_ITURAN_TOKEN || "saban-ituran-secret-2026";

/**
 * זיהוי האם השאלה עוסקת בפתיחת מנוף או אירועי PTO
 */
export function asksCraneOrPto(query: string): boolean {
  const q = String(query || "").toLowerCase();
  const keywords = [
    "מנוף",
    "pto",
    "פתיחת",
    "סגירת",
    "חכמת",
    "עלי",
    "615",
    "651",
    "הרמת סחורה",
    "זמני מנוף",
  ];
  return keywords.some((kw) => q.includes(kw));
}

/**
 * שליפת אירועי PTO והקשר משרת ה־GAS
 */
export async function fetchIturanPtoContext(truckFilter?: string): Promise<PtoContextResponse> {
  try {
    let url = `${ITURAN_GAS_URL}?action=getIturanPto&token=${encodeURIComponent(ITURAN_TOKEN)}`;
    if (truckFilter) {
      url += `&truck=${encodeURIComponent(truckFilter)}`;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`שגיאת תקשורת מול שרת האיתוראן: ${res.status}`);
    }

    const data = await res.json();
    return data as PtoContextResponse;
  } catch (err: any) {
    console.error("fetchIturanPtoContext error:", err);
    return {
      success: false,
      source: "ituran_pto_sheet",
      events: [],
      meta: {
        count: 0,
        since: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        warning: err?.message || String(err),
      },
      error: err?.message || String(err),
    };
  }
}

/**
 * הזרקת אירועי ה־PTO להקשר השיחה של נועה AI עם תוויות אינדיקציה ברורות
 */
export async function injectPtoContextToPrompt(userQuery: string): Promise<{ contextText: string; fetchedAt: string }> {
  if (!asksCraneOrPto(userQuery)) {
    return { contextText: "", fetchedAt: new Date().toISOString() };
  }

  // זיהוי משאית מתוך השאלה (למשל 615 או 651)
  let truckQuery: string | undefined = undefined;
  if (userQuery.includes("615")) truckQuery = "615-41-002";
  else if (userQuery.includes("651")) truckQuery = "651-51-701";

  const result = await fetchIturanPtoContext(truckQuery);
  const fetchedAt = result.meta?.fetchedAt || new Date().toISOString();

  if (!result.success || !result.events || result.events.length === 0) {
    return {
      contextText: `\n[מידע מערכת - נמצא במאגר | fetchedAt: ${fetchedAt}]: לא נמצאו אירועי PTO (פתיחת מנוף) רשומים במאגר לתקופה האחרונה.`,
      fetchedAt,
    };
  }

  let snippet = `\n[מידע מערכת - נמצא במאגר | fetchedAt: ${fetchedAt}]:\n`;
  snippet += `להלן אירועי פתיחה/סגירת מנוף (PTO) מתוך טאב איתוראן_PTO בגיליון:\n`;

  result.events.slice(0, 8).forEach((ev, idx) => {
    const eventName = ev.eventType === "pto_open" ? "פתיחת מנוף" : ev.eventType === "pto_close" ? "סגירת מנוף" : ev.eventType;
    snippet += `- אירוע ${idx + 1}: משאית ${ev.truck} | נהג: ${ev.driver || "לא צוין"} | ${eventName} בשעה ${ev.eventTimeIso} | כתובת: ${ev.address || "לא צוינה"}\n`;
  });

  snippet += `\nהערה מחייבת: מידע זה מבוסס על התראות PTO במאגר (ולא מעקב GPS חי רציף). שמור על סירוב לבקשות GPS חי.`;

  return { contextText: snippet, fetchedAt };
}
