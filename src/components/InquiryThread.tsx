/**
 * שרשור הודעות מתועד — AI / ראמי / הראל / מערכת
 */

import type { InquiryMessage, MessageRole } from "@/lib/inquiry-workflow";
import { formatHe } from "@/lib/inquiry-workflow";
import { cn } from "@/lib/utils";

const ROLE_UI: Record<
  MessageRole,
  { label: string; bubble: string; align: string }
> = {
  system: {
    label: "מערכת",
    bubble: "bg-muted/80 text-muted-foreground border-border",
    align: "mx-auto text-center",
  },
  ai: {
    label: "🤖 AI",
    bubble: "bg-violet-500/10 text-violet-950 border-violet-500/25",
    align: "",
  },
  rami: {
    label: "✍️ ראמי",
    bubble: "bg-sky-500/10 text-sky-950 border-sky-500/25",
    align: "",
  },
  harel: {
    label: "👑 הראל",
    bubble: "bg-amber-500/15 text-amber-950 border-amber-500/30",
    align: "",
  },
};

export function InquiryThread({
  messages,
  className,
}: {
  messages: InquiryMessage[];
  className?: string;
}) {
  if (!messages?.length) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
        אין הודעות עדיין בשרשור
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} dir="rtl">
      {messages.map((m) => {
        const ui = ROLE_UI[m.role] || ROLE_UI.system;
        return (
          <div
            key={m.id}
            className={cn(
              "max-w-[95%] rounded-2xl border px-3.5 py-2.5 text-sm shadow-sm",
              ui.bubble,
              ui.align,
            )}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold opacity-80">
              <span>{ui.label}</span>
              <span className="font-normal opacity-70">{formatHe(m.at)}</span>
              {m.action && (
                <span className="rounded-md bg-background/50 px-1.5 py-0.5 text-[10px]">
                  {m.action}
                </span>
              )}
            </div>
            <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
            {!!m.attachments?.length && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-border/60 bg-background/60 px-2 py-1 text-[11px] font-semibold hover:bg-background"
                  >
                    {a.label || a.type}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
