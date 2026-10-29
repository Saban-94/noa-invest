/**
 * /inquiry — לוח משימות בירור (ראמי)
 * כרטיסים מתרחבים · מצב משימה · שליחה להראל + צלצול + OneSignal
 * ?task=6715841 → פתיחה + גלילה לכרטיס · [מסך הראל] → /harel?task=6715841
 */

import {
  Outlet,
  createFileRoute,
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Crown, Filter, Inbox, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ExpandableTaskCard, type TaskCardData } from "@/components/ExpandableTaskCard";
import {
  NotifyStatusChip,
  WorkroomLiveStatus,
  WorkroomMetricCard,
  WorkroomNav,
  type WorkroomMetric,
} from "@/components/workroom";
import { listWorkroomInquiriesFn, ramiReplyFn } from "@/lib/inquiry-workflow.functions";
import { notifyHarelQueueFn } from "@/lib/onesignal.functions";
import {
  STATUS_LABEL,
  isOverdue,
  minutesUntilDue,
  type WorkroomInquiry,
} from "@/lib/inquiry-workflow";
import {
  WORKROOM_BTN,
  notificationAccepted,
  parseTabParam,
  parseTaskParam,
  type InquiryTab,
  type NotifyState,
} from "@/lib/workroom-ui";
import { playDispatchChime } from "@/lib/audio-alerts";
import { cn } from "@/lib/utils";

type Tab = InquiryTab;
type InquirySearch = { task?: string; tab?: Tab };

export const Route = createFileRoute("/inquiry")({
  validateSearch: (s: Record<string, unknown>): InquirySearch => {
    const task = parseTaskParam(s["task"]);
    const tab = parseTabParam(s["tab"]);
    return { ...(task ? { task } : {}), ...(tab ? { tab } : {}) };
  },
  head: () => ({
    meta: [{ title: "בירור תעודות — משימות ראמי" }],
  }),
  component: InquiryLayout,
});

/**
 * /inquiry הוא גם ההורה של /inquiry/$id (מסך הסימון).
 * בלי Outlet המסך הפנימי לא מוצג בכלל — כמו ב-notes.tsx: רשימה בנתיב הבסיס, אחרת Outlet.
 */
function InquiryLayout() {
  const { pathname } = useLocation();
  return pathname === "/inquiry" || pathname === "/inquiry/" ? <InquiryBoard /> : <Outlet />;
}

const cardDomId = (docNumber: string) => `inquiry-card-${docNumber}`;

