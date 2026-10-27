/**
 * /harel — דשבורד מנכ״ל: תור אישור + פירוט + החלטות
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InquiryThread } from "@/components/InquiryThread";
import { HarelDecisionPanel } from "@/components/HarelDecisionPanel";
import { NoaChatShell } from "@/components/NoaChatShell";
import { harelReplyFn, listWorkroomInquiriesFn } from "@/lib/inquiry-workflow.functions";
import {
  STATUS_LABEL,
  isOverdue,
  minutesUntilDue,
  type WorkroomInquiry,
} from "@/lib/inquiry-workflow";
import {
  RefreshCw,
  Crown,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/harel")({
  head: () => ({
    meta: [{ title: "דשבורד הראל — נועה ח. סבן" }],
  }),
  component: HarelDashboard,
});

function HarelDashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["workroom", "harel"],
    queryFn: () => listWorkroomInquiriesFn(),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const all = q.data?.inquiries || [];

  const queue = useMemo(
    () =>
      all.filter((i) => i.status === "pending_harel" || i.status === "returned_to_rami"),
    [all],
  );

  const pendingHarel = queue.filter((i) => i.status === "pending_harel");
  const returned = all.filter((i) => i.status === "returned_to_rami");
  const approvedToday = all.filter((i) => i.status === "approved").length;

  // Include returned-to-Rami items in the default selection, not just pending approvals.
  const selected: WorkroomInquiry | null =
    all.find((i) => i.id === selectedId || i.docNumber === selectedId) ||
    queue[0] ||
    null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
      <PageHeader
        title="דשבורד הראל"
        subtitle="תור אישור תעודות · החזרה לראמי עם יעד ונדנוד · תיעוד מלא"
        action={
          <Button
            size="sm"
            variant="outline"
            className="gap-2 rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${q.isFetching ? "motion-safe:animate-spin motion-reduce:animate-none" : ""}`}
            />
            רענון
          </Button>
        }
      />

      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground"
      >
        <span className="font-semibold">תמונת מצב מתור ההזמנות</span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              q.isFetching
                ? "bg-amber-500 motion-safe:animate-pulse motion-reduce:animate-none"
                : q.isError
                  ? "bg-destructive"
                  : "bg-emerald-500"
            }`}
          />
          {q.isFetching
            ? "הנתונים מתעדכנים"
            : q.isError
              ? "לא ניתן לעדכן כרגע"
              : "רענון אוטומטי כל 2 דקות"}
        </span>
      </div>

      <section
        aria-label="סיכום תור ההזמנות"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: "בתור הטיפול",
            value: queue.length,
            detail: "תיקים שממתינים להמשך",
            icon: ClipboardList,
            color: "text-sky-700",
            surface: "bg-sky-500/10",
          },
          {
            label: "ממתינות לאישור",
            value: pendingHarel.length,
            detail: "נדרשת החלטה",
            icon: Crown,
            color: "text-amber-700",
            surface: "bg-amber-500/10",
          },
          {
            label: "משימות פתוחות לראמי",
            value: returned.filter((i) => i.task?.status === "open").length,
            detail: "בהמשך טיפול",
            icon: AlertTriangle,
            color: "text-orange-700",
            surface: "bg-orange-500/10",
          },
          {
            label: "אושרו במאגר",
            value: approvedToday,
            detail: "תעודות מאושרות",
            icon: CheckCircle2,
            color: "text-emerald-700",
            surface: "bg-emerald-500/10",
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Card
              key={metric.label}
              className="group relative overflow-hidden rounded-2xl border-border/70 bg-card/95 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transform-none"
            >
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-primary/80 via-primary/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {metric.label}
                  </div>
                  <div className="mt-2 font-display text-3xl font-extrabold tabular-nums tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
                    {metric.value}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{metric.detail}</div>
                </div>
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${metric.surface} ${metric.color} transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* תור */}
        <Card className="max-h-[70vh] space-y-2 overflow-y-auto rounded-2xl border-border/70 p-3 shadow-sm">
          <div className="flex items-center justify-between px-1 pb-1 text-xs font-bold text-muted-foreground">
            <span>תור לבדיקה</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono tabular-nums">
              {queue.length}
            </span>
          </div>
          {q.isLoading && (
            <p className="p-4 text-center text-xs text-muted-foreground">טוען...</p>
          )}
          {!q.isLoading && queue.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              אין תעודות ממתינות
            </p>
          )}
          {queue.map((i) => {
            const active =
              selected && (selected.id === i.id || selected.docNumber === i.docNumber);
            const overdue = isOverdue(i.task);
            return (
              <button
                key={i.id || i.docNumber}
                type="button"
                aria-pressed={Boolean(active)}
                onClick={() => setSelectedId(i.id || i.docNumber)}
                className={`w-full rounded-xl border p-3 text-right transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none ${ 
                  active
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15"
                    : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold">ת.מ. {i.docNumber}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {STATUS_LABEL[i.status]}
                  </span>
                </div>
                <div className="mt-0.5 text-xs font-semibold">{i.customer}</div>
                <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                  {i.issue || i.aiAnalysis}
                </div>
                {i.task?.status === "open" && (
                  <div
                    className={`mt-1 text-[10px] font-bold ${overdue ? "text-destructive" : "text-amber-700"}`}
                  >
                    משימה לראמי
                    {overdue
                      ? " · באיחור"
                      : ` · עוד ${minutesUntilDue(i.task)} דק׳`}
                  </div>
                )}
              </button>
            );
          })}
        </Card>

        {/* פירוט */}
        <div className="space-y-4">
          {!selected ? (
            <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
              בחר תעודה מהתור
            </Card>
          ) : (
            <>
              <Card className="space-y-2 rounded-2xl border-border/70 p-4 shadow-sm transition-all duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-lg font-bold">
                      ת.מ. {selected.docNumber}
                    </div>
                    <div className="text-sm font-semibold">{selected.customer}</div>
                    <div className="text-xs text-muted-foreground">
                      {selected.address} · {selected.driver}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/notes/$id"
                      params={{ id: selected.docNumber }}
                      className="inline-flex items-center justify-center rounded-xl border border-border/80 bg-background px-3 py-2 text-xs font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
                    >
                      תעודה
                    </Link>
                    <Link
                      to="/inquiry"
                      search={{ task: selected.docNumber, tab: "tasks" }}
                      className="inline-flex items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-orange-500/15 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 motion-reduce:transform-none dark:text-orange-200"
                    >
                      פתיחת משימה
                    </Link>
                  </div>
                </div>
                <p className="rounded-xl border border-destructive/15 bg-destructive/5 px-3 py-2 text-sm font-bold leading-6 text-destructive/90">{selected.issue}</p>
                {selected.aiAnalysis && (
                  <p className="text-xs text-muted-foreground">{selected.aiAnalysis}</p>
                )}
              </Card>

              {selected.status === "pending_harel" && (
                <HarelDecisionPanel
                  inquiryId={selected.id || selected.docNumber}
                  noteId={selected.docNumber}
                  fileId={selected.scanFileId}
                />
              )}

              <Card className="rounded-2xl border-border/70 p-4 shadow-sm">
                <div className="mb-3 text-xs font-bold text-muted-foreground">
                  שרשור תיעוד
                </div>
                <InquiryThread
                  messages={selected.thread || []}
                  onReply={async (text, replyToId) => {
                    await harelReplyFn({
                      data: {
                        inquiryId: selected.id || selected.docNumber,
                        noteId: selected.docNumber,
                        text,
                        replyToId,
                      },
                    });
                    await queryClient.invalidateQueries({ queryKey: ["workroom"] });
                  }}
                />
              </Card>

              <NoaChatShell
                defaultOpen
                context={{
                  page: "harel",
                  noteId: selected.docNumber,
                  inquiryId: selected.id,
                  customerNo: selected.customerNo,
                  issueSummary: selected.issue,
                  status: selected.status,
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}


