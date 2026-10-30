import { createFileRoute } from "@tanstack/react-router";
import {
  SAMPLE_GALYA_NOTES,
  SAMPLE_VISITS,
  SAMPLE_ITURAN_ROWS,
} from "@/lib/smart-dispatch/fixtures";
import { processIturanRows } from "@/lib/smart-dispatch/ituran-parser";
import { loadLiveIturanFromGas } from "@/lib/ituran";
import {
  deduplicateAndFilterDeliveryNotes,
  groupNotesIntoVisits,
  matchVisitsWithIturanStops,
} from "@/lib/smart-dispatch/cross-matcher";
import { normalizeDate } from "@/lib/smart-dispatch/address-match";
import { sheetNoteToGalya } from "@/lib/smart-dispatch/live-adapter";
import type { GalyaDeliveryNote, IturanStop, VisitRecord } from "@/lib/smart-dispatch/types";
import type { SheetNote } from "@/lib/notes-api.functions";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwKcoR9kEAAapY9MZIm5cS3MwCsNhqJZgs6ZQDSB99EVcQZ3it8RoLwfAIuzpZXpALTuw/exec";

function getGasUrl(): string {
  const envUrl = process.env["GAS_URL"];
  if (
    envUrl &&
    (envUrl.includes("TwXhw") ||
      envUrl.includes("AKfycbwKcoR9kEAAapY9MZIm5cS3MwCsNhqJZgs6ZQDSB99EVcQZ3it8RoLwfAIuzpZXpALTuw"))
  ) {
    return DEFAULT_GAS_URL;
  }
  return envUrl || DEFAULT_GAS_URL;
}

function getApiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת (Environment Variables)");
  return t;
}

/* ------------------------------------------------------------------ */
/* בדיקת חריגות                                                        */
/* ------------------------------------------------------------------ */

