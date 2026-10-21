// src/lib/smart-dispatch/apps-script-contract.ts
// לקוח תקשורת עמיד ואמין מול Google Apps Script Web App
// חוזה: GET ?action=<health|bootstrap|image>&token=...
// שמירה: POST Content-Type: text/plain עם { action: 'saveDisc', token, row, fix }

export interface ConnectionDiagnostic {
  isHtmlError: true;
  host: string;
  httpStatus: number;
  contentType: string;
  previewSnippet: string; // 200 תווים ראשונים
  reasons: [
    "כתובת פריסה ישנה (Deployment URL לא מעודכנת לאחר שינוי קוד ב-Apps Script)",
    "הגדרת גישה אינה Anyone (נדרשת הרשאת 'Anyone' בפריסת ה-Web App ב-Google)",
    "פונקציית doGet מחזירה HtmlService/HTML במקום ContentService.createTextOutput כ-JSON",
  ];
  timestamp: string;
}

export class ConnectionDiagnosticError extends Error {
  public diagnostic: ConnectionDiagnostic;

  constructor(diag: Omit<ConnectionDiagnostic, "isHtmlError" | "reasons">) {
    super(`בעיית חיבור לשרת Apps Script (${diag.host} - HTTP ${diag.httpStatus})`);
    this.name = "ConnectionDiagnosticError";
    this.diagnostic = {
      isHtmlError: true,
      host: diag.host,
      httpStatus: diag.httpStatus,
      contentType: diag.contentType,
      previewSnippet: diag.previewSnippet,
      reasons: [
        "כתובת פריסה ישנה (Deployment URL לא מעודכנת לאחר שינוי קוד ב-Apps Script)",
        "הגדרת גישה אינה Anyone (נדרשת הרשאת 'Anyone' בפריסת ה-Web App ב-Google)",
        "פונקציית doGet מחזירה HtmlService/HTML במקום ContentService.createTextOutput כ-JSON",
      ],
      timestamp: diag.timestamp,
    };
  }
}

export interface RawDiscRecord {
  _row: number;
  _link?: string;
  "תאריך קליטה"?: string;
  "תאריך דיסקית"?: string;
  'ק"מ פתיחה'?: string | number;
  'ק"מ סגירה'?: string | number;
  'סה"כ ק"מ'?: string | number;
  "קישור לדיסקית"?: string;
  "זמן נסיעה"?: string | number;
  "זמן עבודה"?: string | number;
  "זמן סרק"?: string | number;
  "זמן מנוף"?: string | number;
  נהג?: string;
  "רישוי / משאית"?: string;
  "קובץ מקור"?: string;
  עמוד?: string | number;
  "סטטוס חילוץ"?: string;
  "מפתח ייחודי"?: string;
  "תאריך מתוקן"?: string;
  "משאית מתוקנת"?: string;
  "אושר ע״י"?: string;
  "אושר בתאריך"?: string;
  [key: string]: unknown;
}

export interface RawVisitRecord {
  _row?: number;
  "מפתח ביקור"?: string;
  "תאריך (yyyy-mm-dd)"?: string;
  תאריך?: string;
  משאית?: string;
  נהג?: string;
  עיר?: string;
  כתובת?: string;
  לקוחות?: string;
  תעודות?: string;
  הזמנות?: string;
  "כמות תעודות"?: string | number;
  "חלון מנוף בכתב יד"?: string;
  "פריקה בכתב יד (דק׳)"?: string | number;
  "המתנה בכתב יד (דק׳)"?: string | number;
  "איתוראן: הגעה"?: string;
  "איתוראן: יציאה"?: string;
  "איתוראן: משך עצירה (דק׳)"?: string | number;
  "PTO פתיחה"?: string;
  "PTO סגירה"?: string;
  "PTO משך (דק׳)"?: string | number;
  "ק״מ מהעצירה הקודמת"?: string | number;
  "נסיעה מהעצירה הקודמת (דק׳)"?: string | number;
  "משך באתר לסידור (דק׳)"?: string | number;
  "מקור המדידה"?: string;
  "דגלי איכות"?: string;
  "מפתח אתר"?: string;
  [key: string]: unknown;
}

export interface RawSiteRecord {
  _row?: number;
  "מפתח אתר"?: string;
  עיר?: string;
  כתובת?: string;
  לקוחות?: string;
  ביקורים?: string | number;
  "ביקור אחרון"?: string;
  מדידות?: string | number;
  "באתר חציון (דק׳)"?: string | number;
  "באתר P80 (דק׳)"?: string | number;
  "באתר מקס׳ (דק׳)"?: string | number;
  "נסיעה חציון (דק׳)"?: string | number;
  ביטחון?: string;
  [key: string]: unknown;
}

export interface RawCityRecord {
  _row?: number;
  עיר?: string;
  ביקורים?: string | number;
  מדידות?: string | number;
  "באתר חציון"?: string | number;
  "באתר P80"?: string | number;
  "נסיעה חציון"?: string | number;
  [key: string]: unknown;
}

