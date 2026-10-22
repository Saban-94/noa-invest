// src/lib/smart-dispatch/cross-matcher.ts
// מנוע הצלבה בין תעודות משלוח מארכיון גליה לעצירות ואירועי PTO מאיתוראן

import type { GalyaDeliveryNote, IturanStop, VisitRecord, MeasurementSource } from "./types";
import { summarizeVisitHandwrittenTimes, parseHandwrittenCraneWindows } from "./handwritten-crane";
import { cleanDriverName } from "./ituran-parser";
import {
  normalizeAddressToSiteKey,
  parseAddressComponents,
  scoreAddressMatch,
  normalizeDate,
  assignOneToOne,
  windowOverlapMin,
  timeToMin,
} from "./address-match";
import { resolveTruck } from "./truck";

// נשמר לתאימות לאחור: קוד קיים מייבא את אלה מכאן
export { parseAddressComponents, normalizeAddressToSiteKey, scoreAddressMatch };

/** מרווח (בדקות) בין חלונות כתב יד שמעליו מדובר בשני ביקורים נפרדים באותו אתר */
const CLUSTER_GAP_MIN = 45;

/* ------------------------------------------------------------------ */
/* דה-דופליקציה                                                        */
/* ------------------------------------------------------------------ */

/**
 * אותו מספר תעודה = תעודה אחת (השורה המלאה יותר).
 * שורות ללא מספר תעודה וללא כתובת = סימוני יום, מתעלמים.
 */
export function deduplicateAndFilterDeliveryNotes(rawNotes: GalyaDeliveryNote[]): {
  cleanNotes: GalyaDeliveryNote[];
  duplicateIssuesCount: number;
} {
  const byId = new Map<string, GalyaDeliveryNote>();
  let duplicateIssuesCount = 0;

  const completeness = (n: GalyaDeliveryNote) =>
    (n.itemsSummary ? 2 : 0) +
    (n.craneTimeRaw ? 2 : 0) +
    (n.signedLink ? 2 : 0) +
    (n.orderId ? 1 : 0);

  for (const n of rawNotes) {
    const noteId = String(n.noteId || "").trim();
    if (!noteId) continue; // סימון יום, או תעודה ללא מספר

    const existing = byId.get(noteId);
    if (!existing) {
      byId.set(noteId, n);
    } else {
      duplicateIssuesCount++;
      if (completeness(n) > completeness(existing)) byId.set(noteId, n);
    }
  }

  return { cleanNotes: Array.from(byId.values()), duplicateIssuesCount };
}

/* ------------------------------------------------------------------ */
/* קיבוץ תעודות לביקורים                                              */
/* ------------------------------------------------------------------ */

function validWindows(raw?: string) {
  return parseHandwrittenCraneWindows(raw).filter((w) => !w.isReversed && !w.isOutlier);
}

/**
 * מפצל קבוצת תעודות (אותו תאריך, משאית ואתר) לביקורים נפרדים
 * לפי חלונות כתב היד: פער של 45+ דקות = ביקור חדש.
 * תעודות ללא חלון תקף נשארות בביקור הראשון.
 */
function splitByTimeWindows(notes: GalyaDeliveryNote[]): GalyaDeliveryNote[][] {
  const timed: { n: GalyaDeliveryNote; start: number; end: number }[] = [];
  const untimed: GalyaDeliveryNote[] = [];

  for (const n of notes) {
    const ws = validWindows(n.craneTimeRaw);
    const starts = ws.map((w) => timeToMin(w.startStr)).filter((x): x is number => x !== null);
    const ends = ws.map((w) => timeToMin(w.endStr)).filter((x): x is number => x !== null);
    if (starts.length > 0 && ends.length > 0) {
      timed.push({ n, start: Math.min(...starts), end: Math.max(...ends) });
    } else {
      untimed.push(n);
    }
  }

  if (timed.length === 0) return [notes];

  timed.sort((a, b) => a.start - b.start);
  const clusters: { notes: GalyaDeliveryNote[]; end: number }[] = [];
  for (const t of timed) {
    const last = clusters[clusters.length - 1];
    if (last && t.start - last.end < CLUSTER_GAP_MIN) {
      last.notes.push(t.n);
      last.end = Math.max(last.end, t.end);
    } else {
      clusters.push({ notes: [t.n], end: t.end });
    }
  }
  clusters[0]!.notes.push(...untimed);
  return clusters.map((c) => c.notes);
}

