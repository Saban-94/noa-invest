// src/lib/smart-dispatch/sheets-integration.ts
// אינטגרציה מול Google Sheets API עם batchUpdate ו-batchGet
// Sheet ID: 1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw ("בדיקת תעודות משלוח")

import type {
  GalyaDeliveryNote,
  VisitRecord,
  CustomerSiteRecord,
  CitySummaryRecord,
  ErrorLogRecord,
  MeasurementSource,
} from "./types";
import { describeError } from "../describe-error";
import { SAMPLE_GALYA_NOTES, SAMPLE_VISITS } from "./fixtures";
import { buildCustomerSitesSummary, buildCitiesSummary } from "./estimation-engine";

export const MASTER_SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";

export const TAB_NAMES = {
  GALYA_ARCHIVE: "ארכיון_תעודות_גליה",
  TACHOGRAPH_ARCHIVE: "ארכיון_טכוגרף",
  VISITS_HISTORY: "היסטוריית_ביקורים",
  CUSTOMER_SITES: "אתרי_לקוחות",
  CITIES_SUMMARY: "סיכום_ערים",
  ERROR_LOG: "לוג_שגיאות",
} as const;

export const INJECTED_COLUMNS = [
  "משך באתר",
  "נסיעה",
  'ק"מ נסיעה',
  "הגעה",
  "יציאה",
  "PTO פתיחה",
  "PTO סגירה",
  "PTO דק'",
  "מקור מדידה",
  "מפתח ביקור",
] as const;

export const VISITS_COLUMNS = [
  "מפתח ביקור",
  "תאריך",
  "משאית",
  "נהג",
  "עיר",
  "כתובת",
  "לקוחות",
  "תעודות",
  "הזמנות",
  "כמות תעודות",
  "חלון מנוף בכתב יד",
  "פריקה בכתב יד",
  "המתנה בכתב יד",
  "איתוראן: הגעה",
  "איתוראן: יציאה",
  "איתוראן: משך עצירה",
  "PTO פתיחה",
  "PTO סגירה",
  "PTO משך",
  'ק"מ מהעצירה הקודמת',
  "נסיעה",
  "משך באתר לסידור",
  "מקור המדידה",
  "דגלי איכות",
  "מפתח אתר",
] as const;

// זיכרון מטמון שרתי
let inMemoryNotes: GalyaDeliveryNote[] = [...SAMPLE_GALYA_NOTES];
let inMemoryVisits: VisitRecord[] = [...SAMPLE_VISITS];
const inMemoryLogs: ErrorLogRecord[] = [];

/**
 * כתיבת שגיאה ללוג שגיאות
 */
export async function logErrorToSheet(
  component: string,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const fullMessage = describeError(error);
  const logEntry: ErrorLogRecord = {
    timestamp: new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
    component,
    message: fullMessage,
    stack: error instanceof Error ? error.stack : undefined,
    context,
  };

  inMemoryLogs.unshift(logEntry);
  console.error(`[לוג_שגיאות - ${component}]`, fullMessage, context);

  // אם מוגדר טוקן שירות של גוגל, נבצע batch כתיבה
  const creds = getGoogleCredentials();
  if (creds) {
    try {
      await appendRowToGoogleSheet(MASTER_SHEET_ID, TAB_NAMES.ERROR_LOG, [
        logEntry.timestamp,
        logEntry.component,
        logEntry.message,
        JSON.stringify(context || {}),
      ]);
    } catch (sheetErr) {
      console.warn("[Sheets] לא ניתן לכתוב לטאב לוג_שגיאות ישירות ב-Sheets:", sheetErr);
    }
  }
}

/**
 * שליפת כל תעודות המשלוח מ-ארכיון_תעודות_גליה
 */
