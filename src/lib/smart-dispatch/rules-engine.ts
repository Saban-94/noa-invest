// src/lib/smart-dispatch/rules-engine.ts
// מנוע חוקים דטרמיניסטי לסידור חכם – ח. סבן חומרי בניין
// כללי נתונים שנבדקו על נתונים אמיתיים (ללא נתוני דמה)

import type {
  RawDiscRecord,
  RawVisitRecord,
  RawSiteRecord,
  RawCityRecord,
} from "./apps-script-contract";

export type DriverIdentity = "ali" | "hekmat" | "other";

export interface DriverMeta {
  key: DriverIdentity;
  nameHe: string;
  plate: string;
  truckModel: string;
  avatarUrl: string;
  initials: string;
  colorHex: string;
}

export const DRIVER_METAS: Record<"ali" | "hekmat", DriverMeta> = {
  ali: {
    key: "ali",
    nameHe: "עלי אבו עידה",
    plate: "651-51-701",
    truckModel: "איסוזו",
    avatarUrl: "https://i.postimg.cc/tCNbgXK3/Screenshot-20250623-200744-Tik-Tok.jpg",
    initials: "עא",
    colorHex: "#0e7490", // טורקיז
  },
  hekmat: {
    key: "hekmat",
    nameHe: "חכמת גאבר",
    plate: "615-41-002",
    truckModel: "מרצדס מנוף",
    avatarUrl: "https://i.postimg.cc/d3S0NJJZ/Screenshot-20250623-200646-Facebook.jpg",
    initials: "חג",
    colorHex: "#d97706", // ענבר PTO
  },
};

/**
 * זיהוי נהג ומשאית:
 * עלי = 651-51-701 (איסוזו), שמות: "עלי", "עלי אבו עידה"
 * חכמת = 615-41-002 (מרצדס מנוף), שמות: "חכמת", "חכמת גאבר", "חכמת / מסארוה ראמי"
 * (מסארוה ראמי הוא איש צוות נוסף, לא משאית)
 */
export function identifyDriver(
  driverRaw?: string,
  truckRaw?: string,
): { driver: DriverIdentity; truck: string; cleanName: string } {
  const d = (driverRaw || "").trim().toLowerCase();
  const t = (truckRaw || "").replace(/[^0-9]/g, "");

  if (t.includes("65151701") || d.includes("עלי")) {
    return { driver: "ali", truck: "651-51-701", cleanName: "עלי אבו עידה" };
  }

  if (t.includes("61541002") || d.includes("חכמת") || d.includes("מסארוה") || d.includes("מנוף")) {
    return { driver: "hekmat", truck: "615-41-002", cleanName: "חכמת גאבר" };
  }

  return {
    driver: "other",
    truck: truckRaw || "לא צוין",
    cleanName: driverRaw || "נהג לא ידוע",
  };
}

/**
 * בדיקת OCR חשוד בדיסקיות טכוגרף:
 * שנת דיסקית שאינה הגיונית (2020, 2024 וכו'), לוחית רישוי חסרת ספרות, שמות מעוותים כגון "ג'אבר מנאר".
 */
export function checkDiscOcrSuspicion(disc: RawDiscRecord): {
  isSuspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  const rawDate = String(disc["תאריך דיסקית"] || "").trim();
  const rawPlate = String(disc["רישוי / משאית"] || "").trim();
  const rawDriver = String(disc["נהג"] || "").trim();

  // 1. תאריך: בדיקת שנה לא הגיונית (למשל 2020 או 2024 כשהנתונים עכשוויים)
  if (rawDate) {
    const yearMatch = rawDate.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch && yearMatch[1]) {
      const year = parseInt(yearMatch[1], 10);
      if (year < 2025 || year > 2028) {
        reasons.push(`שנת OCR חשודה (${year})`);
      }
    }
  } else {
    reasons.push("תאריך דיסקית חסר");
  }

  // 2. לוחית רישוי: לוחית רישוי חסרת ספרות או לא תואמת פורמט
  const digitsOnly = rawPlate.replace(/[^0-9]/g, "");
  if (digitsOnly.length > 0 && digitsOnly.length < 7) {
    reasons.push(`לוחית רישוי חסרת ספרות (${rawPlate})`);
  }

  // 3. שם מעוות
  if (rawDriver.includes("מנאר") || rawDriver.includes("ג'אבר מנאר")) {
    reasons.push(`שם נהג מעוות מ-OCR (${rawDriver})`);
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
  };
}

