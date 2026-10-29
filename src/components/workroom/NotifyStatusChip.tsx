/**
 * Chip שמראה מה קרה לבקשת ההתראה האחרונה (OneSignal) — ראמי→הראל או הראל→ראמי.
 * «נמסרה» = OneSignal קיבל את הבקשה; זה לא אישור קריאה במכשיר.
 */

import { BellRing, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE, type NotifyState } from "@/lib/workroom-ui";

export function NotifyStatusChip({
  notify,
  className,
}: {
  notify: NotifyState;
  className?: string;
}) {
  if (notify.state === "idle") return null;
  const who = notify.target === "harel" ? "להראל" : "לראמי";
  const tone =
    notify.state === "sending"
      ? TONE.sky
      : notify.state === "sent"
        ? TONE.emerald
        : TONE.destructive;
  const Icon = notify.state === "sending" ? Loader2 : notify.state === "sent" ? BellRing : BellOff;
  const text =
    notify.state === "sending"
      ? `שולח התראה ${who}…`
      : notify.state === "sent"
        ? `התראה ${who} נמסרה ל-OneSignal`
        : `ההתראה ${who} נכשלה — כדאי לעדכן ידנית`;

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
        tone.border,
        tone.surface,
        tone.text,
        className,
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          notify.state === "sending" && "motion-safe:animate-spin motion-reduce:animate-none",
        )}
        aria-hidden="true"
      />
      {text}
      <span className="font-mono opacity-70">· ת.מ. {notify.noteId}</span>
      {notify.state !== "sending" && (
        <span className="opacity-60">
          ·{" "}
          {new Date(notify.at).toLocaleTimeString("he-IL", {
            timeZone: "Asia/Jerusalem",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </span>
  );
}
