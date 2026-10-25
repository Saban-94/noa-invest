/**
 * כרטיס תעודה בשכבות
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
  FileText,
  MessageSquare,
  Send,
  Crown,
  User,
  Bot,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InquiryMessage } from "@/lib/inquiry-workflow";
import { formatHe } from "@/lib/inquiry-workflow";

export type TaskCardData = {
  id: string;
  docNumber: string;
  customer: string;
  customerNo?: string;
  address?: string;
  driver?: string;
  date?: string;
  issue?: string;
  aiAnalysis?: string;
  status: string;
  statusLabel?: string;
  thread?: InquiryMessage[];
  taskReason?: string;
  dueLabel?: string;
  overdue?: boolean;
  driveUrl?: string;
};

const ROLE_ICON = {
  rami: User,
  harel: Crown,
  ai: Bot,
  system: MessageSquare,
} as const;

export function ExpandableTaskCard({
  data,
  defaultOpen = false,
  mode = "rami",
  onReply,
  onSendToHarel,
  onOpenTask,
  className,
}: {
  data: TaskCardData;
  defaultOpen?: boolean;
  mode?: "rami" | "harel";
  onReply?: (text: string, replyToId?: string) => Promise<void> | void;
  onSendToHarel?: () => void;
  onOpenTask?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expandedMsg, setExpandedMsg] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const thread = data.thread || [];

  const submit = async (sendHarel?: boolean) => {
    if (!draft.trim() || !onReply) return;
    setBusy(true);
    try {
      await onReply(draft.trim(), replyTo || undefined);
      setDraft("");
      setReplyTo(null);
      if (sendHarel) onSendToHarel?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={cn(
        "overflow-hidden rounded-3xl border bg-gradient-to-br from-card via-card to-muted/30 shadow-xl ring-1 ring-black/5 dark:ring-white/10",
        data.overdue && "ring-2 ring-destructive/50",
        className,
      )}
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          onOpenTask?.();
        }}
        className="flex w-full items-start gap-3 p-4 text-right transition hover:bg-muted/30"
      >
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-extrabold">ת.מ. {data.docNumber}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
              {data.statusLabel || data.status}
            </span>
            {data.overdue && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                באיחור
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm font-bold">{data.customer}</div>
          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {data.issue || data.aiAnalysis || data.address || "—"}
          </div>
          {data.taskReason && (
            <div className="mt-1.5 rounded-xl bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold">
              משימה: {data.taskReason}
              {data.dueLabel ? ` · יעד ${data.dueLabel}` : ""}
            </div>
          )}
        </div>
        <ChevronDown className={cn("mt-2 h-5 w-5 shrink-0 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/50 bg-background/40 p-4">
          <div className="grid gap-2 rounded-2xl border bg-muted/20 p-3 text-xs sm:grid-cols-2">
            <Row label="לקוח" value={data.customer} />
            <Row label="מס׳ לקוח" value={data.customerNo || "—"} />
            <Row label="כתובת" value={data.address || "—"} />
            <Row label="נהג" value={data.driver || "—"} />
            <Row label="תאריך" value={data.date || "—"} />
            <Row label="סטטוס" value={data.statusLabel || data.status} />
          </div>

          {(data.issue || data.aiAnalysis) && (
            <div className="space-y-1 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
              {data.issue && <p className="text-sm font-bold">{data.issue}</p>}
              {data.aiAnalysis && (
                <p className="text-xs text-muted-foreground">{data.aiAnalysis}</p>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">
              היסטוריית מענים
            </div>
            {thread.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין הודעות עדיין</p>
            ) : (
              <ul className="space-y-1.5">
                {thread.map((m) => {
                  const Icon = ROLE_ICON[m.role] || MessageSquare;
                  const isOpen = expandedMsg === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedMsg((id) => (id === m.id ? null : m.id))}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-right text-xs",
                          isOpen ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card hover:bg-muted/40",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="font-bold">
                          {m.role === "rami" ? "ראמי" : m.role === "harel" ? "הראל" : m.role === "ai" ? "AI" : "מערכת"}
                        </span>
                        <span className="truncate text-muted-foreground">{m.text}</span>
                        <span className="mr-auto text-[10px] text-muted-foreground">{formatHe(m.at)}</span>
                      </button>
                      {isOpen && (
                        <div className="mt-1 space-y-2 rounded-xl border bg-muted/20 p-3">
                          <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                          {onReply && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-[11px]"
                              onClick={() => {
                                setReplyTo(m.id);
                                setDraft(`לגבי הודעת ${m.role}: `);
                              }}
                            >
                              הגב לתשובה זו
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {onReply && (
            <div className="space-y-2 rounded-2xl border bg-card p-3">
              {replyTo && (
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>תגובה להודעה</span>
                  <button type="button" className="font-bold" onClick={() => setReplyTo(null)}>
                    ביטול
                  </button>
                </div>
              )}
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={mode === "rami" ? "מענה ראמי..." : "הערת הראל..."}
                rows={3}
                className="resize-none text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" disabled={busy || !draft.trim()} onClick={() => void submit(mode === "rami")}>
                  <Send className="h-3.5 w-3.5" />
                  {mode === "rami" ? "שלח להראל" : "שמור"}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy || !draft.trim()} onClick={() => void submit(false)}>
                  הודעה חדשה
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Link to="/notes/$id" params={{ id: data.docNumber }} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[11px] font-bold hover:bg-muted">
              <FileText className="h-3.5 w-3.5" /> תעודה <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
            <Link to="/inquiry" search={{ task: data.docNumber, tab: "tasks" }} className="inline-flex items-center gap-1 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-bold">
              <MessageSquare className="h-3.5 w-3.5" /> חדר משימה
            </Link>
            <Link to="/harel" className="inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold">
              <Crown className="h-3.5 w-3.5" /> דשבורד הראל
            </Link>
            {data.driveUrl && (
              <a href={data.driveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[11px] font-bold">
                <ExternalLink className="h-3.5 w-3.5" /> Drive
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