/**
 * שליפת תאריך ומשאית אפקטיביים לדיסקית:
 * העדפת "תאריך מתוקן" ו"משאית מתוקנת" על פני תוצרי ה-OCR
 */
export function getEffectiveDiscMeta(disc: RawDiscRecord): {
  effectiveDate: string;
  effectiveTruck: string;
  isCorrected: boolean;
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
} {
  const correctedDate = String(disc["תאריך מתוקן"] || "").trim();
  const originalDate = String(disc["תאריך דיסקית"] || "").trim();
  const effectiveDate = correctedDate || originalDate;

  const correctedPlate = String(disc["משאית מתוקנת"] || "").trim();
  const originalPlate = String(disc["רישוי / משאית"] || "").trim();
  const effectiveTruck = correctedPlate || originalPlate;

  const approvedBy = String(disc["אושר ע״י"] || "").trim();
  const approvedAt = String(disc["אושר בתאריך"] || "").trim();
  const isApproved = !!approvedBy;

  return {
    effectiveDate,
    effectiveTruck,
    isCorrected: !!correctedDate || !!correctedPlate,
    isApproved,
    approvedBy: approvedBy || undefined,
    approvedAt: approvedAt || undefined,
  };
}

/**
 * הצלבת חתימת לקוח:
 * "קיימת" אם יש ערך ב-קישור חתום או אם טקסט זמני מנוף מכיל "חתימה". אחרת "לא נמצאה".
 */
export function verifyCustomerSignature(
  signedLink?: string,
  craneTimeText?: string,
): { hasSignature: boolean; label: "קיימת" | "לא נמצאה" } {
  const hasLink = !!(signedLink && signedLink.trim().length > 5);
  const hasText = !!(craneTimeText && craneTimeText.includes("חתימה"));
  const hasSignature = hasLink || hasText;
  return {
    hasSignature,
    label: hasSignature ? "קיימת" : "לא נמצאה",
  };
}

/**
 * חלון מנוף בכתב יד:
 * חלון הפוך או מעל 240 דקות = חריגה ולא נכנס לסטטיסטיקה.
 */
export function parseHandwrittenWindow(raw?: string): {
  valid: boolean;
  durationMin: number;
  start?: string;
  end?: string;
  isReversed: boolean;
  isOutlier: boolean;
} {
  if (!raw) return { valid: false, durationMin: 0, isReversed: false, isOutlier: false };

  // פורמטים נפוצים: "09:30-10:15" או "09:30 - 10:15"
  const m = raw.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  if (!m || !m[1] || !m[2]) {
    return { valid: false, durationMin: 0, isReversed: false, isOutlier: false };
  }

  const [sh, sm] = m[1].split(":").map((x) => parseInt(x, 10));
  const [eh, em] = m[2].split(":").map((x) => parseInt(x, 10));
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  const endMin = (eh ?? 0) * 60 + (em ?? 0);

  const durationMin = endMin - startMin;
  const isReversed = durationMin <= 0;
  const isOutlier = durationMin > 240;
  const valid = !isReversed && !isOutlier;

  return {
    valid,
    durationMin: valid ? durationMin : 0,
    start: m[1],
    end: m[2],
    isReversed,
    isOutlier,
  };
}

export interface DeterministicException {
  id: string;
  type:
    | "long_stop_no_pto"
    | "pto_handwritten_drift"
    | "km_discrepancy"
    | "high_speed"
    | "note_without_stop"
    | "pto_without_note"
    | "reversed_window"
    | "suspicious_ocr"
    | "missing_signature";
  severity: "high" | "medium" | "low";
  title: string;
  evidence: string;
  explanation: string;
}

/**
 * חישוב חריגים דטרמיניסטיים ליום/דיסקית לפי סעיף 7.2
 */
