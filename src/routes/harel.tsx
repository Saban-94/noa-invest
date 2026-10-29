/**
 * /harel — דשבורד מנכ״ל: תור אישור + פירוט + החלטות
 * ?task=6715841 → בחירה אוטומטית בתור (סימטרי ל-/inquiry?task=…)
 */

import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InquiryThread } from "@/components/InquiryThread";
import { HarelDecisionPanel } from "@/components/HarelDecisionPanel";
import { NoaChatShell } from "@/components/NoaChatShell";
import {
  NotifyStatusChip,
  WorkroomLiveStatus,
  WorkroomMetricCard,
  WorkroomNav,
  type WorkroomMetric,
} from "@/components/workroom";
import { harelReplyFn, listWorkroomInquiriesFn } from "@/lib/inquiry-workflow.functions";
import {
  STATUS_LABEL,
  isOverdue,
  minutesUntilDue,
  type WorkroomInquiry,
} from "@/lib/inquiry-workflow";
import {
  TONE,
  WORKROOM_BTN,
  inquiryTabForStatus,
  isTodayInIsrael,
  parseTaskParam,
  statusTone,
  type NotifyState,
  type WorkroomTone,
} from "@/lib/workroom-ui";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Crown,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  FileText,
  MessageSquare,
} from "lucide-react";

type HarelSearch = { task?: string };

export const Route = createFileRoute("/harel")({
  validateSearch: (s: Record<string, unknown>): HarelSearch => {
    const task = parseTaskParam(s["task"]);
    return task ? { task } : {};
  },
  head: () => ({
    meta: [{ title: "דשבורד הראל — נועה ח. סבן" }],
  }),
  component: HarelDashboard,
});

function matches(i: WorkroomInquiry, key: string | null | undefined) {
  return Boolean(key) && (i.id === key || i.docNumber === key);
}

