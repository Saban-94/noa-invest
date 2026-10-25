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
import { RefreshCw, Crown, Clock, AlertTriangle } from "lucide-react";

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
    refetchInterval: 60_000,
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
      <section className="overflow-hidden rounded-3xl border border-emerald-900/10 bg-gradient-to-l from-emerald-950 via-emerald-900 to-emerald-800 p-5 text-white shadow-xl shadow-emerald-950/10 md:flex md:items-center md:justify-between md:gap-6">
        <div>
          <div className="text-xs font-bold tracking-wide text-emerald-200">SABAN FLOW · מרכז החלטות</div>
          <h2 className="mt-1 text-xl font-extrabold">תור החלטות ומשימות פתוחות</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-emerald-100/85">מעבר על תעודות, קריאת היסטוריית בירור, החזרה לראמי והמשך טיפול מתוך תיק אחד.</p>
        </div>
        <div className="mt-4 flex shrink-0 gap-2 md:mt-0">
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3"><div className="text-[11px] text-emerald-100">ממתינות לאישור</div><div className="mt-1 text-xl font-black">{pendingHarel.length}</div></div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3"><div className="text-[11px] text-emerald-100">הוחזרו לראמי</div><div className="mt-1 text-xl font-black">{returned.length}</div></div>
        </div>
      </section>
      <PageHeader
        title="דשבורד הראל"
        subtitle="תור אישור תעודות · החזרה לראמי עם יעד ונדנוד · תיעוד מלא"
        action={
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            רענון
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "ממתין לאישור",
            value: pendingHarel.length,
            icon: Crown,
            color: "text-amber-800",
          },
          {
            label: "הוחזר לראמי (פתוח)",
            value: returned.filter((i) => i.task?.status === "open").length,
            icon: AlertTriangle,
            color: "text-orange-700",
          },
          {
            label: "אושרו (במאגר)",
            value: approvedToday,
            icon: Clock,
            color: "text-emerald-700",
          },
        ].map((k) => (
          <Card key={k.label} className="rounded-2xl p-4">
            <div className="text-[11px] font-semibold text-muted-foreground">{k.label}</div>
            <div className={`mt-1 font-display text-2xl font-extrabold ${k.color}`}>
              {k.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* תור */}
        <Card className="max-h-[70vh] space-y-2 overflow-y-auto rounded-2xl p-3">
          <div className="px-1 text-xs font-bold text-muted-foreground">תור לבדיקה</div>
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
                onClick={() => setSelectedId(i.id || i.docNumber)}
                className={`w-full rounded-xl border p-3 text-right transition ${
                  active
                    ? "border-primary bg-primary/5"
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
              <Card className="space-y-2 rounded-2xl p-4">
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
                      className="rounded-xl border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                    >
                      תעודה
                    </Link>
                    <Link
                      to="/inquiry"
                      search={{ task: selected.docNumber, tab: "tasks" }}
                      className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold hover:bg-orange-500/15"
                    >
                      פתיחת משימה
                    </Link>
                  </div>
                </div>
                <p className="text-sm font-bold text-destructive/90">{selected.issue}</p>
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

              <Card className="rounded-2xl p-4">
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
