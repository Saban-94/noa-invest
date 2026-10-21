// src/lib/smart-dispatch/cross-matcher.ts
// מנוע הצלבה בין תעודות משלוח מארכיון גליה לעצירות ואירועי PTO מאיתוראן

import type {
  GalyaDeliveryNote,
  IturanStop,
  PtoEvent,
  VisitRecord,
  MeasurementSource,
} from "./types";
import { summarizeVisitHandwrittenTimes } from "./handwritten-crane";
import { cleanDriverName, normalizeTruckPlate, parseIturanDateTime } from "./ituran-parser";

/**
 * פירוק ונרמול כתובת ל-3 רכיבים: עיר, רחוב, מספר
 * דוגמה: "משה שרת 9, הוד השרון" -> { city: "הוד השרון", street: "משה שרת", number: "9" }
 * דוגמה: "הרקפת 4, הוד השרון" -> { city: "הוד השרון", street: "רקפת", number: "4" }
 */
export function parseAddressComponents(rawAddress?: string): {
  city: string;
  street: string;
  number: string;
} {
  if (!rawAddress) return { city: "", street: "", number: "" };

  // ניקוי סימני פיסוק וגרשיים
  const clean = rawAddress
    .replace(/["'״׳`]/g, "")
    .replace(/[;()]/g, " ")
    .trim();

  // בדיקת מבנה עם פסיק: "רחוב ומספר, עיר"
  const commaParts = clean.split(",").map((p) => p.trim());
  let streetPart = "";
  let cityPart = "";

  if (commaParts.length >= 2) {
    streetPart = commaParts[0]!;
    cityPart = commaParts[1]!;
  } else {
    // אין פסיק - ננסה לזהות עיר בסוף המחרוזת
    const tokens = clean.split(/\s+/);
    if (tokens.length >= 3) {
      streetPart = tokens.slice(0, -1).join(" ");
      cityPart = tokens[tokens.length - 1]!;
    } else {
      streetPart = clean;
    }
  }

  // חילוץ מספר בית מתוך חלק הרחוב
  let houseNumber = "";
  const numMatch = streetPart.match(/\b\d+[א-ת]?\b/);
  if (numMatch) {
    houseNumber = numMatch[0];
    streetPart = streetPart.replace(numMatch[0], "").trim();
  }

  // ניקוי רחוב: הסרת "רחוב" או "רח'", והסרת "ה" פותחת
  let normStreet = streetPart
    .replace(/\bרחוב\b/g, "")
    .replace(/\bרח\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // הסרת "ה" פותחת ("הרקפת" -> "רקפת", "התלמיד" -> "תלמיד")
  if (normStreet.startsWith("ה") && normStreet.length > 2) {
    // נבדוק שזה לא שם שמתחיל באות ה' כחלק אינטגרלי מהשם כגון "הראל"
    const withoutHe = normStreet.slice(1);
    if (!["הראל", "הדס", "הלל", "הוד"].includes(normStreet)) {
      normStreet = withoutHe;
    }
  }

  const normCity = cityPart.replace(/\s+/g, " ").trim();

  return {
    city: normCity,
    street: normStreet,
    number: houseNumber,
  };
}

/**
 * יצירת מפתח אתר אחיד: עיר|רחוב|מספר
 */
export function normalizeAddressToSiteKey(rawAddress?: string): string {
  const { city, street, number } = parseAddressComponents(rawAddress);
  return `${city}|${street}|${number}`.toLowerCase();
}

/**
 * חישוב ניקוד התאמת כתובת (Address Match Score)
 * רחוב זהה: +2
 * מספר זהה: +2
 * עיר זהה: +1
 * סף: >= 4, או >= 3 כאשר הרחוב זהה
 */
export function scoreAddressMatch(addr1?: string, addr2?: string): {
  score: number;
  streetMatched: boolean;
  isMatch: boolean;
} {
  const p1 = parseAddressComponents(addr1);
  const p2 = parseAddressComponents(addr2);

  let score = 0;
  let streetMatched = false;

  // השוואת רחוב
  if (p1.street && p2.street) {
    if (
      p1.street === p2.street ||
      p1.street.includes(p2.street) ||
      p2.street.includes(p1.street)
    ) {
      score += 2;
      streetMatched = true;
    }
  }

  // השוואת מספר
  if (p1.number && p2.number && p1.number === p2.number) {
    score += 2;
  }

  // השוואת עיר
  if (p1.city && p2.city) {
    if (p1.city === p2.city || p1.city.includes(p2.city) || p2.city.includes(p1.city)) {
      score += 1;
    }
  }

  const isMatch = score >= 4 || (score >= 3 && streetMatched);
  return { score, streetMatched, isMatch };
}

/**
 * דה-דופליקציה וניקוי של תעודות משלוח מארכיון גליה
 * אותו מספר תעודה = תעודה אחת (השורה המלאה יותר).
 * שורות שיש בהן רק תאריך ונהג ללא מספר תעודה וכתובת = סימוני יום, להתעלם מהן.
 */
export function deduplicateAndFilterDeliveryNotes(
  rawNotes: GalyaDeliveryNote[],
): { cleanNotes: GalyaDeliveryNote[]; duplicateIssuesCount: number } {
  const byId = new Map<string, GalyaDeliveryNote>();
  let duplicateIssuesCount = 0;

  for (const n of rawNotes) {
    const noteId = String(n.noteId || "").trim();
    const address = String(n.deliveryAddress || "").trim();

    // התעלמות משורות סימון יום (ללא מספר תעודה וללא כתובת)
    if (!noteId && !address) {
      continue;
    }

    if (!noteId) {
      // תעודה ללא מספר אך עם כתובת
      continue;
    }

    const existing = byId.get(noteId);
    if (!existing) {
      byId.set(noteId, n);
    } else {
      duplicateIssuesCount++;
      // בחירת השורה המלאה יותר
      const existingScore = (existing.itemsSummary ? 2 : 0) +
        (existing.craneTimeRaw ? 2 : 0) +
        (existing.signedLink ? 2 : 0) +
        (existing.orderId ? 1 : 0);

      const newScore = (n.itemsSummary ? 2 : 0) +
        (n.craneTimeRaw ? 2 : 0) +
        (n.signedLink ? 2 : 0) +
        (n.orderId ? 1 : 0);

      if (newScore > existingScore) {
        byId.set(noteId, n);
      }
    }
  }

  return {
    cleanNotes: Array.from(byId.values()),
    duplicateIssuesCount,
  };
}

/**
 * קיבוץ תעודות משלוח לביקורים (Visits)
 * ביקור = קבוצת תעודות עם אותו (תאריך, משאית, מפתח אתר)
 */
export function groupNotesIntoVisits(notes: GalyaDeliveryNote[]): VisitRecord[] {
  const visitMap = new Map<string, { notes: GalyaDeliveryNote[]; key: string }>();

  for (const n of notes) {
    const date = n.docDate.trim();
    // חילוץ משאית מעמודת משאית או נהג
    let truck = normalizeTruckPlate(n.truckRaw || "");
    if (!truck) {
      truck = normalizeTruckPlate(n.driverRaw || "");
    }
    const hasMissingTruck = !truck;
    const finalTruck = truck || "ללא-משאית";

    const siteKey = normalizeAddressToSiteKey(n.deliveryAddress);
    const visitKey = `${date}_${finalTruck}_${siteKey}`;

    const existing = visitMap.get(visitKey);
    if (!existing) {
      visitMap.set(visitKey, { notes: [n], key: visitKey });
    } else {
      existing.notes.push(n);
    }
  }

  const visits: VisitRecord[] = [];

  for (const { notes: vNotes, key: visitKey } of visitMap.values()) {
    const first = vNotes[0]!;
    const date = first.docDate.trim();
    let truck = normalizeTruckPlate(first.truckRaw || "") || normalizeTruckPlate(first.driverRaw || "");
    const qualityFlags: string[] = [];

    if (!truck) {
      truck = "חסרה משאית";
      qualityFlags.push("משאית חסרה");
    }

    const driver = cleanDriverName(first.driverRaw);
    const addressParsed = parseAddressComponents(first.deliveryAddress);
    const siteKey = normalizeAddressToSiteKey(first.deliveryAddress);

    // חילוץ זמני מנוף והמתנה בכתב יד של כל התעודות בביקור
    const craneTexts = vNotes.map((n) => n.craneTimeRaw);
    const hwSummary = summarizeVisitHandwrittenTimes(craneTexts);
    hwSummary.flags.forEach((f) => qualityFlags.push(f));

    const customers = Array.from(new Set(vNotes.map((n) => n.customerName).filter(Boolean)));
    const customerNumbers = Array.from(new Set(vNotes.map((n) => n.customerNo || "").filter(Boolean)));
    const noteIds = vNotes.map((n) => n.noteId).filter(Boolean);
    const orderIds = Array.from(new Set(vNotes.map((n) => n.orderId || "").filter(Boolean)));

    // ברירת מחדל זמנית למדידה לפני הצלבת איתוראן
    let finalDuration = hwSummary.totalValidMin > 0 ? hwSummary.totalValidMin : 20;
    let source: MeasurementSource = hwSummary.totalValidMin > 0 ? "handwritten" : "fleet_default";

    visits.push({
      visitKey,
      date,
      truck,
      driver,
      city: addressParsed.city,
      streetAndNum: `${addressParsed.street} ${addressParsed.number}`.trim(),
      fullAddress: first.deliveryAddress,
      siteKey,
      customers,
      customerNumbers,
      noteIds,
      orderIds,
      notesCount: vNotes.length,
      handwrittenCraneRaw: craneTexts.filter(Boolean).join(" | "),
      handwrittenUnloadMin: hwSummary.unloadingMin,
      handwrittenWaitingMin: hwSummary.waitingMin,
      finalSiteDurationMin: finalDuration,
      measurementSource: source,
      qualityFlags,
    });
  }

  return visits;
}

/**
 * הצלבת כל ביקור מול עצירות איתוראן
 * התאמה לעצירת איתוראן: אותה משאית, אותו תאריך, ניקוד כתובת >= 4 או >= 3 ברחוב זהה.
 * תיקו נשבר לפי משך עצירה ארוך יותר.
 * עצירת איתוראן מותאמת לביקור אחד בלבד (1-to-1).
 */
export function matchVisitsWithIturanStops(
  visits: VisitRecord[],
  stops: IturanStop[],
): {
  matchedVisits: VisitRecord[];
  matchedStopsCount: number;
  unmatchedStopsCount: number;
  unmatchedStops: IturanStop[];
} {
  const usedStopIds = new Set<string>();
  let matchedStopsCount = 0;

  const matchedVisits = visits.map((visit) => {
    // איתור כל העצירות הפוטנציאליות: אותה משאית ואותו תאריך
    const candidateStops = stops.filter((s) => {
      if (usedStopIds.has(s.id)) return false;
      if (s.truck !== visit.truck) return false;
      if (s.date !== visit.date) return false;
      return true;
    });

    let bestStop: IturanStop | null = null;
    let highestScore = 0;

    for (const stop of candidateStops) {
      const match = scoreAddressMatch(visit.fullAddress, stop.address);
      if (match.isMatch) {
        if (match.score > highestScore) {
          highestScore = match.score;
          bestStop = stop;
        } else if (match.score === highestScore && bestStop) {
          // שבירת תיקו לפי משך עצירה ארוך יותר
          if (stop.durationMin > bestStop.durationMin) {
            bestStop = stop;
          }
        }
      }
    }

    if (bestStop) {
      usedStopIds.add(bestStop.id);
      matchedStopsCount++;
      bestStop.matchedVisitKey = visit.visitKey;

      // חישוב נתוני PTO הקשורים לעצירה
      let ptoOpenTime: string | undefined;
      let ptoCloseTime: string | undefined;
      let ptoDurationMin: number | undefined;

      if (bestStop.ptoEvents && bestStop.ptoEvents.length > 0) {
        const firstPto = bestStop.ptoEvents[0]!;
        ptoOpenTime = firstPto.openTime;
        ptoCloseTime = firstPto.closeTime;
        ptoDurationMin = bestStop.ptoEvents.reduce((s, p) => s + (p.durationMin || 0), 0);
      }

      // עדיפות מדידה: איתוראן קודם לכתב יד
      const finalDuration = bestStop.durationMin > 0 ? bestStop.durationMin : visit.finalSiteDurationMin;

      return {
        ...visit,
        ituranArriveTime: bestStop.startTime,
        ituranDepartTime: bestStop.endTime,
        ituranDurationMin: bestStop.durationMin,
        ptoOpenTime,
        ptoCloseTime,
        ptoDurationMin,
        driveKm: bestStop.driveKm,
        driveMin: bestStop.driveDurationMin,
        finalSiteDurationMin: finalDuration,
        measurementSource: "ituran" as MeasurementSource,
        matchScore: highestScore,
      };
    }

    return visit;
  });

  const unmatchedStops = stops.filter((s) => !usedStopIds.has(s.id));

  return {
    matchedVisits,
    matchedStopsCount,
    unmatchedStopsCount: unmatchedStops.length,
    unmatchedStops,
  };
}

/**
 * הזרקת נתוני הביקור לתעודות המשלוח המקוריות (עמודות מימין בלבד)
 */
export function injectIturanDataIntoNotes(
  notes: GalyaDeliveryNote[],
  visits: VisitRecord[],
): GalyaDeliveryNote[] {
  const visitByKey = new Map<string, VisitRecord>();
  for (const v of visits) {
    visitByKey.set(v.visitKey, v);
  }

  return notes.map((note) => {
    let truck = normalizeTruckPlate(note.truckRaw || "") || normalizeTruckPlate(note.driverRaw || "") || "ללא-משאית";
    const siteKey = normalizeAddressToSiteKey(note.deliveryAddress);
    const visitKey = `${note.docDate.trim()}_${truck}_${siteKey}`;

    const v = visitByKey.get(visitKey);
    if (!v) return note;

    return {
      ...note,
      injectedSiteDurationMin: v.finalSiteDurationMin,
      injectedTravelMin: v.driveMin,
      injectedTravelKm: v.driveKm,
      injectedArriveTime: v.ituranArriveTime,
      injectedDepartTime: v.ituranDepartTime,
      injectedPtoOpen: v.ptoOpenTime,
      injectedPtoClose: v.ptoCloseTime,
      injectedPtoMin: v.ptoDurationMin,
      injectedMeasurementSource: v.measurementSource,
      injectedVisitKey: v.visitKey,
    };
  });
}