function buildVisit(visitKey: string, vNotes: GalyaDeliveryNote[]): VisitRecord {
  const first = vNotes[0]!;
  const date = normalizeDate(first.docDate) || (first.docDate ?? "").trim();

  const resolved =
    vNotes.map((n) => resolveTruck(n.truckRaw, n.driverRaw)).find((r) => r.plate) ??
    resolveTruck(first.truckRaw, first.driverRaw);

  const qualityFlags = new Set<string>();
  let truck = resolved.plate;
  if (!truck) {
    truck = "חסרה משאית";
    qualityFlags.add("משאית חסרה");
  } else if (resolved.inferred) {
    qualityFlags.add("משאית הוסקה מהנהג");
  }

  const driver = cleanDriverName(first.driverRaw);
  const addr = parseAddressComponents(first.deliveryAddress);
  const siteKey = normalizeAddressToSiteKey(first.deliveryAddress);

  const craneTexts = vNotes.map((n) => n.craneTimeRaw);
  const hw = summarizeVisitHandwrittenTimes(craneTexts);
  hw.flags.forEach((f) => qualityFlags.add(f));

  const uniq = (xs: (string | undefined)[]) =>
    Array.from(new Set(xs.map((x) => x ?? "").filter(Boolean)));

  // ברירת מחדל עד להצלבת איתוראן
  const finalSiteDurationMin = hw.totalValidMin > 0 ? hw.totalValidMin : 20;
  const measurementSource: MeasurementSource = hw.totalValidMin > 0 ? "handwritten" : "fleet_default";

  return {
    visitKey,
    date,
    truck,
    driver,
    city: addr.city,
    streetAndNum: `${addr.street} ${addr.number}${addr.suffix}`.trim(),
    fullAddress: first.deliveryAddress,
    siteKey,
    customers: uniq(vNotes.map((n) => n.customerName)),
    customerNumbers: uniq(vNotes.map((n) => n.customerNo)),
    noteIds: vNotes.map((n) => n.noteId).filter(Boolean),
    orderIds: uniq(vNotes.map((n) => n.orderId)),
    notesCount: vNotes.length,
    handwrittenCraneRaw: craneTexts.filter(Boolean).join(" | "),
    handwrittenUnloadMin: hw.unloadingMin,
    handwrittenWaitingMin: hw.waitingMin,
    finalSiteDurationMin,
    measurementSource,
    qualityFlags: Array.from(qualityFlags),
  };
}

/**
 * ביקור = תעודות עם אותו (תאריך, משאית, אתר), מפוצל לפי חלונות זמן.
 */
export function groupNotesIntoVisits(notes: GalyaDeliveryNote[]): VisitRecord[] {
  const groups = new Map<string, GalyaDeliveryNote[]>();

  for (const n of notes) {
    const date = normalizeDate(n.docDate) || (n.docDate ?? "").trim();
    const { plate } = resolveTruck(n.truckRaw, n.driverRaw);
    const key = `${date}_${plate || "ללא-משאית"}_${normalizeAddressToSiteKey(n.deliveryAddress)}`;
    const arr = groups.get(key);
    if (arr) arr.push(n);
    else groups.set(key, [n]);
  }

  const visits: VisitRecord[] = [];
  for (const [baseKey, groupNotes] of groups) {
    splitByTimeWindows(groupNotes).forEach((vNotes, idx) => {
      visits.push(buildVisit(idx === 0 ? baseKey : `${baseKey}#${idx + 1}`, vNotes));
    });
  }
  return visits;
}

