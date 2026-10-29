/**
 * /inquiry — לוח משימות בירור (ראמי)
 * ניווט משותף · מיקוד task · כרטיסים · OneSignal chips · קישור להראל
 */

import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Inbox,
  RotateCcw,
  Crown,
  Filter,
  Bell,
  BellOff,
  ExternalLink,
  MessageSquare,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ExpandableTaskCard, type TaskCardData } from "@/components/ExpandableTaskCard";
import { WorkroomNav } from "@/components/WorkroomNav";
import {
  listWorkroomInquiriesFn,
  ramiReplyFn,
} from "@/lib/inquiry-workflow.functions";
import { notifyHarelQueueFn } from "@/lib/onesignal.functions";
import {
  STATUS_LABEL,
  isOverdue,
  minutesUntilDue,
  type WorkroomInquiry,
} from "@/lib/inquiry-workflow";
import { playDispatchChime } from "@/lib/audio-alerts";
import { cn } from "@/lib/utils";

type Tab = "tasks" | "pending_harel" | "all";

export const Route = createFileRoute("/inquiry")({
  validateSearch: (s: Record<string, unknown>) => ({
    task: typeof s.task === "string" ? s.task : undefined,
    tab: (s.tab as Tab) || undefined,
  }),
  head: () => ({
    meta: [{ title: "בירור תעודות — משימות ראמי" }],
  }),
  component: InquiryBoard,
});

/** inquiryId → פרטי התראה אחרונה (מקומי למסך) */
type NotifyChip = {
  at: string; // HH:MM
  ok: boolean;
  message: string;
};