function HarelDashboard() {
  const search = useSearch({ from: "/harel" });
  const navigate = useNavigate({ from: "/harel" });
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(search.task ?? null);
  const [notify, setNotify] = useState<NotifyState>({ state: "idle" });

  // סנכרון בחירה: כש-?task= משתנה (קישור, התראה, back/forward) → בוחרים אותו בתור
  useEffect(() => {
    if (search.task) setSelectedId(search.task);
  }, [search.task]);

  const q = useQuery({
    queryKey: ["workroom", "harel"],
    queryFn: () => listWorkroomInquiriesFn(),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const all = useMemo(() => q.data?.inquiries || [], [q.data]);

  const pendingHarel = useMemo(() => all.filter((i) => i.status === "pending_harel"), [all]);
  const returned = useMemo(() => all.filter((i) => i.status === "returned_to_rami"), [all]);
  const queueCount = pendingHarel.length + returned.length;
  const openRamiTasks = returned.filter((i) => i.task?.status === "open");
  const overdueRami = openRamiTasks.filter((i) => isOverdue(i.task)).length;
  const approved = all.filter((i) => i.status === "approved");
  const approvedToday = approved.filter((i) => isTodayInIsrael(i.updatedAt)).length;

  // ברירת מחדל: קודם מה שממתין להחלטה, אחר כך מה שחזר לראמי
  const selected: WorkroomInquiry | null =
    all.find((i) => matches(i, selectedId)) || pendingHarel[0] || returned[0] || null;

  const focusMissing =
    Boolean(search.task) && !q.isLoading && !all.some((i) => matches(i, search.task));

  const selectItem = (i: WorkroomInquiry) => {
    const taskId = i.docNumber || i.id;
    setSelectedId(taskId);
    void navigate({ search: { task: taskId }, replace: true });
  };

  const metrics: WorkroomMetric[] = [
    {
      label: "בתור הטיפול",
      value: queueCount,
      detail: "ממתינים להחלטה + חזרו לראמי",
      icon: ClipboardList,
      tone: "sky",
    },
    {
      label: "ממתינות לאישור",
      value: pendingHarel.length,
      detail: "נדרשת החלטה שלך",
      icon: Crown,
      tone: "amber",
    },
    {
      label: "משימות פתוחות לראמי",
      value: openRamiTasks.length,
      detail: overdueRami > 0 ? `${overdueRami} באיחור` : "אין משימות באיחור",
      icon: AlertTriangle,
      tone: overdueRami > 0 ? "destructive" : "orange",
    },
    {
      label: "אושרו היום",
      value: approvedToday,
      detail: `סה״כ ${approved.length} מאושרות במאגר`,
      icon: CheckCircle2,
      tone: "emerald",
    },
  ];

  const groups: {
    key: string;
    title: string;
    hint: string;
    tone: WorkroomTone;
    items: WorkroomInquiry[];
  }[] = [
    {
      key: "pending",
      title: "ממתין לאישור",
      hint: "החלטה אצל הראל",
      tone: "amber",
      items: pendingHarel,
    },
    {
      key: "returned",
      title: "חזר לראמי",
      hint: "ממתין לראמי",
      tone: "orange",
      items: returned,
    },
  ];

  const selectedTone = selected ? TONE[statusTone(selected.status, selected.task)] : null;

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

      <WorkroomNav current="harel" taskId={selected?.docNumber ?? search.task} />

      <WorkroomLiveStatus
        label="תמונת מצב מתור ההזמנות"
        isFetching={q.isFetching}
        isError={q.isError}
      />

      <section aria-label="סיכום תור ההזמנות" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <WorkroomMetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      {focusMissing && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive"
        >
          ת.מ. {search.task} לא נמצאה במאגר הבירורים — מוצגת התעודה הבאה בתור.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* תור */}
        <Card className="max-h-[70vh] space-y-2 overflow-y-auto rounded-2xl border-border/70 p-3 shadow-sm">
          <div className="flex items-center justify-between px-1 pb-1 text-xs font-bold text-muted-foreground">
            <span>תור לבדיקה</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono tabular-nums">
              {queueCount}
            </span>
          </div>
          {q.isLoading && <p className="p-4 text-center text-xs text-muted-foreground">טוען...</p>}
          {!q.isLoading && queueCount === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">אין תעודות ממתינות</p>
          )}
          {groups.map((group) => {
            if (group.items.length === 0) return null;
            const tone = TONE[group.tone];
            return (
              <section key={group.key} aria-label={group.title} className="space-y-2">
                <h2
                  className={cn(
                    "sticky top-0 z-10 flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-[11px] font-bold backdrop-blur",
                    tone.border,
                    tone.surface,
                    tone.text,
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                    {group.title}
                    <span className="font-normal opacity-80">· {group.hint}</span>
                  </span>
                  <span className="font-mono tabular-nums">{group.items.length}</span>
                </h2>
                {group.items.map((i) => {
                  const active = Boolean(
                    selected && (selected.id === i.id || selected.docNumber === i.docNumber),
                  );
                  const overdue = i.task?.status === "open" && isOverdue(i.task);
                  const itemTone = TONE[statusTone(i.status, i.task)];
                  return (
                    <button
                      key={i.id || i.docNumber}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectItem(i)}
                      className={cn(
                        "w-full rounded-xl border border-s-4 p-3 text-right transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none",
                        group.tone === "amber" ? "border-s-amber-500/70" : "border-s-orange-500/70",
                        active
                          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15"
                          : "border-border/60 hover:bg-muted/40",
                        overdue && !active && "ring-2 ring-destructive/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-bold">ת.מ. {i.docNumber}</span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                            itemTone.border,
                            itemTone.surface,
                            itemTone.text,
                          )}
                        >
                          {i.status === "returned_to_rami" ? "ממתין לראמי" : STATUS_LABEL[i.status]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs font-semibold">{i.customer}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {i.issue || i.aiAnalysis}
                      </div>
                      {i.task?.status === "open" && (
                        <div
                          className={cn(
                            "mt-1 text-[10px] font-bold",
                            overdue ? "text-destructive" : "text-orange-700 dark:text-orange-300",
                          )}
                        >
                          משימה לראמי
                          {overdue ? " · באיחור" : ` · עוד ${minutesUntilDue(i.task)} דק׳`}
                        </div>
                      )}
                    </button>
                  );
                })}
              </section>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold">ת.מ. {selected.docNumber}</span>
                      {selectedTone && (
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-bold",
                            selectedTone.border,
                            selectedTone.surface,
                            selectedTone.text,
                          )}
                        >
                          {STATUS_LABEL[selected.status]}
                          {selected.task?.status === "open" && isOverdue(selected.task)
                            ? " · באיחור"
                            : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold">{selected.customer}</div>
                    <div className="text-xs text-muted-foreground">
                      {[selected.address, selected.driver].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to="/notes/$id"
                      params={{ id: selected.docNumber }}
                      className={WORKROOM_BTN.secondary}
                    >
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      תעודה
                    </Link>
                    <Link
                      to="/inquiry"
                      search={{
                        task: selected.docNumber,
                        tab: inquiryTabForStatus(selected.status),
                      }}
                      className={WORKROOM_BTN.task}
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      פתיחת משימה
                    </Link>
                  </div>
                </div>
                <p className="rounded-xl border border-destructive/15 bg-destructive/5 px-3 py-2 text-sm font-bold leading-6 text-destructive/90">
                  {selected.issue}
                </p>
                {selected.aiAnalysis && (
                  <p className="text-xs text-muted-foreground">{selected.aiAnalysis}</p>
                )}
                {notify.state !== "idle" &&
                  "noteId" in notify &&
                  notify.noteId === selected.docNumber && <NotifyStatusChip notify={notify} />}
              </Card>

              {selected.status === "pending_harel" && (
                <HarelDecisionPanel
                  key={selected.id || selected.docNumber}
                  inquiryId={selected.id || selected.docNumber}
                  noteId={selected.docNumber}
                  customer={selected.customer}
                  fileId={selected.scanFileId}
                  onNotify={setNotify}
                />
              )}

              <Card className="rounded-2xl border-border/70 p-4 shadow-sm">
                <div className="mb-3 text-xs font-bold text-muted-foreground">שרשור תיעוד</div>
                <InquiryThread
                  messages={selected.thread || []}
                  onReply={async (text, replyToId) => {
                    await harelReplyFn({
                      data: {
                        inquiryId: selected.id || selected.docNumber,
                        noteId: selected.docNumber,
                        text,
                        ...(replyToId ? { replyToId } : {}),
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
                  ...(selected.customerNo ? { customerNo: selected.customerNo } : {}),
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
