/**
 * TaskOwnershipBanner — «מי מחזיק את הכדור» + קישור צולב ראמי↔הראל
 * משותף ל-/inquiry ול-/harel
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Crown, ClipboardList, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  isOverdue,
  minutesUntilDue,
  type InquiryStatus,
  type InquiryTask,
  type WorkroomInquiry,
} from "@/lib/inquiry-workflow";
import {
  TONE,
  inquiryTabForStatus,
  statusTone,
  type NotifyState,
} from "@/lib/workroom-ui";
import { NotifyStatusChip } from "@/components/workroom/NotifyStatusChip";

export type BallHolder = "rami" | "harel" | "closed";

export function ballHolder(
  status: InquiryStatus,
  task?: InquiryTask | null,
): BallHolder {
  if (status === "approved" || status === "rejected") return "closed";
  if (status === "pending_harel") return "harel";
  if (status === "returned_to_rami" || status === "pending_rami") return "rami";
  if (task?.status === "open") return "rami";
  return "closed";
}

export function holderLabel(holder: BallHolder): string {
  if (holder === "rami") return "אצל ראמי";
  if (holder === "harel") return "אצל הראל";
  return "סגור";
}

type Props = {
  inquiry: WorkroomInquiry;
  /** באיזה מסך מוצגים כרגע */
  page: "inquiry" | "harel";
  notify?: NotifyState;
  className?: string;
};

export function TaskOwnershipBanner({ inquiry, page, notify, className }: Props) {
  const holder = ballHolder(inquiry.status, inquiry.task);
  const toneKey = statusTone(inquiry.status, inquiry.task);
  const tone = TONE[toneKey];
  const overdue = isOverdue(inquiry.task);
  const mins = minutesUntilDue(inquiry.task);

  const HolderIcon =
    holder === "harel" ? Crown : holder === "rami" ? ClipboardList : CheckCircle2;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col gap-2 rounded-2xl border px-3 py-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        tone.border,
        tone.surface,
        className,
      )}
      dir="rtl"
    >
      <div className="min-w-0 space-y-1">
        <div className={cn("flex flex-wrap items-center gap-2 text-sm font-bold", tone.text)}>
          <HolderIcon className="h-4 w-4 shrink-0" aria-hidden />
          <span>{holderLabel(holder)}</span>
          <span className="font-mono text-foreground">· ת.מ. {inquiry.docNumber}</span>
          {inquiry.customer && (
            <span className="truncate font-semibold text-foreground/80">
              · {inquiry.customer}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-bold">{STATUS_LABEL[inquiry.status]}</span>
          {inquiry.task?.status === "open" && (
            <span
              className={cn(
                "font-bold",
                overdue ? "text-destructive" : "text-amber-700 dark:text-amber-300",
              )}
            >
              {overdue
                ? `באיחור${mins != null ? ` · ${Math.abs(mins)} דק׳` : ""}`
                : mins != null
                  ? `יעד עוד ${mins} דק׳`
                  : "משימה פתוחה"}
            </span>
          )}
          {inquiry.updatedAt && (
            <span>
              עודכן{" "}
              {new Date(inquiry.updatedAt).toLocaleString("he-IL", {
                timeZone: "Asia/Jerusalem",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        {notify && notify.state !== "idle" && (
          <NotifyStatusChip notify={notify} className="mt-1" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {page === "harel" ? (
          <Link
            to="/inquiry"
            search={{
              task: inquiry.docNumber,
              tab: inquiryTabForStatus(inquiry.status),
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-orange-500/30 bg-background/80 px-3 text-[11px] font-bold text-orange-900 transition hover:bg-orange-500/10 dark:text-orange-100"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            פתח אצל ראמי
            <ArrowLeftRight className="h-3 w-3 opacity-60" />
          </Link>
        ) : (
          <Link
            to="/harel"
            search={{ task: inquiry.docNumber }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-500/30 bg-background/80 px-3 text-[11px] font-bold text-amber-900 transition hover:bg-amber-500/10 dark:text-amber-100"
          >
            <Crown className="h-3.5 w-3.5" />
            פתח אצל הראל
            <ArrowLeftRight className="h-3 w-3 opacity-60" />
          </Link>
        )}
        {holder === "closed" && inquiry.status === "rejected" && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            נדחה
          </span>
        )}
      </div>
    </div>
  );
}
