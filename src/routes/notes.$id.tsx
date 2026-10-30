import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  auditNote,
  noteItemsCount,
  noteWeightKg,
  type DeliveryNote,
} from "@/lib/data";
import { fetchLiveNotes, approveStrict } from "@/lib/api";
import { getManifestFn, getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import { approvals, useApprovals } from "@/lib/store";
import { playDispatchChime } from "@/lib/audio-alerts";
import { PageHeader, StatusPill } from "@/components/AppShell";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Crown,
  FileText,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  PenTool,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Stamp,
  XCircle,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InquiryThread } from "@/components/InquiryThread";
import { listWorkroomInquiriesFn, openOrCreateWorkroomTaskFn, ramiReplyFn } from "@/lib/inquiry-workflow.functions";
import type { WorkroomInquiry } from "@/lib/inquiry-workflow";
import { buildLogisticsFindings, isLogisticsAuditComplete } from "@/lib/logistics-audit";

export const Route = createFileRoute("/notes/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `תעודה ${params.id} — נועה ח. סבן` },
      { name: "description", content: "תצוגת תעודת משלוח עם שכבות בקרה וחותמות." },
      { property: "og:title", content: `תעודה ${params.id}` },
      { property: "og:description", content: "בקרת נועה AI, חותמת ראמי וחותמת מנכ״ל." },
    ],
  }),
  component: Viewer,
});

/* ───────────────────────────── Helpers ───────────────────────────── */

type Finding = ReturnType<typeof buildLogisticsFindings>[number];

function evidenceTemplates(finding: Finding): string[] {
  const title = finding.title;
  if (finding.category === "source") return [
    `הצלבה מול קומקס | הזמנה: [מספר הזמנה] | תאריך: [תאריך] | מסמך מקור: [קישור/עמוד] | תוצאה: [תוצאה]`,
    `מקור התעודה נבדק | קובץ: [שם/קישור] | עמוד: [מספר] | מספר תעודה: [מספר] | תוצאה: [תוצאה]`,
  ];
  if (finding.category === "deposit") return [
    `פיקדון ${title} נבדק מול תנועת אספקה | אסמכתא: [מספר] | כמות: [כמות] | תאריך: [תאריך]`,
    `פיקדון ${title} הוצלב מול חיוב/זיכוי נפרד | אסמכתא: [מספר] | כמות: [כמות] | תוצאה: [תוצאה]`,
  ];
  if (finding.category === "tracking") return [
    `איתוראן נבדק | נהג: [שם] | רכב: [מספר רישוי] | שעה: [שעה] | כתובת: [כתובת] | תוצאה: [תוצאה]`,
    `ביצוע הובלה אומת | נהג: [שם] | רכב: [מספר] | מקור: [קישור/דוח] | תאריך ושעה: [מועד]`,
  ];
  if (finding.category === "transport") return [
    `שירות הובלה נבדק מול הזמנה | מק״ט: [מק״ט] | הזמנה: [מספר] | ביצוע: [אסמכתא] | תוצאה: [תוצאה]`,
    `ביצוע שירות אומת | נהג/רכב: [פרטים] | תאריך: [תאריך] | אסמכתא: [קישור/מסמך]`,
  ];
  return [
    `כמות הוצלבה מול הזמנת קומקס | מק״ט: [מק״ט] | צפוי: [כמות] | סופק: [כמות] | אסמכתא: [מקור]`,
    `מק״ט נבדק מול קטלוג פעיל | מק״ט: [מספר] | תיאור: [תיאור] | גרסת קטלוג: [תאריך] | תוצאה: [תוצאה]`,
  ];
}
const MIN_EVIDENCE = 12;
const isDocumented = (text: string | undefined) => {
  const value = (text || "").trim();
  return value.length >= MIN_EVIDENCE && !/(\[[^\]]+\]|_{3,}|להשלים|בחר מקור|יש למלא|הקלד כאן)/i.test(value);
};

const BTN =
  "group relative inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 font-display text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none";

function Shine() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full -skew-x-12 bg-white/25 transition-transform duration-700 ease-out motion-safe:group-hover:translate-x-[400%] motion-reduce:hidden"
    />
  );
}

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const fmt = (v: number) =>
    v.toLocaleString("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = fmt(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        node.textContent = fmt(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, reduce]);

  return (
    <span ref={ref} className="tabular-nums">
      {fmt(0)}
    </span>
  );
}

/* ───────────────────────────── Metric card ───────────────────────────── */

type MetricState = "ok" | "loading" | "missing";

interface MetricProps {
  index: number;
  label: string;
  icon: LucideIcon;
  tone: string;
  surface: string;
  state?: MetricState;
  children: ReactNode;
  footer?: ReactNode;
  /** כשמוגדר — הכרטיס הופך לכפתור */
  onClick?: () => void;
  actionLabel?: string;
}

