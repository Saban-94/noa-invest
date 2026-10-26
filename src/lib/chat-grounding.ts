/**
 * P0 — עזרי grounding לצ׳אט נועה
 * סיוג שאלות, תוויות ראיה, בניית context מאומת בלבד
 */

export type EvidenceLevel =
  | "live_verified"
  | "from_store"
  | "historical"
  | "partial"
  | "unavailable";

export type BackendMeta = {
  notesSource?: "live" | "sample" | "unavailable";
  notesCount?: number;
  visitsCount?: number;
  ituranSource?: "sample" | "none" | string;
  matchedStops?: number;
  unmatchedStops?: number;
  date?: string | null;
  warning?: string;
  duplicateNotes?: number;
  /** מקור אירועי מנוף (PTO) מגיליון איתוראן_PTO */
  ituranPtoSource?: "live" | "empty" | "not_configured" | "error" | "none" | string;
  ituranPtoCount?: number;
  ituranPtoFetchedAt?: string;
  ituranPtoError?: string;
};

export const EVIDENCE_LABEL_HE: Record<EvidenceLevel, string> = {
  live_verified: "מאומת מהשרת",
  from_store: "נמצא במאגר",
  historical: "מידע היסטורי",
  partial: "מידע חלקי",
  unavailable: "לא זמין / נדרש אימות",
};

export function asksCurrentGps(q: string): boolean {
  return /(?:מיקום|איפה|היכן).{0,45}(?:משאית|רכב).{0,45}(?:כרגע|עכשיו|נוכחי|gps|איתוראן)?|(?:gps|איתוראן).{0,45}(?:מיקום|משאית|כרגע|עכשיו)|(?:משאית|רכב).{0,45}(?:מיקום|gps).{0,45}(?:כרגע|עכשיו)/i.test(
    q.trim(),
  );
}

export function asksSourceStatus(q: string): boolean {
  return /(?:אילו|איזה|מה).{0,45}(?:נתונים|מקורות).{0,45}(?:זמינים|מקור|מחובר|כרגע)?|(?:מה מקורם|אילו נתונים זמינים)|(?:האם).{0,20}(?:מחובר|מסונכרן)/i.test(
    q.trim(),
  );
}

export function asksLegacyDemoTopic(q: string): boolean {
  const t = q.toLowerCase();
  return (
    t.includes("חכמת") ||
    t.includes("615") ||
    t.includes("טכוגרף") ||
    t.includes("דיסקית") ||
    t.includes("רקפת") ||
    t.includes("עלי") ||
    t.includes("651") ||
    t.includes("חריג") ||
    t.includes("הצלבה") ||
    t.includes("פיצוח")
  );
}

export function gpsUnavailableMessage(): string {
  return "אין לי כרגע מיקום GPS חי ומאומת של המשאית. מסך הצ׳אט אינו מקבל נתוני מיקום חיים עם מזהה רכב וזמן עדכון, ולכן איני יכולה לקבוע היכן המשאית נמצאת או לאשר שאיתוראן מחובר.";
}

function describePtoSource(meta: BackendMeta): string {
  const base = "• אירועי מנוף (PTO) מאיתוראן_PTO";
  switch (meta.ituranPtoSource) {
    case "live":
      return `${base}: live (${meta.ituranPtoCount ?? 0} אירועים${meta.ituranPtoFetchedAt ? ` · נשלף ${meta.ituranPtoFetchedAt}` : ""})`;
    case "empty":
      return `${base}: מחובר · 0 אירועים`;
    case "not_configured":
      return `${base}: לא מוגדר בשרת`;
    case "error":
      return `${base}: שגיאה${meta.ituranPtoError ? ` (${meta.ituranPtoError})` : ""}`;
    default:
      return `${base}: ${meta.ituranPtoSource}`;
  }
}