export function evaluateDiscrepancies(visits: VisitRecord[]) {
  const issues: {
    id: string;
    truck: string;
    driver: string;
    address: string;
    type: "pto_missing" | "reversed_window" | "time_gap" | "pto_time_gap" | "outlier_crane" | "missing_plate";
    severity: "alert" | "warning" | "nominal";
    title: string;
    description: string;
    details: {
      stopDurationMin?: number;
      ptoDurationMin?: number;
      handwrittenMin?: number;
      ituranMin?: number;
      gapMin?: number;
      ptoOpenGapMin?: number;
      ptoCloseGapMin?: number;
    };
  }[] = [];

  for (const v of visits) {
    const stopDur = v.ituranDurationMin || v.finalSiteDurationMin || 0;
    const ptoDur = v.ptoDurationMin || 0;
    const hwMin = (v.handwrittenUnloadMin || 0) + (v.handwrittenWaitingMin || 0);
    const hasIturan = v.measurementSource === "ituran";

    // חריגה 1: עצירה מעל 60 דקות ללא PTO (רק כשיש מדידת איתוראן אמיתית)
    if (hasIturan && stopDur >= 60 && ptoDur === 0) {
      issues.push({
        id: `disc-${v.visitKey}-pto`,
        truck: v.truck,
        driver: v.driver,
        address: v.fullAddress,
        type: "pto_missing",
        severity: "alert",
        title: "שהייה ארוכה ללא הפעלת PTO מנוף",
        description: `משאית שהתה באתר ${stopDur} דק' באיתוראן, אך לא נרשמה פתיחת PTO כלל. נדרש אימות האם פריקה ידנית או תקלת חיישן.`,
        details: { stopDurationMin: stopDur, ptoDurationMin: ptoDur },
      });
    }

    // חריגה 2: פער בין איתוראן לכתב יד מעל 10 דקות (רק עם איתוראן אמיתי)
    if (hasIturan && stopDur > 0 && hwMin > 0) {
      const gap = Math.abs(stopDur - hwMin);
      if (gap > 10) {
        issues.push({
          id: `disc-${v.visitKey}-gap`,
          truck: v.truck,
          driver: v.driver,
          address: v.fullAddress,
          type: "time_gap",
          severity: "warning",
          title: `פער של ${gap} דק' בין איתוראן לשעת כתב יד`,
          description: `באיתוראן: ${stopDur} דק' | בכתב יד בתעודה: ${hwMin} דק' (פער של ${gap} דקות).`,
          details: { stopDurationMin: stopDur, handwrittenMin: hwMin, gapMin: gap },
        });
      }
    }

    // חריגה 3: השוואת שעות פתיחה/סגירה של PTO מול חלון המנוף בכתב היד.
    // סף 5 דקות מונע התרעות על עיגול דקות קטן; אין השוואה אם אחד המקורות חסר.
    if (hasIturan && v.ptoOpenTime && v.ptoCloseTime && v.handwrittenCraneRaw) {
      const written = String(v.handwrittenCraneRaw).match(/(\d{1,2}:\d{2})\s*עד\s*(?:שעה\s*)?(\d{1,2}:\d{2})/);
      const clockMin = (value: string) => {
        const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      };
      const hwOpen = written ? clockMin(written[1]!) : null;
      const hwClose = written ? clockMin(written[2]!) : null;
      const ptoOpen = clockMin(v.ptoOpenTime);
      const ptoClose = clockMin(v.ptoCloseTime);
      if (hwOpen !== null && hwClose !== null && ptoOpen !== null && ptoClose !== null) {
        const openGap = Math.abs(ptoOpen - hwOpen);
        const closeGap = Math.abs(ptoClose - hwClose);
        if (openGap > 5 || closeGap > 5) {
          issues.push({
            id: `disc-${v.visitKey}-pto-time`,
            truck: v.truck,
            driver: v.driver,
            address: v.fullAddress,
            type: "pto_time_gap",
            severity: "warning",
            title: "אי־התאמה בשעות פתיחת/סגירת מנוף",
            description: `כתב יד: ${written![1]}–${written![2]} | איתוראן PTO: ${String(v.ptoOpenTime).match(/\d{1,2}:\d{2}/)?.[0] || "לא ידוע"}–${String(v.ptoCloseTime).match(/\d{1,2}:\d{2}/)?.[0] || "לא ידוע"} | פער פתיחה: ${openGap} דק׳, פער סגירה: ${closeGap} דק׳.`,
            details: { handwrittenMin: hwMin, ptoOpenGapMin: openGap, ptoCloseGapMin: closeGap },
          });
        }
      }
    }

    // חריגה 4: דגלי איכות
    for (const flag of v.qualityFlags ?? []) {
      if (flag.includes("הפוך")) {
        issues.push({
          id: `disc-${v.visitKey}-rev`,
          truck: v.truck,
          driver: v.driver,
          address: v.fullAddress,
          type: "reversed_window",
          severity: "alert",
          title: "חלון מנוף הפוך בכתב יד",
          description: `נרשמה שעת סיום הקודמת לשעת הפתיחה בטופס הפיזי: "${v.handwrittenCraneRaw ?? ""}".`,
          details: {},
        });
      }
      if (flag.includes("חריג")) {
        issues.push({
          id: `disc-${v.visitKey}-outlier`,
          truck: v.truck,
          driver: v.driver,
          address: v.fullAddress,
          type: "outlier_crane",
          severity: "warning",
          title: "משך מנוף חריג מעל 240 דק'",
          description: `נרשם משך של מעל 4 שעות לפריקת מנוף באתר.`,
          details: { handwrittenMin: hwMin },
        });
      }
      if (flag.includes("חסרה")) {
        issues.push({
          id: `disc-${v.visitKey}-plate`,
          truck: v.truck,
          driver: v.driver,
          address: v.fullAddress,
          type: "missing_plate",
          severity: "warning",
          title: "מספר רישוי חסר בתעודה",
          description: "בתעודת המשלוח לא צוין רישוי משאית תקין, ולא ניתן להסיק אותו משם הנהג.",
          details: {},
        });
      }
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/* מקורות נתונים                                                       */
/* ------------------------------------------------------------------ */

type NotesResult =
  | { source: "live"; notes: GalyaDeliveryNote[] }
  | { source: "unavailable"; notes: []; error: string };

const NOTES_CACHE_MS = 30_000;
let notesCache: { at: number; result: NotesResult } | null = null;

/** שליפת תעודות חיות מ-Apps Script. כשל לא נופל לדוגמה, אלא מוחזר במפורש. */
async function loadLiveNotes(): Promise<NotesResult> {
  if (notesCache && Date.now() - notesCache.at < NOTES_CACHE_MS) return notesCache.result;

  try {
    const res = await fetch(
      `${getGasUrl()}?action=getNotes&token=${encodeURIComponent(getApiToken())}`,
      { redirect: "follow", signal: AbortSignal.timeout(15_000) },
    );
    const text = await res.text();

    let json: { success?: boolean; error?: unknown; notes?: unknown };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${res.status})`);
    }
    if (json.error || json.success === false) {
      throw new Error(String(json.error || "הפעולה נכשלה ב-Apps Script"));
    }

    const raw = Array.isArray(json.notes) ? (json.notes as SheetNote[]) : [];
    const result: NotesResult = { source: "live", notes: raw.map(sheetNoteToGalya) };
    notesCache = { at: Date.now(), result };
    return result;
  } catch (err) {
    return {
      source: "unavailable",
      notes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * עצירות איתוראן. עדיין אין מקור חי שנשמר בין בקשות (שרת serverless),
 * לכן מחזירים ריק. דוגמה רק במצב demo.
 */
async function loadIturanStops(demo: boolean): Promise<{ source: "sample" | "none" | "live"; stops: IturanStop[]; error?: string }> {
  if (demo) return { source: "sample", stops: processIturanRows(SAMPLE_ITURAN_ROWS).stops };

  let token: string;
  try {
    token = getApiToken();
  } catch (error) {
    return { source: "none", stops: [], error: error instanceof Error ? error.message : String(error) };
  }
  return loadLiveIturanFromGas({ gasUrl: getGasUrl(), token });
}

const SAMPLE_DISCS = [
  {
    _row: 1,
    "תאריך דיסקית": "15/10/2026",
    "תאריך מתוקן": "15/10/2026",
    "רישוי / משאית": "615-41-002",
    "משאית מתוקנת": "615-41-002",
    נהג: "חכמת גאבר",
    "סוג משאית": "מרצדס מנוף 32 טון",
    'סה"כ ק"מ': "140",
    'ק"מ פתיחה': "348,210",
    'ק"מ סגירה': "348,350",
    "זמן נסיעה": "03:45",
    "זמן עבודה": "04:10",
    "זמן מנוף": "02:15",
    "זמן סרק": "00:35",
    "קישור לדיסקית": "/src/assets/images/tachograph_disc_scan_1792629364395.jpg",
    "אושר ע״י": "ראמי מסארווה",
    "אושר בתאריך": "15/10/2026 14:15",
    "סטטוס אימות": "תקין מול איתוראן",
    דגלים: ["תואם 2 פריקות מנוף ב-PTO"],
  },
  {
    _row: 2,
    "תאריך דיסקית": "15/10/2026",
    "תאריך מתוקן": "15/10/2026",
    "רישוי / משאית": "651-51-701",
    "משאית מתוקנת": "651-51-701",
    נהג: "עלי אבו עידה",
    "סוג משאית": "איסוזו פלטה",
    'סה"כ ק"מ': "95",
    'ק"מ פתיחה': "192,400",
    'ק"מ סגירה': "192,495",
    "זמן נסיעה": "02:20",
    "זמן עבודה": "03:30",
    "זמן מנוף": "00:00",
    "זמן סרק": "00:40",
    "קישור לדיסקית": "/src/assets/images/tachograph_disc_scan_1792629364395.jpg",
    "אושר ע״י": "",
    "אושר בתאריך": "",
    "סטטוס אימות": "ממתין לבדיקת ראמי",
    דגלים: ["משאית פלטה ללא PTO"],
  },
];

/* ------------------------------------------------------------------ */
/* צינור הצלבה                                                         */
/* ------------------------------------------------------------------ */

async function buildPipeline(opts: { demo: boolean; date: string }) {
  let notes: GalyaDeliveryNote[];
  let notesSource: "live" | "sample" | "unavailable";
  let warning: string | undefined;

  if (opts.demo) {
    notes = [...SAMPLE_GALYA_NOTES];
    notesSource = "sample";
  } else {
    const live = await loadLiveNotes();
    notes = live.notes;
    notesSource = live.source;
    if (live.source === "unavailable") warning = `לא ניתן לטעון תעודות מהגיליון: ${live.error}`;
  }

  const { cleanNotes, duplicateIssuesCount } = deduplicateAndFilterDeliveryNotes(notes);
  const scoped = opts.date
    ? cleanNotes.filter((n) => normalizeDate(n.docDate) === opts.date)
    : cleanNotes;

  const ituran = await loadIturanStops(opts.demo);
  const grouped = groupNotesIntoVisits(scoped);
  const cross = matchVisitsWithIturanStops(grouped, ituran.stops);
  const visits = cross.matchedVisits;

  return {
    notes: scoped,
    visits,
    stops: ituran.stops,
    discrepancies: evaluateDiscrepancies(visits),
    meta: {
      notesSource,
      notesCount: scoped.length,
      duplicateNotes: duplicateIssuesCount,
      visitsCount: visits.length,
      ituranSource: ituran.source,
      ...(ituran.error ? { ituranError: ituran.error } : {}),
      matchedStops: cross.matchedStopsCount,
      unmatchedStops: cross.unmatchedStopsCount,
      date: opts.date || null,
      ...(warning ? { warning } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

export const Route = createFileRoute("/api/backend")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleBackendRequest(request);
      },
      POST: async ({ request }: { request: Request }) => {
        return handleBackendRequest(request);
      },
    },
  },
});

async function handleBackendRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";
  const demo = url.searchParams.get("demo") === "1";
  const date = normalizeDate(url.searchParams.get("date") ?? "");

  // 1. פרוקסי תמונה לסריקות דיסקית מ-Drive
  if (action === "image") {
    const rawLink = url.searchParams.get("link") || url.searchParams.get("url") || "";
    const fileIdMatch = rawLink.match(/[-\w]{25,}/);
    const fileId = fileIdMatch ? fileIdMatch[0] : "";

    if (fileId) {
      try {
        const gasRes = await fetch(
          `${getGasUrl()}?action=getFile&id=${fileId}&token=${encodeURIComponent(getApiToken())}`,
          { redirect: "follow", signal: AbortSignal.timeout(10_000) },
        );
        const json = await gasRes.json();
        if (json.success && json.base64) {
          return Response.json({
            ok: true,
            dataUrl: `data:${json.mimeType || "image/jpeg"};base64,${json.base64}`,
          });
        }
      } catch {
        // ממשיכים לנכס המקומי
      }
    }

    return Response.json({
      ok: true,
      dataUrl: "/src/assets/images/tachograph_disc_scan_1792629364395.jpg",
      isFallback: true,
    });
  }

  const pipeline = await buildPipeline({ demo, date });

  // 2. הערכת חריגות
  if (action === "crossReference") {
    const { discrepancies } = pipeline;
    return Response.json({
      ok: true,
      data: {
        discrepancies,
        totalIssues: discrepancies.length,
        alertCount: discrepancies.filter((i) => i.severity === "alert").length,
        warningCount: discrepancies.filter((i) => i.severity === "warning").length,
        meta: pipeline.meta,
      },
    });
  }

  // 3. Bootstrap (ברירת מחדל)
  return Response.json({
    ok: true,
    data: {
      deliveryNotes: pipeline.notes,
      visits: pipeline.visits,
      discs: demo ? SAMPLE_DISCS : [],
      discrepancies: pipeline.discrepancies,
      ituranStops: pipeline.stops,
      meta: pipeline.meta,
      timestamp: new Date().toISOString(),
    },
  });
}

// נשאר מיוצא לשימוש בדיקות/דמו בלבד
export const DEMO_VISITS = SAMPLE_VISITS;