const MetricCard = memo(function MetricCard({
  index,
  label,
  icon: Icon,
  tone,
  surface,
  state = "ok",
  children,
  footer,
  onClick,
  actionLabel,
}: MetricProps) {
  const reduce = useReducedMotion();
  const shell =
    "group relative block h-full w-full overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-4 text-start shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transform-none";

  const body = (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 origin-right scale-x-0 bg-gradient-to-l from-primary via-primary/40 to-transparent transition-transform duration-300 group-hover:scale-x-100 motion-reduce:transition-none"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-2xl font-extrabold tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
            {state === "loading" ? (
              <span className="block h-8 w-20 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-label="טוען" />
            ) : state === "missing" ? (
              <span className="text-muted-foreground" aria-label="אין נתונים">
                —
              </span>
            ) : (
              children
            )}
          </div>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 motion-reduce:transform-none ${surface} ${tone}`}
        >
          {state === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Icon className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </>
  );

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.07, ease: "easeOut" }}
      className="min-w-[200px] shrink-0 snap-start md:min-w-0"
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${label}. ${actionLabel ?? "פעולה"}`}
          className={`${shell} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]`}
        >
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </motion.li>
  );
});

/* ───────────────────────────── Approval stepper ───────────────────────────── */

interface Step {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  icon: LucideIcon;
}