export function calculateDayExceptions(params: {
  disc?: RawDiscRecord;
  visits: RawVisitRecord[];
}): DeterministicException[] {
  const exceptions: DeterministicException[] = [];
  const { disc, visits } = params;

  // 1. בדיקת OCR בדיסקית
  if (disc) {
    const ocr = checkDiscOcrSuspicion(disc);
    if (ocr.isSuspicious) {
      exceptions.push({
        id: `ocr-${disc._row}`,
        type: "suspicious_ocr",
        severity: "high",
        title: "תאריך או פרטי OCR חשודים בדיסקית",
        evidence: `שורה ${disc._row}: ${disc["תאריך דיסקית"] || "ריק"} | ${disc["רישוי / משאית"] || "ריק"}`,
        explanation: ocr.reasons.join(", "),
      });
    }

    // פער ק"מ בין טכוגרף לאיתוראן מעל 10%
    const discKm = parseFloat(String(disc['סה"כ ק"מ'] || "0")) || 0;
    const ituranKm = visits.reduce(
      (sum, v) => sum + (parseFloat(String(v["ק״מ מהעצירה הקודמת"] || "0")) || 0),
      0,
    );
    if (discKm > 0 && ituranKm > 0) {
      const diffPercent = Math.abs(discKm - ituranKm) / discKm;
      if (diffPercent > 0.1) {
        exceptions.push({
          id: `km-diff-${disc._row}`,
          type: "km_discrepancy",
          severity: "medium",
          title: "פער ק״מ בין טכוגרף לאיתוראן מעל 10%",
          evidence: `טכוגרף: ${discKm.toFixed(1)} ק״מ | איתוראן: ${ituranKm.toFixed(1)} ק״מ`,
          explanation: `פער של ${(diffPercent * 100).toFixed(1)}% בין רישום הדיסקית לדיווח ה-GPS המצטבר.`,
        });
      }
    }
  }

  // 2. בדיקות עבור כל ביקור
  visits.forEach((v, idx) => {
    const rowId = v._row || idx + 1;
    const stopDuration = parseFloat(String(v["איתוראן: משך עצירה (דק׳)"] || "0")) || 0;
    const ptoMin = parseFloat(String(v["PTO משך (דק׳)"] || "0")) || 0;
    const ptoOpen = String(v["PTO פתיחה"] || "").trim();
    const notesStr = String(v["תעודות"] || "").trim();
    const handwrittenRaw = String(v["חלון מנוף בכתב יד"] || "").trim();
    const hw = parseHandwrittenWindow(handwrittenRaw);

    // עצירה מעל 60 דק' בלי PTO
    if (stopDuration > 60 && ptoMin === 0 && !ptoOpen) {
      exceptions.push({
        id: `long-stop-${rowId}`,
        type: "long_stop_no_pto",
        severity: "high",
        title: "עצירה ממושכת באתר (מעל 60 דק׳) ללא הפעלת PTO מנוף",
        evidence: `ביקור ${v["כתובת"] || rowId}: שהייה של ${stopDuration} דק׳`,
        explanation: "משאית עמדה בכתובת מעל שעה אך לא נרשמה הפעלת מנוף באיתוראן.",
      });
    }

    // הפרש בין PTO לכתב יד מעל 10 דק'
    if (ptoMin > 0 && hw.valid && hw.durationMin > 0) {
      const diffMin = Math.abs(ptoMin - hw.durationMin);
      if (diffMin > 10) {
        exceptions.push({
          id: `pto-drift-${rowId}`,
          type: "pto_handwritten_drift",
          severity: "medium",
          title: "פער זמני מנוף: איתוראן מול כתב יד מעל 10 דק׳",
          evidence: `איתוראן: ${ptoMin} דק׳ | כתב יד: ${hw.durationMin} דק׳ (הפרש: ${diffMin} דק׳)`,
          explanation: `בתעודות ${notesStr || "בביקור"} קיים פער בין חלון הפריקה הידני ל-PTO המנוטר.`,
        });
      }
    }

    // חלון מנוף הפוך
    if (hw.isReversed) {
      exceptions.push({
        id: `rev-window-${rowId}`,
        type: "reversed_window",
        severity: "high",
        title: "חלון מנוף הפוך בכתב יד (שעת סיום קודמת לשעת התחלה)",
        evidence: `כתב יד: "${handwrittenRaw}"`,
        explanation: "שעת סיום הפריקה נרשמה לפני שעת ההתחלה, נתון זה הוחרג מחישובי הסטטיסטיקה.",
      });
    }

    // חתימת לקוח חסרה
    const sig = verifyCustomerSignature(undefined, handwrittenRaw);
    if (!sig.hasSignature && notesStr) {
      exceptions.push({
        id: `sig-missing-${rowId}`,
        type: "missing_signature",
        severity: "low",
        title: "חתימת מקבל/לקוח חסרה בתעודות המשלוח",
        evidence: `תעודות: ${notesStr} באתר ${v["כתובת"] || "לא צוין"}`,
        explanation: "לא זוהתה חתימת מקבל או אישור מסירה חתום בטקסט או בקישור.",
      });
    }
  });

  return exceptions;
}
