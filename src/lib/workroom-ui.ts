/**
 * עזרי UI משותפים ל-/inquiry ול-/harel:
 * פענוח search params, צבעי סטטוס סמנטיים, «היום», ופענוח תשובת OneSignal.
 */

import type { InquiryStatus, InquiryTask } from "@/lib/inquiry-workflow";
import { isOverdue } from "@/lib/inquiry-workflow";

export type InquiryTab = "tasks" | "pending_harel" | "all";

/**
 * TanStack Router מפענח ערכי search כ-JSON, כך ש-?task=6715841 מגיע כמספר.
 * לכן מקבלים גם string וגם number ומחזירים תמיד string (או undefined).
 */
export function parseTaskParam(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return undefined;
}

export function parseTabParam(raw: unknown): InquiryTab | undefined {
  return raw === "tasks" || raw === "pending_harel" || raw === "all" ? raw : undefined;
}

/** הטאב הנכון ב-/inquiry לפי סטטוס התיק — כדי שקישור «פתיחת משימה» ינחת במקום הנכון. */
export function inquiryTabForStatus(status: InquiryStatus): InquiryTab {
  if (status === "returned_to_rami" || status === "pending_rami") return "tasks";
  if (status === "pending_harel") return "pending_harel";
  return "all";
}

export type WorkroomTone = "sky" | "amber" | "orange" | "emerald" | "destructive" | "muted";

/** מחלקות Tailwind לכל גוון — מקור אמת אחד לשני המסכים. */
export const TONE: Record<
  WorkroomTone,
  { text: string; surface: string; border: string; ring: string; dot: string }
> = {
  sky: {
    text: "text-sky-700 dark:text-sky-300",
    surface: "bg-sky-500/10",
    border: "border-sky-500/30",
    ring: "ring-sky-500/30",
    dot: "bg-sky-500",
  },
  amber: {
    text: "text-amber-800 dark:text-amber-200",
    surface: "bg-amber-500/10",
    border: "border-amber-500/30",
    ring: "ring-amber-500/30",
    dot: "bg-amber-500",
  },
  orange: {
    text: "text-orange-800 dark:text-orange-200",
    surface: "bg-orange-500/10",
    border: "border-orange-500/30",
    ring: "ring-orange-500/30",
    dot: "bg-orange-500",
  },
  emerald: {
    text: "text-emerald-700 dark:text-emerald-300",
    surface: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-500",
  },
  destructive: {
    text: "text-destructive",
    surface: "bg-destructive/10",
    border: "border-destructive/30",
    ring: "ring-destructive/40",
    dot: "bg-destructive",
  },
  muted: {
    text: "text-muted-foreground",
    surface: "bg-muted",
    border: "border-border/70",
    ring: "ring-border",
    dot: "bg-muted-foreground",
  },
};

/** pending_harel=amber · returned_to_rami/משימה פתוחה=orange · approved=emerald · באיחור=destructive */
export function statusTone(status: InquiryStatus, task?: InquiryTask | null): WorkroomTone {
  if (task?.status === "open" && isOverdue(task)) return "destructive";
  switch (status) {
    case "pending_harel":
      return "amber";
    case "returned_to_rami":
    case "pending_rami":
      return "orange";
    case "approved":
      return "emerald";
    case "rejected":
      return "destructive";
    default:
      return "muted";
  }
}

const IL_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** האם התאריך (ISO) נופל ב«היום» לפי שעון ישראל. ערך ריק/לא תקין → false. */
export function isTodayInIsrael(iso: string | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return IL_DAY.format(d) === IL_DAY.format(now);
}

/**
 * OneSignal מחזיר { id, errors? }. id לא ריק בלי errors = הבקשה התקבלה.
 * (זה לא מאמת מסירה למכשיר — רק שהשרת קיבל את הבקשה.)
 */
export function notificationAccepted(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const r = response as Record<string, unknown>;
  const id = r["id"];
  const errors = r["errors"];
  const hasErrors =
    typeof errors === "string"
      ? errors.length > 0
      : Array.isArray(errors)
        ? errors.length > 0
        : Boolean(errors && typeof errors === "object" && Object.keys(errors).length > 0);
  return typeof id === "string" && id.length > 0 && !hasErrors;
}

export type NotifyState =
  | { state: "idle" }
  | { state: "sending"; noteId: string; target: "harel" | "rami" }
  | { state: "sent" | "failed"; noteId: string; target: "harel" | "rami"; at: string };

/** כפתורים/קישורים אחידים בשני המסכים. */
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transform-none";

export const WORKROOM_BTN = {
  /** ראשי: rounded-xl · min-h-11 · primary */
  primary: `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-primary ${FOCUS}`,
  /** משני: outline + hover lift */
  secondary: `inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-background px-3 py-2 text-xs font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted hover:shadow focus-visible:ring-primary ${FOCUS}`,
  /** קישור משימה (ראמי) */
  task: `inline-flex items-center justify-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-orange-500/15 hover:shadow focus-visible:ring-orange-500 dark:text-orange-200 ${FOCUS}`,
  /** קישור למסך הראל */
  harel: `inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-500/15 hover:shadow focus-visible:ring-amber-500 dark:text-amber-100 ${FOCUS}`,
} as const;
