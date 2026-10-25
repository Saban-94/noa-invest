/**
 * שרשור בירור מתקפל עם תגובה ממוקדת להודעה או הודעה חדשה.
 */

import { useState } from "react";
import type { InquiryMessage, MessageRole } from "@/lib/inquiry-workflow";
import { formatHe } from "@/lib/inquiry-workflow";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bot, Crown, MessageSquare, Send, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ROLE_UI: Record<MessageRole, { label: string; icon: LucideIcon; bubble: string }> = {
  system: { label: "מערכת", icon: MessageSquare, bubble: "border-border bg-muted/50" },
  ai: { label: "נועה AI", icon: Bot, bubble: "border-violet-500/20 bg-violet-500/5" },
  rami: { label: "ראמי", icon: User, bubble: "border-sky-500/20 bg-sky-500/5" },
  harel: { label: "הראל", icon: Crown, bubble: "border-amber-500/25 bg-amber-500/5" },
};

export function InquiryThread({
  messages,
  className,
  onReply,
}: {
  messages: InquiryMessage[];
  className?: string;
  onReply?: (text: string, replyToId?: string) => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<InquiryMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = draft.trim();
    if (!text || !onReply) return;
    setBusy(true);
    try {
      await onReply(text, replyTo?.id);
      setDraft("");
      setReplyTo(null);
      toast.success(replyTo ? "התגובה נשלחה לשרשור" : "ההודעה נוספה לשרשור");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שליחת ההודעה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-2.5", className)} dir="rtl">
      {!messages?.length ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">אין הודעות עדיין בשרשור</div>
      ) : (
        messages.map((m) => {
          const ui = ROLE_UI[m.role] || ROLE_UI.system;
          const Icon = ui.icon;
          const isOpen = expanded === m.id;
          const repliedTo = m.replyToId ? messages.find((item) => item.id === m.replyToId) : undefined;
          return (
            <article key={m.id} className={cn("overflow-hidden rounded-2xl border shadow-sm transition-colors", ui.bubble)}>
              <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : m.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-right hover:bg-background/40">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background/80"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">{ui.label}</span><span className="mt-0.5 block truncate text-[11px] opacity-70">{m.text}</span></span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatHe(m.at)}</span>
                <span className="text-lg font-bold text-primary">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-border/50 px-4 py-3">
                  {repliedTo && <div className="mb-2 rounded-xl border-r-2 border-primary bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">תגובה ל־{repliedTo.role === "harel" ? "הראל" : repliedTo.role === "rami" ? "ראמי" : repliedTo.role === "ai" ? "נועה AI" : "מערכת"}: {repliedTo.text}</div>}
                  <p className="whitespace-pre-wrap text-sm leading-7">{m.text}</p>
                  {!!m.attachments?.length && <div className="mt-3 flex flex-wrap gap-2">{m.attachments.map((a, i) => <a key={i} href={a.url} target="_blank" rel="noreferrer" className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted">{a.label || a.type}</a>)}</div>}
                  {onReply && <Button type="button" size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => { setReplyTo(m); setDraft(""); }}><Send className="h-3.5 w-3.5" /> השב להודעה זו</Button>}
                </div>
              )}
            </article>
          );
        })
      )}
      {onReply && (
        <div className="space-y-2 rounded-2xl border bg-card p-3.5">
          {replyTo ? <div className="flex items-start justify-between gap-3 rounded-xl bg-primary/5 px-3 py-2 text-xs"><span className="min-w-0"><b>תגובה ל־{ROLE_UI[replyTo.role]?.label || "הודעה"}:</b> <span className="text-muted-foreground">{replyTo.text}</span></span><button type="button" className="shrink-0 font-bold text-primary" onClick={() => setReplyTo(null)}>ביטול</button></div> : <div className="text-xs font-bold text-muted-foreground">הודעה חדשה בשרשור</div>}
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="resize-y" placeholder={replyTo ? "כתוב תגובה להודעה שנבחרה..." : "כתוב הודעה חדשה..."} />
          <div className="flex justify-end"><Button type="button" size="sm" className="gap-2" disabled={busy || draft.trim().length < 3} onClick={() => void send()}><Send className="h-3.5 w-3.5" />{busy ? "שולח..." : replyTo ? "שלח תגובה" : "שלח הודעה"}</Button></div>
        </div>
      )}
    </div>
  );
}