function InquiryBoard() {
  const search = useSearch({ from: "/inquiry" });
  const focusId = search.task;
  const tab: Tab = search.tab || "tasks";
  const navigate = useNavigate({ from: "/inquiry" });
  const qc = useQueryClient();
  const [notify, setNotify] = useState<NotifyState>({ state: "idle" });

  const q = useQuery({
    queryKey: ["workroom", "inquiry-board"],
    queryFn: () => listWorkroomInquiriesFn(),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const all = useMemo(() => q.data?.inquiries || [], [q.data]);

  const tasks = useMemo(
    () =>
      all.filter(
        (i) =>
          i.status === "returned_to_rami" ||
          i.status === "pending_rami" ||
          (i.task && i.task.status === "open"),
      ),
    [all],
  );
  const pendingHarel = useMemo(() => all.filter((i) => i.status === "pending_harel"), [all]);
  const overdueCount = tasks.filter((i) => i.task?.status === "open" && isOverdue(i.task)).length;

  const list = tab === "tasks" ? tasks : tab === "pending_harel" ? pendingHarel : all;

  // ממוקד קודם, אחר כך באיחור, אחר כך לפי יעד קרוב
  const sorted = useMemo(() => {
    const rank = (i: WorkroomInquiry) => {
      if (focusId && (i.docNumber === focusId || i.id === focusId)) return -1e9;
      const mins = i.task?.status === "open" ? minutesUntilDue(i.task) : null;
      return mins == null ? 1e9 : mins;
    };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [list, focusId]);

  const focusFound =
    Boolean(focusId) && all.some((i) => i.docNumber === focusId || i.id === focusId);
  const focusInList =
    Boolean(focusId) && list.some((i) => i.docNumber === focusId || i.id === focusId);

  // גלילה לכרטיס הממוקד אחרי טעינה
  useEffect(() => {
    if (!focusId || q.isLoading || !focusInList) return;
    const el = document.getElementById(cardDomId(focusId));
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [focusId, q.isLoading, focusInList]);

  const setTab = (next: Tab) => void navigate({ search: (prev) => ({ ...prev, tab: next }) });
  const clearFocus = () => void navigate({ search: (prev) => (prev.tab ? { tab: prev.tab } : {}) });

  const replyMut = useMutation({
    mutationFn: async (p: {
      inquiryId: string;
      noteId: string;
      text: string;
      replyToId?: string | undefined;
      customer?: string | undefined;
      notifyHarel: boolean;
    }) => {
      await ramiReplyFn({
        data: {
          inquiryId: p.inquiryId,
          noteId: p.noteId,
          text: p.text,
          ...(p.replyToId ? { replyToId: p.replyToId } : {}),
        },
      });
      if (!p.notifyHarel) return { notified: null as boolean | null, noteId: p.noteId };

      setNotify({ state: "sending", noteId: p.noteId, target: "harel" });
      void playDispatchChime(0.9);
      let ok = false;
      try {
        const response = await notifyHarelQueueFn({
          data: {
            noteId: p.noteId,
            kind: "rami_replied",
            ...(p.customer ? { customer: p.customer } : {}),
          },
        });
        ok = notificationAccepted(response);
      } catch (e) {
        console.warn("OneSignal", e);
      }
      setNotify({
        state: ok ? "sent" : "failed",
        noteId: p.noteId,
        target: "harel",
        at: new Date().toISOString(),
      });
      return { notified: ok as boolean | null, noteId: p.noteId };
    },
    onSuccess: ({ notified }) => {
      toast.success(
        notified === null ? "ההודעה נשמרה בהיסטוריית המשימה" : "המענה נשמר ונשלח להראל",
      );
      if (notified === true) {
        toast.info("בקשת התראה להראל נמסרה ל-OneSignal; מסירה למכשיר לא מאומתת");
      } else if (notified === false) {
        toast.error("המענה נשמר, אך בקשת ההתראה להראל נכשלה");
      }
      void qc.invalidateQueries({ queryKey: ["workroom"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const metrics: { tab?: Tab; metric: WorkroomMetric }[] = [
    {
      tab: "tasks",
      metric: {
        label: "משימות לראמי",
        value: tasks.length,
        detail: "חזרו מהראל או פתוחות",
        icon: RotateCcw,
        tone: "orange",
      },
    },
    {
      metric: {
        label: "באיחור",
        value: overdueCount,
        detail: overdueCount > 0 ? "עבר היעד שהראל הגדיר" : "הכל בזמן",
        icon: AlarmClock,
        tone: overdueCount > 0 ? "destructive" : "emerald",
      },
    },
    {
      tab: "pending_harel",
      metric: {
        label: "ממתינים להראל",
        value: pendingHarel.length,
        detail: "נשלחו לאישור",
        icon: Crown,
        tone: "amber",
      },
    },
    {
      tab: "all",
      metric: {
        label: "הכל",
        value: all.length,
        detail: "כל תיקי הבירור",
        icon: Inbox,
        tone: "sky",
      },
    },
  ];

  return (
    <div
      className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/20"
      dir="rtl"
    >
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-6">
        <PageHeader
          title="בירור תעודות"
          subtitle="משימות פתוחות · מענה עם היסטוריה · שליחה להראל"
          action={
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transform-none"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  q.isFetching && "motion-safe:animate-spin motion-reduce:animate-none",
                )}
              />
              רענון
            </Button>
          }
        />

        <WorkroomNav current="inquiry" taskId={focusId} />

        <WorkroomLiveStatus
          label="תמונת מצב משימות הבירור"
          isFetching={q.isFetching}
          isError={q.isError}
        />

        <section aria-label="סיכום משימות בירור" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(({ tab: metricTab, metric }) => (
            <WorkroomMetricCard
              key={metric.label}
              metric={metric}
              {...(metricTab
                ? { active: tab === metricTab, onClick: () => setTab(metricTab) }
                : {})}
            />
          ))}
        </section>

        {notify.state !== "idle" && <NotifyStatusChip notify={notify} />}

        {focusId && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold",
              focusFound || q.isLoading
                ? "border-orange-500/30 bg-orange-500/10 text-orange-950 dark:text-orange-100"
                : "border-destructive/25 bg-destructive/5 text-destructive",
            )}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              משימה ממוקדת: ת.מ. {focusId}
              {!q.isLoading && !focusFound && " · לא נמצאה במאגר"}
              {!q.isLoading && focusFound && !focusInList && " · לא בטאב הנוכחי"}
            </span>
            <span className="ms-auto flex flex-wrap gap-2">
              {!q.isLoading && focusFound && !focusInList && (
                <button
                  type="button"
                  onClick={() => setTab("all")}
                  className={WORKROOM_BTN.secondary}
                >
                  הצג בטאב «הכל»
                </button>
              )}
              <Link to="/harel" search={{ task: focusId }} className={WORKROOM_BTN.harel}>
                <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                מסך הראל
              </Link>
              <button type="button" onClick={clearFocus} className={WORKROOM_BTN.secondary}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                ניקוי מיקוד
              </button>
            </span>
          </div>
        )}

        {q.isLoading && (
          <div className="flex justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 motion-safe:animate-spin motion-reduce:animate-none" />
            טוען משימות...
          </div>
        )}

        {!q.isLoading && sorted.length === 0 && (
          <div className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            {tab === "tasks" ? "אין משימות פתוחות לראמי" : "אין פריטים בתור זה"}
          </div>
        )}

        <div className="space-y-4">
          {sorted.map((inq) => {
            const card = toCard(inq);
            const isFocus = Boolean(focusId && (inq.docNumber === focusId || inq.id === focusId));
            return (
              <div
                key={inq.id || inq.docNumber}
                id={cardDomId(inq.docNumber)}
                className="scroll-mt-24"
              >
                <ExpandableTaskCard
                  // remount כשהמיקוד משתנה כדי ש-defaultOpen ייפתח מחדש
                  key={isFocus ? "focus" : "rest"}
                  data={card}
                  defaultOpen={isFocus}
                  mode="rami"
                  className={cn(isFocus && !card.overdue && "ring-2 ring-orange-500/50")}
                  onReply={async (text, replyToId, opts) => {
                    await replyMut.mutateAsync({
                      inquiryId: inq.id || inq.docNumber,
                      noteId: inq.docNumber,
                      text,
                      replyToId,
                      customer: inq.customer,
                      notifyHarel: opts?.sendToHarel ?? true,
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function toCard(i: WorkroomInquiry): TaskCardData {
  const mins = minutesUntilDue(i.task);
  return {
    id: i.id,
    docNumber: i.docNumber,
    customer: i.customer,
    customerNo: i.customerNo,
    address: i.address,
    driver: i.driver,
    issue: i.issue,
    aiAnalysis: i.aiAnalysis,
    status: i.status,
    statusLabel: STATUS_LABEL[i.status],
    thread: i.thread,
    taskReason: i.task?.reason,
    dueLabel: mins != null ? (mins < 0 ? `עבר ב־${Math.abs(mins)} דק׳` : `${mins} דק׳`) : undefined,
    overdue: i.task?.status === "open" && isOverdue(i.task),
    driveUrl: i.driveUrl,
  };
}