export interface BootstrapResponse {
  discs: RawDiscRecord[];
  visits: RawVisitRecord[];
  sites: RawSiteRecord[];
  cities: RawCityRecord[];
  user?: string;
}

export interface HealthResponse {
  ok: boolean;
  status: string;
  responseTimeMs: number;
  tabRowCounts: {
    discs: number;
    visits: number;
    sites: number;
    cities: number;
    notes?: number;
  };
  lastDataDate?: string;
  host: string;
}

// -------------------------------------------------------------
// משתני סביבה ומטמון שרת (60 שניות)
// -------------------------------------------------------------

export const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxVFYZsqxGmZsez91TUoii1LM8PALQmtuZebmPU2RK2Ki3ZuZADLGF_8u4OQ5rr4dSigQ/exec";

export function getAppsScriptUrl(): string {
  if (typeof process !== "undefined" && process.env) {
    if (process.env["APPS_SCRIPT_URL"]) return process.env["APPS_SCRIPT_URL"];
    if (process.env["GAS_URL"]) return process.env["GAS_URL"];
  }
  return DEFAULT_APPS_SCRIPT_URL;
}

export function getApiToken(): string {
  if (typeof process !== "undefined" && process.env) {
    return process.env["API_TOKEN"] || "";
  }
  return "";
}

// מטמון זיכרון 60 שניות
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60_000; // 60 seconds

export function clearAppsScriptCache(): void {
  cache.clear();
}

/**
 * קריאת fetch חסינה עם redirect:'follow', timeout של 20 שניות, 2 ניסיונות חוזרים ובדיקת Content-Type
 */
export async function callAppsScript<T>(
  action: string,
  extraParams?: Record<string, string>,
  bypassCache = false,
): Promise<T> {
  const baseUrl = getAppsScriptUrl();
  const token = getApiToken();

  const cacheKey = `${baseUrl}__${action}__${JSON.stringify(extraParams || {})}`;
  if (!bypassCache) {
    const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  let host = "script.google.com";
  try {
    host = new URL(baseUrl).host;
  } catch {
    // fallback
  }

  let lastError: unknown = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = new URL(baseUrl);
      url.searchParams.set("action", action);
      if (token) url.searchParams.set("token", token);
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams)) {
          if (v !== undefined) url.searchParams.set(k, v);
        }
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(20_000), // 20 שניות timeout
      });

      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();

      // אם התשובה היא HTML או שאינה JSON - זורקים אבחון ברור לפי סעיף 2.4
      const trimmed = text.trim();
      const isHtml =
        contentType.includes("text/html") ||
        trimmed.startsWith("<!DOCTYPE") ||
        trimmed.startsWith("<html") ||
        trimmed.startsWith("<!doctype");

      if (isHtml) {
        const previewSnippet = text.slice(0, 200);
        throw new ConnectionDiagnosticError({
          host,
          httpStatus: res.status,
          contentType: contentType || "text/html",
          previewSnippet,
          timestamp: new Date().toISOString(),
        });
      }

      let parsed: { ok?: boolean; data?: T; error?: string } | T;
      try {
        parsed = JSON.parse(text);
      } catch {
        const previewSnippet = text.slice(0, 200);
        throw new ConnectionDiagnosticError({
          host,
          httpStatus: res.status,
          contentType: contentType || "unknown",
          previewSnippet,
          timestamp: new Date().toISOString(),
        });
      }

      // אם החוזה עטוף ב-{ ok: boolean, data?: any, error?: string }
      if (typeof parsed === "object" && parsed !== null && "ok" in parsed) {
        if (!parsed.ok) {
          throw new Error(parsed.error || "שגיאה שהוחזרה מ-Apps Script");
        }
        const data = (parsed.data !== undefined ? parsed.data : parsed) as T;
        cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      }

      cache.set(cacheKey, { data: parsed as T, timestamp: Date.now() });
      return parsed as T;
    } catch (err) {
      lastError = err;
      if (err instanceof ConnectionDiagnosticError) {
        // לא מנסים שוב שגיאת HTML כי מדובר בפריסה שגויה
        throw err;
      }
      if (attempt < maxRetries) {
        // השהיית backoff
        await new Promise((r) => setTimeout(r, (attempt + 1) * 600));
      }
    }
  }

  throw lastError || new Error("כשל בתקשורת מול Apps Script");
}

/**
 * שמירת דיסקית בגיליון: POST Content-Type: text/plain
 */
export async function saveDiscFix(params: {
  row: number;
  fix: {
    date?: string;
    plate?: string;
    approve?: boolean;
    approver?: string;
  };
}): Promise<{ ok: boolean; message?: string }> {
  const baseUrl = getAppsScriptUrl();
  const token = getApiToken();

  const payload = {
    action: "saveDisc",
    token,
    row: params.row,
    fix: params.fix,
  };

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    clearAppsScriptCache();
    return data;
  } catch {
    throw new Error(`שגיאה בשמירת דיסקית (HTTP ${res.status}): ${text.slice(0, 100)}`);
  }
}