export async function fetchGalyaArchiveNotes(): Promise<GalyaDeliveryNote[]> {
  const creds = getGoogleCredentials();
  if (!creds) {
    return inMemoryNotes;
  }

  try {
    const rawRows = await readGoogleSheetBatch(MASTER_SHEET_ID, `${TAB_NAMES.GALYA_ARCHIVE}!A1:AG`);
    if (!rawRows || rawRows.length < 2) {
      return inMemoryNotes;
    }

    const headers = rawRows[0] as string[];
    const notes: GalyaDeliveryNote[] = [];

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i] as string[];
      if (!row || row.length === 0) continue;

      const getCol = (name: string): string => {
        const idx = headers.indexOf(name);
        return idx !== -1 ? String(row[idx] ?? "").trim() : "";
      };

      const noteId = getCol("מס' תעודת משלוח");
      if (!noteId) continue;

      notes.push({
        receiptDate: getCol("תאריך קליטה"),
        docDate: getCol("תאריך תעודה") || "15/10/2026",
        docTime: getCol("שעת תעודה"),
        noteId,
        orderId: getCol("מס' הזמנה"),
        customerNo: getCol("מס' לקוח"),
        customerName: getCol("שם לקוח"),
        deliveryAddress: getCol("כתובת אספקה"),
        driverRaw: getCol("נהג"),
        truckRaw: getCol("רישוי / משאית"),
        docLink: getCol("קישור לתעודה"),
        itemsSummary: getCol("פריטים"),
        depositsSummary: getCol("פיקדונות"),
        craneTimeRaw: getCol("זמני מנוף / המתנה"),
        sourceFile: getCol("קובץ מקור"),
        page: getCol("עמוד"),
        extractStatus: getCol("סטטוס חילוץ"),
        uniqueKey: getCol("מפתח ייחודי"),
        approvalStatus: getCol("סטטוס אישור"),
        signedLink: getCol("קישור חתום"),
        ramiApproval: getCol("אישור ראמי"),
        harelApproval: getCol("אישור הראל"),
        approvalNote: getCol("הערת אישור"),

        // שדות מוזרקים
        injectedSiteDurationMin: parseFloat(getCol("משך באתר") || "0") || undefined,
        injectedTravelMin: parseFloat(getCol("נסיעה") || "0") || undefined,
        injectedTravelKm: parseFloat(getCol('ק"מ נסיעה') || "0") || undefined,
        injectedArriveTime: getCol("הגעה") || undefined,
        injectedDepartTime: getCol("יציאה") || undefined,
        injectedPtoOpen: getCol("PTO פתיחה") || undefined,
        injectedPtoClose: getCol("PTO סגירה") || undefined,
        injectedPtoMin: parseFloat(getCol("PTO דק'") || "0") || undefined,
        injectedMeasurementSource: (getCol("מקור מדידה") as MeasurementSource) || undefined,
        injectedVisitKey: getCol("מפתח ביקור") || undefined,
      });
    }

    if (notes.length > 0) {
      inMemoryNotes = notes;
      return notes;
    }
  } catch (err) {
    await logErrorToSheet("fetchGalyaArchiveNotes", err);
  }

  return inMemoryNotes;
}

/**
 * שליפת כל הביקורים (Visits)
 */
export async function fetchAllVisits(): Promise<VisitRecord[]> {
  return inMemoryVisits;
}

/**
 * כתיבה אידמפוטנטית של ביקורים ותעודות מעודכנות לגיליון
 */
export async function syncSmartDispatchData(
  updatedNotes: GalyaDeliveryNote[],
  updatedVisits: VisitRecord[],
): Promise<{ success: boolean; visitsCount: number; notesCount: number }> {
  inMemoryNotes = updatedNotes;
  inMemoryVisits = updatedVisits;

  const sitesSummary = buildCustomerSitesSummary(updatedVisits);
  const citiesSummary = buildCitiesSummary(updatedVisits);

  const creds = getGoogleCredentials();
  if (creds) {
    try {
      // 1. כתיבת היסטוריית_ביקורים (batchUpdate)
      const visitRows = [
        [...VISITS_COLUMNS],
        ...updatedVisits.map((v) => [
          v.visitKey,
          v.date,
          v.truck,
          v.driver,
          v.city,
          v.streetAndNum,
          v.customers.join(", "),
          v.noteIds.join(", "),
          v.orderIds.join(", "),
          v.notesCount,
          v.handwrittenCraneRaw || "",
          v.handwrittenUnloadMin || 0,
          v.handwrittenWaitingMin || 0,
          v.ituranArriveTime || "",
          v.ituranDepartTime || "",
          v.ituranDurationMin || 0,
          v.ptoOpenTime || "",
          v.ptoCloseTime || "",
          v.ptoDurationMin || 0,
          v.driveKm || 0,
          v.driveMin || 0,
          v.finalSiteDurationMin,
          v.measurementSource,
          v.qualityFlags.join(" | "),
          v.siteKey,
        ]),
      ];
      await writeGoogleSheetBatch(MASTER_SHEET_ID, `${TAB_NAMES.VISITS_HISTORY}!A1:Y`, visitRows);

      // 2. כתיבת אתרי_לקוחות
      const siteRows = [
        [
          "מפתח אתר",
          "עיר",
          "כתובת",
          "מס' לקוח",
          "שם לקוח",
          "כמות ביקורים",
          "P50 משך באתר",
          "P80 תכנון בטוח",
          "מקסימום דקות",
          "חציון נסיעה",
          "רמת ביטחון",
          "תאריך ביקור אחרון",
        ],
        ...sitesSummary.map((s) => [
          s.siteKey,
          s.city,
          s.address,
          s.customerNo || "",
          s.customerName || "",
          s.visitsCount,
          s.medianDurationMin,
          s.p80DurationMin,
          s.maxDurationMin,
          s.medianDriveMin,
          s.confidence,
          s.lastVisitDate,
        ]),
      ];
      await writeGoogleSheetBatch(MASTER_SHEET_ID, `${TAB_NAMES.CUSTOMER_SITES}!A1:L`, siteRows);

      // 3. כתיבת סיכום_ערים
      const cityRows = [
        [
          "עיר",
          "כמות ביקורים",
          "חציון משך באתר",
          "P80 משך באתר",
          "חציון נסיעה",
          "כמות אתרים פעילים",
        ],
        ...citiesSummary.map((c) => [
          c.city,
          c.visitsCount,
          c.medianDurationMin,
          c.p80DurationMin,
          c.medianDriveMin,
          c.sitesCount,
        ]),
      ];
      await writeGoogleSheetBatch(MASTER_SHEET_ID, `${TAB_NAMES.CITIES_SUMMARY}!A1:F`, cityRows);
    } catch (err) {
      await logErrorToSheet("syncSmartDispatchData", err);
      return { success: false, visitsCount: updatedVisits.length, notesCount: updatedNotes.length };
    }
  }

  return {
    success: true,
    visitsCount: updatedVisits.length,
    notesCount: updatedNotes.length,
  };
}

