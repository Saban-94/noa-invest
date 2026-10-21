// src/lib/smart-dispatch/estimation-engine.ts
// מנוע הערכת זמני פריקה וסידור לסדרן (P50, P80) לפי היררכיית דגימה

import type {
  VisitRecord,
  EstimationRequest,
  EstimationResult,
  CustomerSiteRecord,
  CitySummaryRecord,
} from "./types";
import { normalizeAddressToSiteKey, parseAddressComponents } from "./cross-matcher";

/**
 * חישוב פרצנטיל (Percentile) באמצעות אינטרפולציה לינארית
 * @param values מערך מספרים
 * @param p ערך בין 0 ל-100 (למשל 50 עבור חציון, 80 עבור P80)
 */
export function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 20;
  if (values.length === 1) return values[0]!;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sorted[lower]!;
  }

  const val = sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
  return Math.round(val);
}

/**
 * מנוע הערכה לסדרן
 */
export function estimateDispatchTime(
  req: EstimationRequest,
  visits: VisitRecord[],
  truckDailySchedules?: { truck: string; stops: { arrive: string; depart: string }[] }[],
): EstimationResult {
  const normSiteKey = normalizeAddressToSiteKey(req.address);
  const { city: parsedCity } = parseAddressComponents(req.address || req.city);
  const targetCity = (req.city || parsedCity || "").trim();
  const targetCustomerNo = (req.customerNo || "").trim();

  // 1. סינון ביקורים לפי רמות ההיררכיה
  // רמה 1: אתר ספציפי
  const siteVisits = visits.filter(
    (v) => v.siteKey === normSiteKey || (v.fullAddress && normalizeAddressToSiteKey(v.fullAddress) === normSiteKey),
  );

  // רמה 2: לקוח (לפי מספר לקוח או שם)
  const customerVisits = visits.filter((v) => {
    if (targetCustomerNo && v.customerNumbers?.includes(targetCustomerNo)) return true;
    return false;
  });

  // רמה 3: עיר
  const cityVisits = visits.filter((v) => {
    if (!targetCity) return false;
    return v.city === targetCity || v.fullAddress.includes(targetCity);
  });

  // בחירת רמת ההיררכיה הראשונה עם מספיק מדידות
  let chosenVisits: VisitRecord[] = [];
  let hierarchyLevel: "אתר" | "לקוח" | "עיר" | "כלל הצי" | "ברירת מחדל" = "ברירת מחדל";

  if (siteVisits.length >= 1) {
    chosenVisits = siteVisits;
    hierarchyLevel = "אתר";
  } else if (customerVisits.length >= 1) {
    chosenVisits = customerVisits;
    hierarchyLevel = "לקוח";
  } else if (cityVisits.length >= 3) {
    chosenVisits = cityVisits;
    hierarchyLevel = "עיר";
  } else if (visits.length > 0) {
    chosenVisits = visits;
    hierarchyLevel = "כלל הצי";
  } else {
    hierarchyLevel = "ברירת מחדל";
  }

  const durations = chosenVisits
    .map((v) => v.finalSiteDurationMin)
    .filter((d) => typeof d === "number" && d > 0);

  const drives = chosenVisits
    .map((v) => v.driveMin)
    .filter((d): d is number => typeof d === "number" && d > 0);

  // חישוב P50, P80
  const p50DurationMin = durations.length > 0 ? calculatePercentile(durations, 50) : 20;
  const p80DurationMin = durations.length > 0 ? calculatePercentile(durations, 80) : 35;
  const medianDriveMin = drives.length > 0 ? calculatePercentile(drives, 50) : 25;

  const totalP50Min = p50DurationMin + medianDriveMin;
  const totalP80Min = p80DurationMin + medianDriveMin;

  const sampleCount = durations.length;

  // רמת ביטחון:
  // גבוהה = אתר או לקוח עם >= 4 מדידות
  // בינונית = אתר או לקוח עם 2-3 מדידות
  // נמוכה = אחרת (עיר, כלל הצי, ברירת מחדל, או 1 מדידה)
  let confidence: "high" | "medium" | "low" = "low";
  if ((hierarchyLevel === "אתר" || hierarchyLevel === "לקוח") && sampleCount >= 4) {
    confidence = "high";
  } else if ((hierarchyLevel === "אתר" || hierarchyLevel === "לקוח") && sampleCount >= 2 && sampleCount <= 3) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // 6 הביקורים האחרונים (תאריך, דקות, מקור)
  const sortedRecent = [...chosenVisits].sort((a, b) => {
    // מיון לפי תאריך יורד
    const [d1, m1, y1] = a.date.split(/[/.-]/).map(Number);
    const [d2, m2, y2] = b.date.split(/[/.-]/).map(Number);
    const t1 = new Date(y1 ?? 2026, (m1 ?? 1) - 1, d1 ?? 1).getTime();
    const t2 = new Date(y2 ?? 2026, (m2 ?? 1) - 1, d2 ?? 1).getTime();
    return t2 - t1;
  });

  const recentVisits = sortedRecent.slice(0, 6).map((v) => ({
    date: v.date,
    minutes: v.finalSiteDurationMin,
    source: v.measurementSource,
    truck: v.truck,
    noteId: v.noteIds[0],
  }));

  // חישוב חלונות פנויים בסידור אם נתון לוח עבודה
  const suggestedFreeWindows: {
    truck: string;
    from: string;
    to: string;
    availableMinutes: number;
  }[] = [];

  if (truckDailySchedules && truckDailySchedules.length > 0) {
    const workStartMin = 7 * 60 + 0; // 07:00
    const workEndMin = 17 * 60 + 0; // 17:00

    for (const sched of truckDailySchedules) {
      // מיון עצירות היום לפי שעת הגעה
      const sortedStops = [...sched.stops].sort((a, b) => {
        const [ah, am] = (a.arrive || "08:00").split(":").map(Number);
        const [bh, bm] = (b.arrive || "08:00").split(":").map(Number);
        return (ah || 0) * 60 + (am || 0) - ((bh || 0) * 60 + (bm || 0));
      });

      let currentMin = workStartMin;
      for (const st of sortedStops) {
        const [ah, am] = (st.arrive || "08:00").split(":").map(Number);
        const [dh, dm] = (st.depart || "08:30").split(":").map(Number);
        const stopStart = (ah || 0) * 60 + (am || 0);
        const stopEnd = (dh || 0) * 60 + (dm || 0);

        if (stopStart - currentMin >= totalP80Min) {
          const fromH = Math.floor(currentMin / 60);
          const fromM = currentMin % 60;
          const toH = Math.floor(stopStart / 60);
          const toM = stopStart % 60;
          suggestedFreeWindows.push({
            truck: sched.truck,
            from: `${String(fromH).padStart(2, "0")}:${String(fromM).padStart(2, "0")}`,
            to: `${String(toH).padStart(2, "0")}:${String(toM).padStart(2, "0")}`,
            availableMinutes: stopStart - currentMin,
          });
        }
        currentMin = Math.max(currentMin, stopEnd);
      }

      if (workEndMin - currentMin >= totalP80Min) {
        const fromH = Math.floor(currentMin / 60);
        const fromM = currentMin % 60;
        const toH = Math.floor(workEndMin / 60);
        const toM = workEndMin % 60;
        suggestedFreeWindows.push({
          truck: sched.truck,
          from: `${String(fromH).padStart(2, "0")}:${String(fromM).padStart(2, "0")}`,
          to: `${String(toH).padStart(2, "0")}:${String(toM).padStart(2, "0")}`,
          availableMinutes: workEndMin - currentMin,
        });
      }
    }
  }

  return {
    p50DurationMin,
    p80DurationMin,
    medianDriveMin,
    totalP50Min,
    totalP80Min,
    sampleCount,
    confidence,
    hierarchyLevel,
    recentVisits,
    suggestedFreeWindows,
  };
}