export function describeSources(meta: BackendMeta | null, fetchedAt: string | null): string {
  if (!meta) {
    return "אין עדיין דיווח מאומת מהשרת על מקורות הנתונים. הצגת מסך אינה מוכיחה חיבור למערכת חיצונית. בפרט, אין מיקום GPS חי מאומת.";
  }
  const lines = [
    "סטטוס מקורות לפי תשובת השרת האחרונה:",
    `• תעודות משלוח: ${meta.notesSource ?? "לא ידוע"}${typeof meta.notesCount === "number" ? ` (${meta.notesCount} רשומות בטווח)` : ""}`,
    `• איתוראן / עצירות GPS בצינור הצ׳אט: ${meta.ituranSource ?? "לא ידוע"}${typeof meta.matchedStops === "number" ? ` · הצלבות: ${meta.matchedStops}` : ""}`,
    `• ביקורים מחושבים: ${meta.visitsCount ?? "\u2014"}`,
  ];
  if (meta.ituranPtoSource) lines.splice(3, 0, describePtoSource(meta));
  if (meta.warning) lines.push(`• אזהרה: ${meta.warning}`);
  if (fetchedAt) lines.push(`• נמשך מהשרת ב: ${fetchedAt}`);
  lines.push("מיקום GPS חי (קואורדינות + מזהה רכב + זמן עדכון) אינו זמין במסלול זה.");
  return lines.join("\n");
}

export function evidenceFromMeta(meta: BackendMeta | null): EvidenceLevel {
  if (!meta) return "unavailable";
  if (meta.notesSource === "live" && (meta.notesCount ?? 0) > 0) {
    if (meta.ituranSource && meta.ituranSource !== "none") return "partial";
    return "from_store";
  }
  if (meta.notesSource === "sample") return "unavailable";
  return "unavailable";
}

export function buildNoaContext(input: {
  meta: BackendMeta | null;
  fetchedAt: string | null;
  notes: Record<string, unknown>[];
  visits: Record<string, unknown>[];
  discrepancies: unknown[];
  question: string;
}): string {
  const { meta, fetchedAt, notes, visits, discrepancies, question } = input;
  const evidence = evidenceFromMeta(meta);

  const noteSlice = notes.slice(0, 25).map((n) => ({
    id: n.id ?? n.docNumber ?? n["מספר תעודה"] ?? n.noteId,
    customer: n.customer ?? n.customerName,
    address: n.siteAddress ?? n.fullAddress ?? n.address,
    driver: n.driver,
    truck: n.truck ?? n.plate,
    date: n.date ?? n.docDate,
  }));

  const visitSlice = visits.slice(0, 20).map((v) => ({
    truck: v.truck,
    driver: v.driver,
    address: v.fullAddress ?? v.streetAndNum,
    noteIds: v.noteIds,
    ituranArrive: v.ituranArriveTime,
    ituranDepart: v.ituranDepartTime,
    customers: v.customers,
  }));

  return JSON.stringify(
    {
      evidenceLevel: evidence,
      evidenceLabelHe: EVIDENCE_LABEL_HE[evidence],
      question,
      serverFetchedAt: fetchedAt,
      meta: meta ?? { notesSource: "unavailable", ituranSource: "none" },
      notesSample: noteSlice,
      visitsSample: visitSlice,
      discrepanciesCount: Array.isArray(discrepancies) ? discrepancies.length : 0,
      discrepanciesSample: Array.isArray(discrepancies) ? discrepancies.slice(0, 10) : [],
      constraints: {
        noLiveGps: true,
        demoReportsForbidden: true,
        onlyUseFactsInThisJson: true,
      },
    },
    null,
    0,
  );
}

export function formatNotesSummary(
  notes: Record<string, unknown>[],
  meta: BackendMeta | null,
  fetchedAt: string | null,
): string {
  if (!meta || meta.notesSource !== "live" || notes.length === 0) {
    return [
      "אין בידי רשימת תעודות חיה ומאומת מהשרת לשאלה הזו.",
      meta?.warning ? `פירוט: ${meta.warning}` : null,
      meta?.notesSource === "unavailable"
        ? "מקור התעודות: לא זמין."
        : meta?.notesSource
          ? `מקור התעודות לפי שרת: ${meta.notesSource}.`
          : null,
      "לא אציג דוח דוגמה או מספרי תעודה שאינם ברשימה שהתקבלה מהשרת.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = [
    `נמצאו ${notes.length} תעודות בטווח שנטען מהשרת (מקור: live).`,
    fetchedAt ? `זמן משיכה: ${fetchedAt}` : null,
    "דוגמאות (עד 8):",
    ...notes.slice(0, 8).map((n, i) => {
      const id = String(n.id ?? n.docNumber ?? n["מספר תעודה"] ?? "\u2014");
      const cust = String(n.customer ?? n.customerName ?? "\u2014");
      const addr = String(n.siteAddress ?? n.address ?? "");
      return `${i + 1}. ת.מ. ${id} · ${cust}${addr ? ` · ${addr}` : ""}`;
    }),
  ];
  return lines.filter(Boolean).join("\n");
}
