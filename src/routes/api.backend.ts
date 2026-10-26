import { createFileRoute } from "@tanstack/react-router";
import {
  SAMPLE_GALYA_NOTES,
  SAMPLE_VISITS,
  SAMPLE_ITURAN_ROWS,
} from "@/lib/smart-dispatch/fixtures";
import { processIturanRows } from "@/lib/smart-dispatch/ituran-parser";
import { fetchIturanPto } from "@/lib/ituran-pto";
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
  "https://script.google.com/macros/s/AKfycbxp3CnxhBb2vpcV_fiIBKIxIaGtsD1mYE-tpBApVCWRU4i7kcGDy4csBv2JOKfBi_pI/exec";

function getGasUrl(): string {
  const envUrl = process.env["GAS_URL"];
  if (
    envUrl &&
    (envUrl.includes("TwXhw") ||
      envUrl.includes("AKfycbw1zK4jGU8R9joEIyiCDhngHpI-0GIAyERmXE-hjqwGCAUaGVbUMVNbkHR6WbCVmTwXhw"))
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
    type: "pto_missing" | "reversed_window" | "time_gap" | "outlier_crane" | "missing_plate";
    severity: "alert" | "warning" | "nominal";
    title: string;
    description: string;
    details: {
      stopDurationMin?: number;
      ptoDurationMin?: number;
      handwrittenMin?: number;
      ituranMin?: number;
      gapMin?: number;
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

    // חריגה 3: דגלי איכות
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
function loadIturanStops(demo: boolean): { source: "sample" | "none"; stops: IturanStop[] } {
  if (!demo) return { source: "none", stops: [] };
  return { source: "sample", stops: processIturanRows(SAMPLE_ITURAN_ROWS).stops };
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

  // בדיקת מקור PTO במקביל לטעינת התעודות (מגבלת זמן קצרה כדי לא לעכב את ה־bootstrap)
  const ptoProbe = opts.demo ? null : fetchIturanPto({}, { timeoutMs: 6_000 });

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

  const ituran = loadIturanStops(opts.demo);
  const pto = ptoProbe ? await ptoProbe : null;
  const ptoMeta = !pto
    ? { ituranPtoSource: "none" as const }
    : pto.ok
      ? {
          ituranPtoSource: pto.events.length > 0 ? ("live" as const) : ("empty" as const),
          ituranPtoCount: pto.events.length,
          ituranPtoFetchedAt: pto.fetchedAt,
        }
      : pto.reason === "missing_server_config"
        ? { ituranPtoSource: "not_configured" as const }
        : {
            ituranPtoSource: "error" as const,
            ituranPtoError: `${pto.reason}${pto.detail ? `: ${pto.detail}` : ""}`,
          };
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
      ...ptoMeta,
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