/**
 * בניית טאב אתרי_לקוחות מתוך כלל הביקורים
 */
export function buildCustomerSitesSummary(visits: VisitRecord[]): CustomerSiteRecord[] {
  const bySite = new Map<string, VisitRecord[]>();

  for (const v of visits) {
    if (!v.siteKey) continue;
    const existing = bySite.get(v.siteKey);
    if (!existing) {
      bySite.set(v.siteKey, [v]);
    } else {
      existing.push(v);
    }
  }

  const results: CustomerSiteRecord[] = [];

  for (const [siteKey, siteVisits] of bySite.entries()) {
    const first = siteVisits[0]!;
    const durations = siteVisits.map((v) => v.finalSiteDurationMin).filter((d) => d > 0);
    const drives = siteVisits.map((v) => v.driveMin).filter((d): d is number => typeof d === "number" && d > 0);

    const medianDurationMin = durations.length > 0 ? calculatePercentile(durations, 50) : 20;
    const p80DurationMin = durations.length > 0 ? calculatePercentile(durations, 80) : 35;
    const maxDurationMin = durations.length > 0 ? Math.max(...durations) : 35;
    const medianDriveMin = drives.length > 0 ? calculatePercentile(drives, 50) : 25;

    const confidence: "high" | "medium" | "low" =
      siteVisits.length >= 4 ? "high" : siteVisits.length >= 2 ? "medium" : "low";

    const sorted = [...siteVisits].sort((a, b) => (b.date > a.date ? 1 : -1));
    const recentDurations = sorted.slice(0, 6).map((v) => ({
      date: v.date,
      minutes: v.finalSiteDurationMin,
      source: v.measurementSource,
    }));

    results.push({
      siteKey,
      city: first.city,
      address: first.fullAddress,
      customerNo: first.customerNumbers[0],
      customerName: first.customers[0],
      visitsCount: siteVisits.length,
      medianDurationMin,
      p80DurationMin,
      maxDurationMin,
      medianDriveMin,
      confidence,
      lastVisitDate: sorted[0]?.date || "",
      recentDurations,
    });
  }

  return results.sort((a, b) => b.visitsCount - a.visitsCount);
}

/**
 * בניית טאב סיכום_ערים מתוך כלל הביקורים
 */
export function buildCitiesSummary(visits: VisitRecord[]): CitySummaryRecord[] {
  const byCity = new Map<string, VisitRecord[]>();

  for (const v of visits) {
    const c = (v.city || "לא ידוע").trim();
    const existing = byCity.get(c);
    if (!existing) {
      byCity.set(c, [v]);
    } else {
      existing.push(v);
    }
  }

  const results: CitySummaryRecord[] = [];

  for (const [city, cityVisits] of byCity.entries()) {
    const durations = cityVisits.map((v) => v.finalSiteDurationMin).filter((d) => d > 0);
    const drives = cityVisits.map((v) => v.driveMin).filter((d): d is number => typeof d === "number" && d > 0);
    const uniqueSites = new Set(cityVisits.map((v) => v.siteKey)).size;

    results.push({
      city,
      visitsCount: cityVisits.length,
      medianDurationMin: durations.length > 0 ? calculatePercentile(durations, 50) : 20,
      p80DurationMin: durations.length > 0 ? calculatePercentile(durations, 80) : 35,
      medianDriveMin: drives.length > 0 ? calculatePercentile(drives, 50) : 25,
      sitesCount: uniqueSites,
    });
  }

  return results.sort((a, b) => b.visitsCount - a.visitsCount);
}