/**
 * שליפת לוג שגיאות
 */
export function getErrorLogs(): ErrorLogRecord[] {
  return inMemoryLogs;
}

// -------------------------------------------------------------
// עזרי תקשורת מול Google Sheets REST API עם Service Account
// -------------------------------------------------------------

function getGoogleCredentials(): { email: string; privateKey: string } | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GCP_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY || process.env.GCP_PRIVATE_KEY;
  if (email && privateKey) {
    return { email, privateKey: privateKey.replace(/\\n/g, "\n") };
  }
  return null;
}

/** קריאת טווח מגיליון — מיוצא לשימוש ב-customer-history.server */
export async function readGoogleSheetBatch(sheetId: string, range: string): Promise<unknown[][] | null> {
  const token = await getGoogleAccessToken();
  if (!token) return null;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Sheets API read error: HTTP ${res.status}`);
  const json = await res.json();
  return json.values || [];
}

async function writeGoogleSheetBatch(
  sheetId: string,
  range: string,
  values: unknown[][],
): Promise<void> {
  const token = await getGoogleAccessToken();
  if (!token) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets API write error: ${errText}`);
  }
}

async function appendRowToGoogleSheet(
  sheetId: string,
  tabName: string,
  rowValues: unknown[],
): Promise<void> {
  const token = await getGoogleAccessToken();
  if (!token) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName)}:append?valueInputOption=USER_ENTERED`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [rowValues] }),
  });
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string | null> {
  const creds = getGoogleCredentials();
  if (!creds) return null;

  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token;
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: creds.email,
      scope:
        "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.modify",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    };

    const token = await signServiceAccountJwt(creds.email, creds.privateKey, claim);
    if (!token) return null;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: token,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      };
      return data.access_token;
    }
  } catch (err) {
    console.warn("[Google Auth] Could not generate Service Account token:", err);
  }

  return null;
}

async function signServiceAccountJwt(
  email: string,
  pemKey: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const header = { alg: "RS256", typ: "JWT" };
    const b64Header = base64UrlEncode(JSON.stringify(header));
    const b64Payload = base64UrlEncode(JSON.stringify(payload));
    const dataToSign = `${b64Header}.${b64Payload}`;

    const cleanPem = pemKey
      .replace(/-----BEGIN[A-Z\s]+-----/g, "")
      .replace(/-----END[A-Z\s]+-----/g, "")
      .replace(/\s+/g, "");

    const binaryKey = Uint8Array.from(atob(cleanPem), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(dataToSign),
    );

    const b64Signature = base64UrlEncodeBuffer(new Uint8Array(signature));
    return `${dataToSign}.${b64Signature}`;
  } catch (err) {
    console.warn("[JWT] RS256 signing failed:", err);
    return null;
  }
}

function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeBuffer(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) {
    bin += String.fromCharCode(buf[i]!);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