function InquiryBoard() {
  const search = useSearch({ from: "/inquiry" });
  const focusId = search.task;
  const [tab, setTab] = useState<Tab>(search.tab || "tasks");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [query, setQuery] = useState("");
  const [notifyByDefault, setNotifyByDefault] = useState(true);
  const [notifyChips, setNotifyChips] = useState<Record<string, NotifyChip>>({});
  const qc = useQueryClient();

  useEffect(() => {
    if (search.tab) setTab(search.tab);
  }, [search.tab]);

  const q = useQuery({
    queryKey: ["workroom", "inquiry-board"],
    queryFn: () => listWorkroomInquiriesFn(),
    staleTime: 120_000,
    refetchInterval: 120_000,
  });

  const all = q.data?.inquiries || [];

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

  const pendingHarel = useMemo(
    () => all.filter((i) => i.status === "pending_harel"),
    [all],
  );

  const list =
    tab === "tasks" ? tasks : tab === "pending_harel" ? pendingHarel : all;

  const filtered = useMemo(() => {
    let copy = [...list];
    if (onlyOverdue) {
      copy = copy.filter((i) => isOverdue(i.task));
    }
    const qq = query.trim().toLowerCase();
    if (qq) {
      copy = copy.filter(
        (i) =>
          i.docNumber?.toLowerCase().includes(qq) ||
          i.customer?.toLowerCase().includes(qq) ||
          i.driver?.toLowerCase().includes(qq) ||
          i.customerNo?.toLowerCase().includes(qq),
      );
    }
    if (focusId) {
      copy.sort((a, b) => {
        const af = a.docNumber === focusId || a.id === focusId ? 0 : 1;
        const bf = b.docNumber === focusId || b.id === focusId ? 0 : 1;
        return af - bf;
      });
    }
    return copy;
  }, [list, onlyOverdue, query, focusId]);

  const overdueCount = useMemo(
    () => tasks.filter((i) => isOverdue(i.task)).length,
    [tasks],
  );

  const replyMut = useMutation({
    mutationFn: async (p: {
      inquiryId: string;
      noteId: string;
      text: string;
      replyToId?: string;
      customer?: string;
      notifyHarel: boolean;
    }) => {
      await ramiReplyFn({
        data: {
          inquiryId: p.inquiryId,
          noteId: p.noteId,
          text: p.text,
          replyToId: p.replyToId,
        },
      });

      let chip: NotifyChip = {
        at: new Date().toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        ok: true,
        message: "נשמר",
      };

      if (p.notifyHarel) {
        void playDispatchChime(0.9);
        try {
          await notifyHarelQueueFn({
            data: {
              noteId: p.noteId,
              customer: p.customer,
              kind: "rami_replied",
            },
          });
          chip = {
            ...chip,
            ok: true,
            message: `התראה להראל · ת.מ. ${p.noteId}`,
          };
        } catch (e) {
          console.warn("OneSignal", e);
          chip = {
            ...chip,
            ok: false,
            message: "נשמר · התראה נכשלה",
          };
          throw Object.assign(new Error("reply_ok_notify_failed"), {
            noteId: p.noteId,
            inquiryId: p.inquiryId,
            chip,
          });
        }
      }

      return { noteId: p.noteId, inquiryId: p.inquiryId, chip };
    },
    onSuccess: (res) => {
      setNotifyChips((prev) => ({ ...prev, [res.inquiryId]: res.chip }));
      if (res.chip.ok && res.chip.message.includes("התראה")) {
        toast.success(res.chip.message);
      } else {
        toast.success("המענה נשמר");
      }
      void qc.invalidateQueries({ queryKey: ["workroom"] });
    },
    onError: (e: Error & { chip?: NotifyChip; inquiryId?: string }) => {
      if (e.message === "reply_ok_notify_failed" && e.inquiryId && e.chip) {
        setNotifyChips((prev) => ({ ...prev, [e.inquiryId!]: e.chip! }));
        toast.error("המענה נשמר, אך שליחת OneSignal להראל נכשלה");
        void qc.invalidateQueries({ queryKey: ["workroom"] });
        return;
      }
      toast.error(e.message || "שגיאה בשמירת מענה");
    },
  });

  const retryNotify = async (inq: WorkroomInquiry) => {
    try {
      void playDispatchChime(0.7);
      await notifyHarelQueueFn({
        data: {
          noteId: inq.docNumber,
          customer: inq.customer,
          kind: "rami_replied",
        },
      });
      const chip: NotifyChip = {
        at: new Date().toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        ok: true,
        message: `התראה להראל · ת.מ. ${inq.docNumber}`,
      };
      setNotifyChips((prev) => ({
        ...prev,
        [inq.id || inq.docNumber]: chip,
      }));
      toast.success(chip.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שליחת התראה נכשלה");
    }
  };

  return (
    <div
      className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/20"
      dir="rtl"
    >
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-6">
        <PageHeader
          title="בירור תעודות"
          subtitle="משימות פתוחות · מענה עם היסטוריה · שליחה להראל + OneSignal"
          action={
            <Button
              size="sm"
              variant="outline"
              className="min-h-10 gap-2 rounded-xl"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw
                className={cn("h-4 w-4", q.isFetching && "animate-spin")}
              />
              רענון תור
            </Button>
          }
        />

        <WorkroomNav active="inquiry" />

        {/* מדדים */}
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="משימות לראמי"
            value={tasks.length}
            active={tab === "tasks"}
            onClick={() => setTab("tasks")}
            icon={RotateCcw}
            badge={overdueCount > 0 ? overdueCount : undefined}
          />
          <Stat
            label="ממתינים להראל"
            value={pendingHarel.length}
            active={tab === "pending_harel"}
            onClick={() => setTab("pending_harel")}
            icon={Crown}
          />
          <Stat
            label="הכל"
            value={all.length}
            active={tab === "all"}
            onClick={() => setTab("all")}
            icon={Inbox}
          />
        </div>

        {/* פילטרים */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש ת.מ. / לקוח / נהג…"
            className="min-h-10 min-w-[160px] flex-1 rounded-xl border border-border/70 bg-card px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => setOnlyOverdue((v) => !v)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition",
              onlyOverdue
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            רק באיחור
          </button>
          <button
            type="button"
            onClick={() => setNotifyByDefault((v) => !v)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition",
              notifyByDefault
                ? "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200"
                : "border-border/70 bg-card text-muted-foreground",
            )}
            title="ברירת מחדל לשליחת OneSignal בהראל"
          >
            {notifyByDefault ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
            OneSignal
          </button>
        </div>

        {focusId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-950 dark:text-orange-100">
            <span className="inline-flex items-center gap-2">
              <Filter className="h-3.5 w-3.5" />
              משימה ממוקדת: ת.מ. {focusId}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Link
                to="/harel"
                search={{ task: focusId }}
                className="rounded-lg border border-orange-500/30 bg-background/60 px-2.5 py-1 text-[11px] font-bold hover:bg-background"
              >
                מסך הראל
              </Link>
              <Link
                to="/notes/$id"
                params={{ id: focusId }}
                className="rounded-lg border border-orange-500/30 bg-background/60 px-2.5 py-1 text-[11px] font-bold hover:bg-background"
              >
                תעודה
              </Link>
            </div>
          </div>
        )}

        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between px-1 text-[11px] text-muted-foreground"
        >
          <span>
            {filtered.length} מתוך {list.length} בתור הנוכחי
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                q.isFetching
                  ? "bg-amber-500 animate-pulse"
                  : q.isError
                    ? "bg-destructive"
                    : "bg-emerald-500",
              )}
            />
            {q.isFetching
              ? "מתעדכן…"
              : q.isError
                ? "שגיאת רענון"
                : "רענון כל 2 דק׳"}
          </span>
        </div>

        {q.isLoading && (
          <div className="flex justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען משימות…
          </div>
        )}

        {!q.isLoading && filtered.length === 0 && (
          <div className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            {tab === "tasks"
              ? "אין משימות פתוחות לראמי — הכל בטיפול או סגור"
              : "אין פריטים בתור זה"}
          </div>
        )}

        <div className="space-y-4">
          {filtered.map((inq) => {
            const key = inq.id || inq.docNumber;
            const card = toCard(inq);
            const isFocus =
              !!focusId &&
              (inq.docNumber === focusId || inq.id === focusId);
            const chip = notifyChips[key];

            return (
              <div
                key={key}
                className={cn(
                  "rounded-3xl transition",
                  isFocus && "ring-2 ring-orange-400/80 ring-offset-2 ring-offset-background",
                  isOverdue(inq.task) && "ring-1 ring-destructive/30",
                )}
              >
                {/* שורת קיצורי ניווט מעל הכרטיס */}
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
                  <Link
                    to="/notes/$id"
                    params={{ id: inq.docNumber }}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border/70 bg-card px-2.5 text-[11px] font-bold text-foreground hover:bg-muted/50"
                  >
                    <FileText className="h-3 w-3" />
                    תעודה
                  </Link>
                  <Link
                    to="/harel"
                    search={{ task: inq.docNumber }}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 text-[11px] font-bold text-amber-900 dark:text-amber-100"
                  >
                    <Crown className="h-3 w-3" />
                    הראל
                  </Link>
                  <Link
                    to="/chat"
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border/70 bg-card px-2.5 text-[11px] font-bold hover:bg-muted/50"
                  >
                    <MessageSquare className="h-3 w-3" />
                    צ׳אט
                  </Link>
                  {inq.driveUrl && (
                    <a
                      href={inq.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border/70 bg-card px-2.5 text-[11px] font-bold hover:bg-muted/50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Drive
                    </a>
                  )}
                  {chip && (
                    <span
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold",
                        chip.ok
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                          : "border-destructive/30 bg-destructive/10 text-destructive",
                      )}
                    >
                      {chip.ok ? (
                        <Bell className="h-3 w-3" />
                      ) : (
                        <BellOff className="h-3 w-3" />
                      )}
                      {chip.at} · {chip.message}
                    </span>
                  )}
                  {chip && !chip.ok && (
                    <button
                      type="button"
                      onClick={() => void retryNotify(inq)}
                      className="inline-flex min-h-9 items-center rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 text-[11px] font-bold text-sky-900 dark:text-sky-100"
                    >
                      נסה שוב התראה
                    </button>
                  )}
                </div>

                <ExpandableTaskCard
                  data={card}
                  defaultOpen={!!isFocus}
                  mode="rami"
                  onReply={async (text, replyToId) => {
                    await replyMut.mutateAsync({
                      inquiryId: key,
                      noteId: inq.docNumber,
                      text,
                      replyToId,
                      customer: inq.customer,
                      notifyHarel: notifyByDefault,
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
    dueLabel:
      mins != null
        ? mins < 0
          ? `עבר ב־${Math.abs(mins)} דק׳`
          : `${mins} דק׳`
        : undefined,
    overdue: isOverdue(i.task),
    driveUrl: i.driveUrl,
  };
}

function Stat({
  label,
  value,
  active,
  onClick,
  icon: Icon,
  badge,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border p-3 text-right transition min-h-[4.5rem]",
        active
          ? "border-primary/40 bg-primary/10 shadow-sm"
          : "border-border/60 bg-card/80 hover:bg-muted/40",
      )}
    >
      {badge != null && badge > 0 && (
        <span className="absolute -top-1.5 left-2 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {badge}
        </span>
      )}
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 opacity-50" />
        <span className="font-display text-xl font-extrabold tabular-nums">
          {value}
        </span>
      </div>
      <div className="mt-1 text-[10px] font-bold text-muted-foreground">
        {label}
      </div>
    </button>
  );
}