function ApprovalStepper({ steps }: { steps: Step[] }) {
  const reduce = useReducedMotion();
  const currentIndex = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <nav aria-label="התקדמות אישורים" className="rounded-3xl border border-border/70 bg-card p-4 shadow-card md:p-5">
      <p role="status" aria-atomic="true" className="sr-only">
        {currentIndex === -1 ? "כל שלבי האישור הושלמו" : `שלב ${currentIndex + 1} מתוך ${steps.length}: ${steps[currentIndex].label}`}
      </p>
      <ol className="relative flex items-start justify-between gap-2">
        {/* קו רקע + קו התקדמות */}
        <div aria-hidden="true" className="absolute inset-x-8 top-5 h-1 rounded-full bg-muted">
          <motion.div
            className="h-full origin-right rounded-full bg-gradient-to-l from-emerald-500 to-primary"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: steps.length > 1 ? doneCount / (steps.length - 1) : 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 18 }}
            style={{ transformOrigin: "right" }}
          />
        </div>
        {steps.map((s, i) => {
          const Icon = s.icon;
          const current = i === currentIndex;
          return (
            <li key={s.key} className="relative z-10 flex flex-1 flex-col items-center text-center" aria-current={current ? "step" : undefined}>
              <motion.span
                animate={s.done ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                transition={{ duration: reduce ? 0 : 0.45 }}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                  s.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : current
                      ? "border-primary bg-card text-primary shadow-md ring-4 ring-primary/15"
                      : "border-border bg-card text-muted-foreground"
                }`}
              >
                {s.done ? <Check className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
              </motion.span>
              <span className={`mt-2 text-xs font-bold ${s.done || current ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
              <span className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">{s.hint}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ───────────────────────────── Audit row (accordion) ───────────────────────────── */

interface AuditRowProps {
  finding: Finding;
  evidence: string;
  onChange: (id: string, value: string) => void;
  open: boolean;
  onToggle: (id: string) => void;
}

const AuditRow = memo(function AuditRow({ finding, evidence, onChange, open, onToggle }: AuditRowProps) {
  const reduce = useReducedMotion();
  const documented = isDocumented(evidence);
  const len = evidence.trim().length;
  const panelId = `audit-${finding.id}`;

  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className={`overflow-hidden rounded-2xl border transition-colors duration-300 ${
        documented ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(finding.id)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 p-3.5 text-start transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            documented ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
          }`}
        >
          {documented ? <Check className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-extrabold">{finding.title}</span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold">{finding.category}</span>
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {documented ? "אסמכתא תועדה" : "ממתין לאסמכתא"}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-border/60 p-4">
              <p className="text-xs leading-6 text-muted-foreground">{finding.detail}</p>
              <p className="text-xs">
                <strong>נדרש לאמת מול:</strong> {finding.sourceRequired}
              </p>
              {(finding.expected || finding.observed) && (
                <p className="text-xs">
                  <strong>צפוי:</strong> {finding.expected || "לא הוגדר"} · <strong>נצפה:</strong> {finding.observed || "לא זוהה"}
                </p>
              )}
              <label className="block space-y-1.5">
                <span className="text-xs font-bold">תשובה מוכנה מראש</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) onChange(finding.id, e.target.value);
                    e.currentTarget.value = "";
                  }}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">בחר תבנית למילוי…</option>
                  {evidenceTemplates(finding).map((template, index) => (
                    <option key={index} value={template}>{index + 1}. {template.split("|")[0]}</option>
                  ))}
                </select>
                <span className="block text-[10px] text-muted-foreground">התבנית אינה נחשבת אסמכתא עד להחלפת כל הסוגריים בפרטי בדיקה אמיתיים.</span>
              </label>
              <label className="block space-y-1.5">
                <span className="flex items-center justify-between text-xs font-bold">
                  <span>הפניה לאסמכתא / תוצאת בדיקה</span>
                  <span className={`tabular-nums ${documented ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {Math.min(len, MIN_EVIDENCE)}/{MIN_EVIDENCE}
                  </span>
                </span>
                <textarea
                  value={evidence}
                  onChange={(e) => onChange(finding.id, e.target.value)}
                  rows={2}
                  placeholder="למשל: PDF עמוד 2 שורה 4; הזמנה 12345; אישור הנהג מתאריך..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs leading-5 outline-none transition-shadow duration-200 focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
});

/* ───────────────────────────── Center state (loading / error / empty) ───────────────────────────── */

function CenterState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center"
      dir="rtl"
    >
      {icon}
      <h2 className="text-lg font-bold">{title}</h2>
      {text && <p className="max-w-md text-xs text-muted-foreground">{text}</p>}
      {action}
    </motion.div>
  );
}

/* ───────────────────────────── Comax manifest sync ───────────────────────────── */
const SKU_BALES = "60002";
const SKU_PALLETS = "60060";

interface ManifestRow {
  sku: string;
  name: string;
  qty: number;
  unit: string;
  unitWeightKg: number;
}

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

async function fetchManifest(orderId: string): Promise<ManifestRow[]> {
  const result = await getManifestFn({ data: { orderId } });
  return result.items.map((row) => ({
    sku: String(row.sku || "").trim(),
    name: String(row.name || ""),
    qty: toNum(row.qty),
    unit: String(row.unit || "יח׳"),
    unitWeightKg: toNum(row.unitWeightKg),
  }));
}

const sumSku = (rows: ManifestRow[], sku: string) =>
  rows.reduce((s, r) => (r.sku === sku ? s + r.qty : s), 0);

/* ───────────────────────────── Page ───────────────────────────── */

function Viewer() {
  const { id } = Route.useParams();
  const apState = useApprovals();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const [customNote, setCustomNote] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [isApprovingRami, setIsApprovingRami] = useState(false);
  const [isOpeningTask, setIsOpeningTask] = useState(false);
  const [auditEvidence, setAuditEvidence] = useState<Record<string, string>>({});
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [showAllAuditFindings, setShowAllAuditFindings] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`noa-logistics-audit:${id}`);
      setAuditEvidence(saved ? (JSON.parse(saved) as Record<string, string>) : {});
    } catch {
      setAuditEvidence({});
    } finally {
      setAuditLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    if (!auditLoaded) return;
    try {
      localStorage.setItem(`noa-logistics-audit:${id}`, JSON.stringify(auditEvidence));
    } catch {
      // Keep the gate active in memory if browser persistence is unavailable.
    }
  }, [id, auditEvidence, auditLoaded]);

  const workroomQuery = useQuery({
    queryKey: ["workroom", "note-thread", id],
    queryFn: listWorkroomInquiriesFn,
    staleTime: 20_000,
    retry: 1,
  });

  const relatedInquiry: WorkroomInquiry | undefined = workroomQuery.data?.inquiries.find(
    (item) =>
      String(item.docNumber) === String(id) ||
      String(item.id) === String(id) ||
      String(item.task?.noteId || "") === String(id),
  );
  const returnedToRami = relatedInquiry?.status === "returned_to_rami";
  useEffect(() => {
    if (!returnedToRami) return;
    setAuditEvidence({});
    try {
      localStorage.removeItem(`noa-logistics-audit:${id}`);
    } catch {
      // The server-side return status remains authoritative if storage is unavailable.
    }
  }, [returnedToRami, id]);

  // שליפת תעודות חיות מהגיליון לפי מזהה התעודה ללא נתוני דמה
  const {
    data: notes,
    isLoading,
    error,
    refetch,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes"],
    queryFn: fetchLiveNotes,
    staleTime: 30000,
  });

  const n = notes?.find((x) => x.id === id);

  // טעינת הסריקה האמיתית מ-Google Drive דרך שרת Apps Script
  const {
    data: scanSrc,
    isLoading: isLoadingScan,
    error: scanError,
    refetch: refetchScan,
  } = useQuery({
    queryKey: ["scan", n?.fileId],
    enabled: !!n?.fileId,
    staleTime: Infinity,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: n!.fileId! } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  // המניפסט נשלף רק כשהתעודה עצמה ללא שורות פריטים ויש לה מספר הזמנת קומקס
  const noteHasItems = (n?.items?.length ?? 0) > 0;
  const manifestQuery = useQuery({
    queryKey: ["comax-manifest", n?.comaxOrder],
    enabled: !!n && !noteHasItems && !!n.comaxOrder,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => fetchManifest(String(n!.comaxOrder)),
  });

  const handleOpenTask = async () => {
    setIsOpeningTask(true);
    try {
      await openOrCreateWorkroomTaskFn({
        data: {
          noteId: id,
          customer: n?.customer,
          customerNo: n?.customerNo,
          address: n?.siteAddress,
          driver: n?.driver,
          issue: customNote.trim() || n?.craneTime || "בדיקה וטיפול בתעודת המשלוח",
          fileId: n?.fileId,
          driveUrl: n?.driveUrl,
        },
      });
      await workroomQuery.refetch();
      await navigate({ to: "/inquiry", search: { task: id, tab: "tasks" } });
      toast.success(`נפתחה או אותרה משימה לתעודה ${id}`);
    } catch (err) {
      toast.error("לא ניתן לפתוח משימה לתעודה", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsOpeningTask(false);
    }
  };

  const handleThreadReply = async (text: string, replyToId?: string) => {
    if (!relatedInquiry) throw new Error("לא נמצא תיק בירור מקושר לתעודה זו");
    await ramiReplyFn({
      data: { inquiryId: relatedInquiry.id, noteId: id, text, replyToId },
    });
    await workroomQuery.refetch();
    toast.success("המענה נשמר בשרשור הבירור");
  };

  const setEvidence = (findingId: string, value: string) =>
    setAuditEvidence((previous) => ({ ...previous, [findingId]: value }));

  const toggleRow = (findingId: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });

  if (isLoading) {
    return (
      <CenterState
        icon={<Loader2 className="h-10 w-10 animate-spin text-primary motion-reduce:animate-none" />}
        title="טוען תעודה מהגיליון..."
        text="מתחבר ל-Google Apps Script ללא נתוני דמה"
      />
    );
  }

  if (error) {
    return (
      <CenterState
        icon={<AlertTriangle className="h-12 w-12 text-destructive" />}
        title="שגיאה בטעינת התעודה מהגיליון"
        text={error instanceof Error ? error.message : "כשל בחיבור"}
        action={
          <Button onClick={() => refetch()} className="min-h-11 gap-2 rounded-full">
            <RefreshCw className="h-4 w-4" />
            <span>נסה שוב</span>
          </Button>
        }
      />
    );
  }

  if (!n) {
    return (
      <CenterState
        icon={<FileText className="h-12 w-12 text-muted-foreground" />}
        title={`תעודה #${id} לא נמצאה בגיליון`}
        text="ייתכן שהתעודה טרם נסרקה או שמספרה שונה בגיליון Google Sheets"
        action={
          <Button asChild variant="outline" className="min-h-11 rounded-full">
            <Link to="/notes" className="gap-2">
              <ArrowRight className="h-4 w-4" />
              <span>חזרה לארכיון התעודות</span>
            </Link>
          </Button>
        }
      />
    );
  }

  const ap = apState[n.id];
  const ramiApprovalActive = Boolean(ap?.rami) && !returnedToRami;
  const a = auditNote(n);
  const auditFindings = buildLogisticsFindings(n);
  const auditComplete = isLogisticsAuditComplete(auditFindings, auditEvidence);
  const auditEvidenceCount = auditFindings.filter((finding) => isDocumented(auditEvidence[finding.id])).length;
  const auditPct = auditFindings.length ? (auditEvidenceCount / auditFindings.length) * 100 : 0;

  /* ── נתוני כרטיסי המדדים: מהתעודה אם קיימים, אחרת ממניפסט קומקס ── */
  const manifest = manifestQuery.data ?? [];
  const syncing = manifestQuery.isFetching;
  const lineCount = noteHasItems ? n.items!.length : manifest.length;
  const itemsCount = noteHasItems ? noteItemsCount(n) : manifest.reduce((sum, r) => sum + r.qty, 0);
  const weightKg = noteHasItems ? noteWeightKg(n) : manifest.reduce((sum, r) => sum + r.qty * r.unitWeightKg, 0);
  const balesDelivered = n.deposits?.bales60002?.delivered ?? sumSku(manifest, SKU_BALES);
  const palletsDelivered = n.deposits?.pallets60060?.delivered ?? sumSku(manifest, SKU_PALLETS);
  const depositsKnown =
    n.deposits?.bales60002 !== undefined || n.deposits?.pallets60060 !== undefined || manifest.length > 0;
  const sourceLabel = noteHasItems ? "מהתעודה" : "מקומקס";
  const dataState: MetricState = lineCount > 0 ? "ok" : syncing ? "loading" : "missing";
  const depositState: MetricState = depositsKnown ? "ok" : syncing ? "loading" : "missing";
  const missingHint = !n.comaxOrder
    ? "אין מספר הזמנת קומקס בתעודה"
    : manifestQuery.isError
        ? `שגיאת סנכרון: ${manifestQuery.error instanceof Error ? manifestQuery.error.message : "כשל"}`
        : "לחץ לסנכרון מקומקס";

  const syncManifest = () => {
    if (!n.comaxOrder) {
      toast.error("לתעודה אין מספר הזמנת קומקס לסנכרון");
      return;
    }
    void manifestQuery.refetch().then((r) => {
      if (r.isError) toast.error("סנכרון קומקס נכשל", { description: r.error instanceof Error ? r.error.message : undefined });
      else toast.success(`נטענו ${r.data?.length ?? 0} שורות מקומקס`);
    });
  };

  const scrollToAudit = (focusFirstMissing: boolean) => {
    if (focusFirstMissing) {
      const idx = auditFindings.findIndex((f) => !isDocumented(auditEvidence[f.id]));
      if (idx >= 0) {
        if (idx >= 8) setShowAllAuditFindings(true);
        setOpenRows(new Set([auditFindings[idx].id]));
      }
    }
    document.getElementById("audit-section")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const visibleFindings = (() => {
    const base = onlyMissing ? auditFindings.filter((f) => !isDocumented(auditEvidence[f.id])) : auditFindings;
    return showAllAuditFindings || onlyMissing ? base : base.slice(0, 8);
  })();

  const steps: Step[] = [
    { key: "audit", label: "בקרת נועה AI", hint: `${auditEvidenceCount}/${auditFindings.length} אסמכתאות`, done: auditComplete, icon: Brain },
    { key: "rami", label: "אישור ראמי", hint: ramiApprovalActive ? ap!.rami!.at : "ממתין לבדיקה / תיקון", done: ramiApprovalActive, icon: Stamp },
    { key: "harel", label: "אישור מנכ״ל", hint: ap?.harel && !returnedToRami ? ap.harel.at : "ממתין לאישור ראמי", done: Boolean(ap?.harel) && !returnedToRami, icon: Crown },
  ];

  const handleRamiApproval = async () => {
    if (!auditComplete) {
      toast.error("האישור נחסם: נדרשת השלמת בדיקת הלוגיסטיקה", {
        description: `תועדו אסמכתאות ל-${auditEvidenceCount} מתוך ${auditFindings.length} בדיקות.`,
      });
      return;
    }
    setIsApprovingRami(true);
    try {
      await approveStrict(n.id, "rami", customNote.trim() || undefined, auditEvidence);
      approvals.rami(n.id, customNote.trim() || undefined);
      void playDispatchChime(0.85);
      toast.success(`ת.מ. ${n.id} נבדקה ואושרה אישית ע״י ראמי מסארווה`);
    } catch (err) {
      toast.error("אישור ראמי נדחה ע״י השרת", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsApprovingRami(false);
    }
  };

  const stampMotion = reduce
    ? { initial: false as const }
    : {
        initial: { opacity: 0, scale: 1.6, rotate: -8 },
        animate: { opacity: 1, scale: 1, rotate: 0 },
        transition: { type: "spring" as const, stiffness: 320, damping: 20 },
      };

  return (
    <>
      <PageHeader
        title={`ת.מ. ${n.id}`}
        subtitle={`${n.customer} · הזמנת קומקס #${n.comaxOrder || n.id}`}
        action={<StatusPill s={a.status} />}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        {/* שורת מדדים */}
        <section aria-label="סיכום תעודה">
          <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] md:grid md:grid-cols-4 md:overflow-visible [&::-webkit-scrollbar]:hidden">
            <MetricCard
              index={0}
              label="כמות פריטים · יחידות"
              icon={Layers}
              tone="text-sky-700 dark:text-sky-300"
              surface="bg-sky-500/10"
              state={dataState}
              onClick={!noteHasItems ? syncManifest : undefined}
              actionLabel={dataState === "ok" ? "לחיצה לרענון המניפסט מקומקס" : "לחיצה לסנכרון מניפסט מקומקס"}
              footer={
                <p className={`flex items-center gap-1 text-[11px] ${dataState === "missing" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
                  {!noteHasItems && <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />}
                  {dataState === "ok" ? `${lineCount} שורות · ${sourceLabel}` : dataState === "loading" ? "מסנכרן מקומקס…" : missingHint}
                </p>
              }
            >
              <AnimatedNumber value={itemsCount} />
            </MetricCard>

            <MetricCard
              index={1}
              label="משקל מוערך"
              icon={Scale}
              tone="text-slate-700 dark:text-slate-200"
              surface="bg-slate-500/10"
              state={dataState}
              onClick={!noteHasItems ? syncManifest : undefined}
              actionLabel="לחיצה לסנכרון מניפסט מקומקס"
              footer={
                <p className={`text-[11px] tabular-nums ${dataState === "missing" || weightKg === 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
                  {dataState === "ok"
                    ? weightKg > 0
                      ? `${Math.round(weightKg).toLocaleString("he-IL")} ק״ג`
                      : "חסר משקל יחידה בשורות"
                    : dataState === "loading"
                      ? "מסנכרן מקומקס…"
                      : missingHint}
                </p>
              }
            >
              <span className="flex items-baseline gap-1.5">
                <AnimatedNumber value={weightKg / 1000} decimals={2} />
                <span className="text-sm font-semibold text-muted-foreground">טון</span>
              </span>
            </MetricCard>

            <MetricCard
              index={2}
              label="פיקדונות שסופקו"
              icon={Boxes}
              tone="text-amber-700 dark:text-amber-300"
              surface="bg-amber-500/10"
              state={depositState}
              onClick={() => scrollToAudit(false)}
              actionLabel="מעבר לבדיקות הפיקדון"
              footer={
                <p className="text-[11px] text-muted-foreground">
                  בלות {SKU_BALES} · משטחים {SKU_PALLETS}
                </p>
              }
            >
              <span className="flex items-baseline gap-2 tabular-nums">
                <AnimatedNumber value={balesDelivered} />
                <span className="text-base text-muted-foreground">/</span>
                <AnimatedNumber value={palletsDelivered} />
              </span>
            </MetricCard>

            <MetricCard
              index={3}
              label="בקרת לוגיסטיקה"
              icon={ShieldCheck}
              tone={auditComplete ? "text-emerald-700 dark:text-emerald-300" : "text-orange-700 dark:text-orange-300"}
              surface={auditComplete ? "bg-emerald-500/10" : "bg-orange-500/10"}
              onClick={() => scrollToAudit(!auditComplete)}
              actionLabel={auditComplete ? "מעבר לבקרת הלוגיסטיקה" : "מעבר לבדיקה הראשונה החסרה"}
              footer={
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <motion.div
                    className={`h-full rounded-full ${auditComplete ? "bg-emerald-500" : "bg-orange-500"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${auditPct}%` }}
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 110, damping: 20 }}
                  />
                </div>
              }
            >
              <span className="tabular-nums">
                {auditEvidenceCount}/{auditFindings.length}
              </span>
            </MetricCard>
          </ul>
        </section>

        {/* שלבי אישור */}
        <ApprovalStepper steps={steps} />

        {/* מעבר מהיר לקנבס */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3 text-xs">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-semibold">רוצה לחתום, להטביע חותמת או לסמן במרקר על גבי התעודה?</span>
          </div>
          <Button asChild size="sm" className="min-h-11 gap-1.5 rounded-full px-5 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95 motion-reduce:transform-none">
            <Link to="/canvas" search={{ id: n.id }}>
              <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
              <span>פתח בעורך הקנבס</span>
            </Link>
          </Button>
        </div>

        {/* באנר אישור סופי */}
        <AnimatePresence>
          {((ap?.harel && !returnedToRami) || showCelebration) && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white shadow-lift"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs">
                  <Crown className="h-7 w-7 text-amber-300" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h3 className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold">
                    <span>אושר סופית לחיוב ע״י הראל אידלסון (מנכ״ל)</span>
                    <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold text-amber-200">סגירת מעגל 100%</span>
                  </h3>
                  <p className="text-xs leading-relaxed text-emerald-100">
                    נשלחה הודעת אימות אוטומטית ללינה בהנהלת חשבונות (<strong>lina@saban94.co.il</strong>) להפקת חשבונית מס, ועודכן יומן הפיקוח ב-Google Drive.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* סריקה + צד */}
        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {!n.fileId ? (
              <div className="flex h-[520px] flex-col items-center justify-center space-y-3 rounded-3xl border border-border/80 bg-card p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
                <p className="text-sm font-bold">לתעודה זו לא קיים קובץ סריקה מקושר ב-Drive</p>
                <p className="text-xs text-muted-foreground">ודא שגליה סרקה את התעודה וקישור הדרייב קיים בעמודה K או T בגיליון</p>
              </div>
            ) : isLoadingScan ? (
              <div className="flex h-[520px] flex-col items-center justify-center space-y-4 rounded-3xl border border-border/80 bg-card p-6 text-center">
                <div className="w-48 space-y-2" aria-hidden="true">
                  <div className="h-3 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                  <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                  <div className="h-3 w-3/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
                </div>
                <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                <p className="text-sm font-bold">טוען סריקה מקורית מ-Google Drive...</p>
                <p className="text-xs text-muted-foreground">חילוץ PDF ורינדור עמוד ראשון דרך שרת Apps Script</p>
              </div>
            ) : scanError || !scanSrc ? (
              <div className="flex h-[520px] flex-col items-center justify-center space-y-3 rounded-3xl border border-destructive/30 bg-card p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
                <p className="text-sm font-bold text-destructive">לא ניתן לטעון את הסריקה המקורית מ-Drive</p>
                <p className="text-xs text-muted-foreground">{scanError instanceof Error ? scanError.message : "כשל בשליפת הקובץ"}</p>
                <Button size="sm" className="min-h-11 rounded-full px-5" onClick={() => refetchScan()}>
                  נסה שוב
                </Button>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card">
                <div className={`${zoomed ? "max-h-[75vh] overflow-auto" : "overflow-hidden"}`}>
                  <motion.img
                    initial={reduce ? false : { opacity: 0, filter: "blur(10px)", scale: 1.02 }}
                    animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    src={scanSrc}
                    alt={`סריקת תעודה ${n.id}`}
                    className={`select-none object-contain transition-[width] duration-300 motion-reduce:transition-none ${zoomed ? "w-[170%] max-w-none" : "w-full"}`}
                    loading="eager"
                  />
                </div>

                {/* תג בקרה */}
                <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-xl border border-border/50 bg-card/85 px-3 py-1.5 text-xs font-bold text-foreground shadow-sm backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>
                    {n.live ? "שכבת בקרת נועה AI · טרם הוצלב מול קומקס/איתוראן" : "שכבת בקרת נועה AI · אומת 1:1"}
                  </span>
                </div>

                {/* זום */}
                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  aria-pressed={zoomed}
                  aria-label={zoomed ? "הקטנת הסריקה" : "הגדלת הסריקה"}
                  className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border/50 bg-card/90 text-foreground shadow-sm backdrop-blur-md transition-all duration-200 hover:scale-105 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 motion-reduce:transform-none"
                >
                  {zoomed ? <ZoomOut className="h-5 w-5" aria-hidden="true" /> : <ZoomIn className="h-5 w-5" aria-hidden="true" />}
                </button>

                {/* חותמות */}
                <AnimatePresence>
                  {ap?.rami && !returnedToRami && (
                    <motion.div
                      key="rami-stamp"
                      {...stampMotion}
                      className="stamp pointer-events-none absolute bottom-16 left-6 border-rami/80 bg-card/75 text-sm text-rami shadow-md backdrop-blur-md"
                    >
                      ח. סבן — נבדק ואושר אישית ע״י ראמי מסארווה
                      <br />
                      <span className="font-mono text-xs opacity-90">{ap.rami.at}</span>
                    </motion.div>
                  )}
                  {ap?.harel && !returnedToRami && (
                    <motion.div
                      key="harel-stamp"
                      {...stampMotion}
                      className="stamp pointer-events-none absolute bottom-40 right-6 border-ceo/80 bg-card/75 text-sm text-ceo shadow-md backdrop-blur-md"
                    >
                      ח. סבן (1994) בע״מ — אושר סופית לחיוב
                      <br />
                      <span className="font-bold">הראל אידלסון (מנכ״ל)</span> · <span className="font-mono text-xs">{ap.harel.at}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            {/* דוח בקרת נועה */}
            <div className="space-y-3 rounded-3xl border border-border/70 bg-card p-5 shadow-card">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="font-display text-base font-bold">דוח בקרת נועה AI</h2>
                </div>
                <StatusPill s={a.status} />
              </div>
              <ul className="space-y-2 text-xs">
                {a.findings.map((f, i) => (
                  <motion.li
                    key={i}
                    initial={reduce ? false : { opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: reduce ? 0 : i * 0.05 }}
                    className="flex items-start gap-2 rounded-xl bg-muted/40 p-2.5"
                  >
                    {f.status === "ok" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="תקין" />
                    ) : f.status === "warn" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="אזהרה" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="שגיאה" />
                    )}
                    <span className="font-medium leading-relaxed text-foreground/90">{f.text}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* אישור וחתימה */}
            <div className="space-y-3 rounded-3xl border border-border/70 bg-card p-5 shadow-card">
              <h3 className="font-display text-sm font-bold text-foreground">אישור וחתימה דיגיטלית</h3>
              <label className="block">
                <span className="sr-only">הערה לחתימה</span>
                <input
                  type="text"
                  placeholder="הערה לחתימה (אופציונלי)..."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="h-11 w-full rounded-2xl border bg-muted/50 px-3 text-xs text-foreground outline-none transition-shadow duration-200 placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                />
              </label>

              {!auditComplete && !ap?.rami && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-5 text-amber-900 dark:text-amber-200">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  האישור נעול עד שיתועדו אסמכתאות לכל בדיקות הלוגיסטיקה ({auditEvidenceCount}/{auditFindings.length}).
                </p>
              )}

              <AnimatePresence mode="wait" initial={false}>
                {!ramiApprovalActive && (
                  <motion.button
                    key="rami-btn"
                    type="button"
                    onClick={handleRamiApproval}
                    disabled={isApprovingRami}
                    aria-busy={isApprovingRami}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className={`${BTN} bg-rami text-rami-foreground shadow-md hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-rami ${auditComplete ? "" : "opacity-80"}`}
                  >
                    <Shine />
                    {isApprovingRami ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : auditComplete ? (
                      <PenTool className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Lock className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="relative">{isApprovingRami ? "מאשר בשרת..." : "נבדק ואושר אישית ע״י ראמי"}</span>
                  </motion.button>
                )}

                {ramiApprovalActive && !ap?.harel && !returnedToRami && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6 text-foreground">
                    <div className="flex items-center gap-2 font-bold"><Crown className="h-4 w-4 text-primary" /> הועבר להראל להחלטה ניהולית</div>
                    <p className="mt-1 text-muted-foreground">הראל יקבל את דוח נועה ואת אישור ראמי. אין צורך למלא מחדש את תשובות הבקרה במסך זה.</p>
                  </div>
                )}              </AnimatePresence>

              {ap && (
                <button
                  type="button"
                  onClick={() => {
                    approvals.reset(n.id);
                    setShowCelebration(false);
                    toast.info("חתימות התעודה אופסו");
                  }}
                  className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border py-2 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  איפוס חתימות
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* בקרת לוגיסטיקה מלאה */}
        <section id="audit-section" className="scroll-mt-4 space-y-4 rounded-3xl border border-amber-500/30 bg-card p-5 shadow-card" aria-label="בקרת לוגיסטיקה של נועה">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
                <Brain className="h-5 w-5 text-amber-600" aria-hidden="true" />
                בקרת לוגיסטיקה מלאה · נועה AI
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                כמויות, מק״טים, פיקדונות, שירותי הובלה ומקור התעודה — אין אישור לפני תיעוד כל בדיקה.
              </p>
            </div>
            <span
              role="status"
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                auditComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
              }`}
            >
              {auditComplete ? "כל הבדיקות תועדו" : `נדרשות אסמכתאות · ${auditEvidenceCount}/${auditFindings.length}`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="h-2 min-w-[160px] flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <motion.div
                className={`h-full rounded-full ${auditComplete ? "bg-emerald-500" : "bg-amber-500"}`}
                initial={{ width: 0 }}
                animate={{ width: `${auditPct}%` }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 110, damping: 20 }}
              />
            </div>
            <button
              type="button"
              aria-pressed={onlyMissing}
              onClick={() => setOnlyMissing((v) => !v)}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 ${
                onlyMissing ? "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "border-border hover:bg-muted"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              רק חסרות ({auditFindings.length - auditEvidenceCount})
            </button>
          </div>

          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {visibleFindings.map((finding) => (
                <AuditRow
                  key={finding.id}
                  finding={finding}
                  evidence={auditEvidence[finding.id] || ""}
                  onChange={setEvidence}
                  open={openRows.has(finding.id)}
                  onToggle={toggleRow}
                />
              ))}
            </AnimatePresence>
            {visibleFindings.length === 0 && (
              <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                אין בדיקות חסרות — כל האסמכתאות תועדו.
              </li>
            )}
          </ul>

          {!onlyMissing && auditFindings.length > 8 && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 rounded-full px-5 transition-all duration-200 active:scale-95"
              onClick={() => setShowAllAuditFindings((value) => !value)}
            >
              {showAllAuditFindings ? "הצג פחות בדיקות" : `הצג את כל ${auditFindings.length} הבדיקות`}
            </Button>
          )}

          <p className="text-xs leading-6 text-muted-foreground">
            חשוב: תיעוד זה נשמר כרגע בדפדפן המקומי בלבד ואינו הוכחה עצמאית לאימות. אין כאן חילוץ אוטומטי של PDF או הצלבה חיה מול קומקס/צי רכב; יש לצרף אסמכתאות אמיתיות. יש להשלים שמירה ואכיפה בצד השרת לפני שימוש כתהליך ביקורת מחייב.
          </p>
        </section>

        {/* שרשור ראמי ↔ הראל */}
        <section className="space-y-4 rounded-3xl border border-border/70 bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
                <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
                שרשור בירור · ראמי ↔ הראל
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">הודעות נשמרות דרך שרת העבודה ומקושרות לתעודה</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="group min-h-11 gap-2 rounded-full px-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-95 motion-reduce:transform-none"
                onClick={() => void handleOpenTask()}
                disabled={isOpeningTask}
              >
                {isOpeningTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />}
                {isOpeningTask ? "פותח משימה..." : "פתח / צור משימה לתעודה"}
              </Button>
              <Button asChild size="sm" variant="outline" className="group min-h-11 gap-2 rounded-full px-5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 motion-reduce:transform-none">
                <Link to="/harel">
                  לוח המשימות של הראל
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {workroomQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              טוען שרשור מהשרת...
            </div>
          ) : workroomQuery.error ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-bold">לא ניתן לטעון את שרשור הבירור</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {workroomQuery.error instanceof Error ? workroomQuery.error.message : "שגיאת חיבור לשרת"}
              </p>
              <Button className="mt-3 min-h-11 rounded-full px-5" size="sm" variant="outline" onClick={() => void workroomQuery.refetch()}>
                נסה שוב
              </Button>
            </div>
          ) : relatedInquiry ? (
            <InquiryThread messages={relatedInquiry.thread || []} onReply={handleThreadReply} />
          ) : (
            <div className="rounded-2xl border border-dashed p-5 text-center">
              <p className="text-sm font-bold">לא נמצא תיק בירור מקושר לתעודה {n.id}</p>
              <p className="mt-1 text-xs text-muted-foreground">אפשר לפתוח את לוח המשימות של הראל כדי לאתר או ליצור תיק מקושר.</p>
              <Button size="sm" className="mt-3 min-h-11 rounded-full px-5" onClick={() => void handleOpenTask()} disabled={isOpeningTask}>
                {isOpeningTask ? "פותח משימה..." : "פתיחת תיק הבירור והמשימה"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