/* ------------------------------------------------------------------ */
/* הצלבה מול איתוראן                                                   */
/* ------------------------------------------------------------------ */

function stopClock(ts?: string): string {
  return ts?.match(/(\d{1,2}:\d{2})/)?.[1] ?? "";
}

/** חפיפה מקסימלית (דקות) בין חלון כתב יד של הביקור לבין חלון העצירה */
function handwrittenOverlapMin(visit: VisitRecord, stop: IturanStop): number {
  const s = stopClock(stop.startTime);
  const e = stopClock(stop.endTime);
  let best = 0;
  for (const w of validWindows(visit.handwrittenCraneRaw)) {
    best = Math.max(best, windowOverlapMin(w.startStr, w.endStr, s, e));
  }
  return best;
}

/**
 * התאמה: אותה משאית, אותו תאריך, כתובת תואמת (ראו scoreAddressMatch).
 * שיבוץ 1:1 גלובלי לפי ציון; תיקו נשבר לפי חפיפת זמנים ואז משך עצירה.
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
  const assignment = assignOneToOne(visits, stops, (visit, stop) => {
    if (stop.truck !== visit.truck) return null;
    if (normalizeDate(stop.date) !== visit.date) return null;
    const m = scoreAddressMatch(visit.fullAddress, stop.address);
    if (!m.isMatch) return null;
    return {
      score: m.score,
      tiebreak: handwrittenOverlapMin(visit, stop) * 1000 + stop.durationMin,
    };
  });

  const usedStops = new Set<number>(assignment.values());

  const matchedVisits = visits.map((visit, vi) => {
    const si = assignment.get(vi);
    if (si === undefined) return visit;

    const stop = stops[si]!;
    stop.matchedVisitKey = visit.visitKey;
    const m = scoreAddressMatch(visit.fullAddress, stop.address);

    let ptoOpenTime: string | undefined;
    let ptoCloseTime: string | undefined;
    let ptoDurationMin: number | undefined;
    if (stop.ptoEvents && stop.ptoEvents.length > 0) {
      const firstPto = stop.ptoEvents[0]!;
      ptoOpenTime = firstPto.openTime;
      ptoCloseTime = firstPto.closeTime;
      ptoDurationMin = stop.ptoEvents.reduce((s, p) => s + (p.durationMin || 0), 0);
    }

    const qualityFlags = [...visit.qualityFlags];
    if (m.score < 5) qualityFlags.push("התאמת כתובת חלקית");

    return {
      ...visit,
      ituranArriveTime: stop.startTime,
      ituranDepartTime: stop.endTime,
      ituranDurationMin: stop.durationMin,
      ptoOpenTime,
      ptoCloseTime,
      ptoDurationMin,
      driveKm: stop.driveKm,
      driveMin: stop.driveDurationMin,
      finalSiteDurationMin: stop.durationMin > 0 ? stop.durationMin : visit.finalSiteDurationMin,
      measurementSource: "ituran" as MeasurementSource,
      matchScore: m.score,
      qualityFlags,
    };
  });

  const unmatchedStops = stops.filter((_, i) => !usedStops.has(i));

  return {
    matchedVisits,
    matchedStopsCount: assignment.size,
    unmatchedStopsCount: unmatchedStops.length,
    unmatchedStops,
  };
}

/* ------------------------------------------------------------------ */
/* הזרקה חזרה לתעודות                                                  */
/* ------------------------------------------------------------------ */

/** הזרקת נתוני הביקור לתעודות המקוריות (עמודות מימין בלבד), לפי מספר תעודה */
export function injectIturanDataIntoNotes(
  notes: GalyaDeliveryNote[],
  visits: VisitRecord[],
): GalyaDeliveryNote[] {
  const byNoteId = new Map<string, VisitRecord>();
  for (const v of visits) for (const id of v.noteIds) byNoteId.set(id, v);

  return notes.map((note) => {
    const v = byNoteId.get(note.noteId);
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