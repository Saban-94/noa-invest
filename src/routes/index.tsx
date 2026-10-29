/**
 * ראשי הראל (/) — דשבורד מקצועי:
 * תעודות לאישור | תעודות בבירור ראמי | ניווט חכם
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { noteWeightTons, type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes, approveStrict } from "@/lib/api";
import { approvals, useApprovals } from "@/lib/store";
import { playUrgentSignatureAlarm } from "@/lib/audio-alerts";
import { PageHeader } from "@/components/AppShell";
import {
  Crown,
  ChevronLeft,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  MessageSquareWarning,
  FileText,
  Send,
  Inbox,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ראשי הראל — נועה ח. סבן" },
      {
        name: "description",
        content:
          "דשבורד מנכ״ל: תעודות לאישור, בירורים אצל ראמי, ניווט לתעודה ולמשימה.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const ap = useApprovals();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

  const {
    data: notes,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-dashboard"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
    retry: 1,
  });

  const notesList = notes || [];

  const forApproval = useMemo(
    () =>
      notesList.filter(
        (n) =>
          !ap[n.id]?.harel &&
          (n.noteStage === "pending_harel" ||
            n.noteStage === "pending_harel_reply" ||
            (ap[n.id]?.rami && !ap[n.id]?.harel)),
      ),
    [notesList, ap],
  );

  const inInquiry = useMemo(
    () =>
      notesList.filter(
        (n) =>
          n.noteStage === "returned_to_rami" ||
          n.noteStage === "pending_rami" ||
          n.live === true,
      ),
    [notesList],
  );

  const done = useMemo(
    () => notesList.filter((n) => ap[n.id]?.harel || n.noteStage === "final"),
    [notesList, ap],
  );

  const sumTons = forApproval.reduce((s, n) => s + noteWeightTons(n), 0);

  const handleApproveSingle = async (noteId: string) => {
    setApprovingId(noteId);
    try {
      await approveStrict(noteId, "harel");
      approvals.harel(noteId);
      playUrgentSignatureAlarm();
      toast.success(`ת.מ. ${noteId} אושרה סופית 👑`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "אישור נכשל");
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveAll = async () => {
    if (!forApproval.length) return;
    setIsApprovingAll(true);
    try {
      for (const n of forApproval) {
        await approveStrict(n.id, "harel");
        approvals.harel(n.id);
      }
      playUrgentSignatureAlarm();
      toast.success(`אושרו ${forApproval.length} תעודות`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "אישור מרוכז נכשל");
    } finally {
      setIsApprovingAll(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
      <PageHeader
        title="ראשי הראל"
        subtitle="אישור תעודות · מעקב בירורים אצל ראמי · ניווט למשימה ולהודעות"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              רענון
            </Button>
            <Link
              to="/harel"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
            >
              <Crown className="h-4 w-4" />
              דשבורד משימות והודעות
            </Link>
            <Link
              to="/inquiry"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted"
            >
              <MessageSquareWarning className="h-4 w-4" />
              מרכז בירורים
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="נשלחו לאישור"
          value={forApproval.length}
          hint={`${sumTons.toFixed(1)} טון`}
          color="text-amber-800"
          bg="bg-amber-500/10 border-amber-500/25"
          icon={Inbox}
        />
        <Kpi
          label="נשלחו לבירור ראמי"
          value={inInquiry.length}
          hint="ממתינים למענה / טיפול"
          color="text-orange-800"
          bg="bg-orange-500/10 border-orange-500/25"
          icon={AlertTriangle}
        />
        <Kpi
          label="אושרו"
          value={done.length}
          hint="נסגרו לחיוב / הנה״ח"
          color="text-emerald-800"
          bg="bg-emerald-500/10 border-emerald-500/25"
          icon={CheckCircle2}
        />
        <Kpi
          label="סה״כ במאגר"
          value={notesList.length}
          hint="תעודות חיות"
          color="text-foreground"
          bg="bg-muted/40 border-border"
          icon={FileText}
        />
      </div>

      {error && (
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          שגיאת טעינה: {error instanceof Error ? error.message : "לא ידוע"}
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          טוען תעודות מהגיליון...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800">
                  <Crown className="h-4 w-4" />
                </span>
                תעודות שנשלחו לאישור
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-900">
                  {forApproval.length}
                </span>
              </h2>
              {forApproval.length > 1 && (
                <Button
                  size="sm"
                  className="bg-amber-700 text-xs hover:bg-amber-800"
                  disabled={isApprovingAll}
                  onClick={() => void handleApproveAll()}
                >
                  {isApprovingAll && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />}
                  אשר הכל
                </Button>
              )}
            </div>

            {forApproval.length === 0 ? (
              <EmptyBox text="אין תעודות ממתינות לאישור מנכ״ל" />
            ) : (
              forApproval.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  variant="approval"
                  isApproving={approvingId === n.id}
                  onApprove={() => void handleApproveSingle(n.id)}
                />
              ))
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/15 text-orange-800">
                  <MessageSquareWarning className="h-4 w-4" />
                </span>
                תעודות שנשלחו לבירור
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-900">
                  {inInquiry.length}
                </span>
              </h2>
              <Link to="/inquiry" className="text-xs font-bold text-primary hover:underline">
                לכל הבירורים
              </Link>
            </div>

            {inInquiry.length === 0 ? (
              <EmptyBox text="אין תעודות פתוחות בבירור אצל ראמי" />
            ) : (
              inInquiry.map((n) => <NoteCard key={n.id} note={n} variant="inquiry" />)
            )}
          </section>
        </div>
      )}

      {done.length > 0 && (
        <section className="space-y-2" data-scroll-reveal>
          <h3 className="text-sm font-bold text-muted-foreground">
            אושרו ע״י מנכ״ל ({done.length})
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {done.slice(0, 12).map((n) => (
              <Link
                key={n.id}
                to="/notes/$id"
                params={{ id: n.id }}
                className="flex items-center justify-between rounded-2xl border border-border/50 bg-card px-4 py-3 text-sm shadow-sm hover:border-emerald-500/40"
              >
                <span className="font-semibold">
                  {n.customer} · <span className="font-mono">#{n.id}</span>
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  👑 אושר
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  color,
  bg,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  color: string;
  bg: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className={`rounded-2xl border p-4 shadow-sm ${bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
          <div className={`mt-1 font-display text-2xl font-extrabold ${color}`}>{value}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
        </div>
        <Icon className={`h-7 w-7 opacity-40 ${color}`} />
      </div>
    </Card>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function NoteCard({
  note: n,
  variant,
  isApproving,
  onApprove,
}: {
  note: DeliveryNote;
  variant: "approval" | "inquiry";
  isApproving?: boolean;
  onApprove?: () => void;
}) {
  const border =
    variant === "approval"
      ? "border-amber-500/35 bg-gradient-to-l from-amber-500/5 to-transparent"
      : "border-orange-500/35 bg-gradient-to-l from-orange-500/5 to-transparent";

  const stageLabel =
    n.noteStage === "returned_to_rami"
      ? "הוחזר לראמי · משימה פתוחה"
      : n.noteStage === "pending_harel_reply"
        ? "ממתין למענה / אישור"
        : n.noteStage === "pending_rami"
          ? "ממתין לראמי"
          : n.noteStage === "pending_harel"
            ? "ממתין להראל"
            : n.live
              ? "חי מהגיליון"
              : "בטיפול";

  return (
    <article className={`overflow-hidden rounded-2xl border shadow-sm ${border}`}>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold">ת.מ. {n.id}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">{n.date}</span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                variant === "approval"
                  ? "bg-amber-500/15 text-amber-900"
                  : "bg-orange-500/15 text-orange-900"
              }`}
            >
              {stageLabel}
            </span>
          </div>
          <span className="text-left text-sm font-extrabold tabular-nums">
            {noteWeightTons(n).toFixed(1)} טון
          </span>
        </div>

        <div className="text-sm font-bold">{n.customer}</div>
        <div className="text-xs text-muted-foreground">
          {n.siteAddress || "—"}
          {n.driver ? ` · ${n.driver}` : ""}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            to="/notes/$id"
            params={{ id: n.id }}
            className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] font-bold hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" />
            פתח תעודה
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>

          <Link
            to="/inquiry/$id"
            params={{ id: n.id }}
            className="inline-flex items-center gap-1 rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1.5 text-[11px] font-bold text-orange-950 hover:bg-orange-500/20"
          >
            <MessageSquareWarning className="h-3.5 w-3.5" />
            {variant === "inquiry" ? "משימה / הודעות" : "שלח לבירור ראמי"}
          </Link>

          <Link
            to="/harel"
            className="inline-flex items-center gap-1 rounded-lg border border-amber-600/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-950 hover:bg-amber-500/20"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            דשבורד הראל
          </Link>
        </div>
      </div>

      {variant === "approval" && onApprove && (
        <div className="grid grid-cols-1 border-t border-amber-500/25 sm:grid-cols-2">
          <Link
            to="/inquiry/$id"
            params={{ id: n.id }}
            className="flex items-center justify-center gap-2 bg-orange-600/90 py-3 text-sm font-bold text-white hover:bg-orange-700"
          >
            <Send className="h-4 w-4" />
            שליחה לבירור ראמי
          </Link>
          <button
            type="button"
            onClick={onApprove}
            disabled={isApproving}
            className="flex items-center justify-center gap-2 bg-ceo py-3 text-sm font-bold text-ceo-foreground hover:opacity-95 disabled:opacity-60"
          >
            {isApproving && <Loader2 className="h-4 w-4 animate-spin" />}
            אושר סופית 👑
          </button>
        </div>
      )}

      {variant === "inquiry" && (
        <Link
          to="/inquiry/$id"
          params={{ id: n.id }}
          className="flex items-center justify-center gap-2 border-t border-orange-500/25 bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700"
        >
          <MessageSquareWarning className="h-4 w-4" />
          פתח משימה וקריאת הודעות
          <ChevronLeft className="h-4 w-4" />
        </Link>
      )}
    </article>
  );
}
