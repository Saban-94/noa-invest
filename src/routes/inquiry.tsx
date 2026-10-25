/**
 * /inquiry — לוח משימות בירור (ראמי)
 * כרטיסים מתרחבים · מצב משימה · שליחה להראל + צלצול + OneSignal
 */

import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Inbox,
  RotateCcw,
  Crown,
  Filter,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ExpandableTaskCard, type TaskCardData } from "@/components/ExpandableTaskCard";
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

function InquiryBoard() {
  const search = useSearch({ from: "/inquiry" });
  const focusId = search.task;
  const [tab, setTab] = useState<Tab>(search.tab || "tasks");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["workroom", "inquiry-board"],
    queryFn: () => listWorkroomInquiriesFn(),
    refetchInterval: 45_000,
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

  const sorted = useMemo(() => {
    const copy = [...list];
    if (focusId) {
      copy.sort((a, b) => {
        const af = a.docNumber === focusId || a.id === focusId ? 0 : 1;
        const bf = b.docNumber === focusId || b.id === focusId ? 0 : 1;
        return af - bf;
      });
    }
    return copy;
  }, [list, focusId]);

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
        } catch (e) {
          console.warn("OneSignal", e);
        }
      }
    },
    onSuccess: () => {
      toast.success("המענה נשמר · נשלח להראל");
      void qc.invalidateQueries({ queryKey: ["workroom"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/20"
      dir="rtl"
    >
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-6">
        <PageHeader
          title="בירור תעודות"
          subtitle="משימות פתוחות · מענה עם היסטוריה · שליחה להראל"
          action={
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCw
                className={cn("h-4 w-4", q.isFetching && "animate-spin")}
              />
              רענון
            </Button>
          }
        />

        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="משימות לראמי"
            value={tasks.length}
            active={tab === "tasks"}
            onClick={() => setTab("tasks")}
            icon={RotateCcw}
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

        {focusId && (
          <div className="flex items-center gap-2 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-950 dark:text-orange-100">
            <Filter className="h-3.5 w-3.5" />
            משימה ממוקדת: ת.מ. {focusId}
          </div>
        )}

        {q.isLoading && (
          <div className="flex justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען משימות...
          </div>
        )}

        {!q.isLoading && sorted.length === 0 && (
          <div className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            {tab === "tasks"
              ? "אין משימות פתוחות לראמי"
              : "אין פריטים בתור זה"}
          </div>
        )}

        <div className="space-y-4">
          {sorted.map((inq) => {
            const card = toCard(inq);
            const isFocus =
              focusId &&
              (inq.docNumber === focusId || inq.id === focusId);
            return (
              <ExpandableTaskCard
                key={inq.id || inq.docNumber}
                data={card}
                defaultOpen={!!isFocus}
                mode="rami"
                onReply={async (text, replyToId) => {
                  await replyMut.mutateAsync({
                    inquiryId: inq.id || inq.docNumber,
                    noteId: inq.docNumber,
                    text,
                    replyToId,
                    customer: inq.customer,
                    notifyHarel: true,
                  });
                }}
              />
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
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3 text-right transition",
        active
          ? "border-primary/40 bg-primary/10 shadow-sm"
          : "border-border/60 bg-card/80 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 opacity-50" />
        <span className="font-display text-xl font-extrabold">{value}</span>
      </div>
      <div className="mt-1 text-[10px] font-bold text-muted-foreground">{label}</div>
    </button>
  );
}
