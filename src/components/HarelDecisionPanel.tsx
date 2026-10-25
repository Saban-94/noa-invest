/**
 * פעולות הראל: אשר / דחה / החזר לראמי (+ מה חסר + יעד + נדנוד)
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { harelDecideFn } from "@/lib/inquiry-workflow.functions";
import { defaultDueAt } from "@/lib/inquiry-workflow";
import { Check, RotateCcw, X } from "lucide-react";

export function HarelDecisionPanel({
  inquiryId,
  noteId,
  annotationUrl,
  fileId,
  onDone,
}: {
  inquiryId: string;
  noteId?: string;
  annotationUrl?: string;
  fileId?: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"idle" | "return" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [dueLocal, setDueLocal] = useState(() => {
    const d = new Date(Date.now() + 4 * 3600_000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [nudgeMin, setNudgeMin] = useState(60);

  const mut = useMutation({
    mutationFn: harelDecideFn,
    onSuccess: () => {
      toast.success("ההחלטה נשמרה");
      void qc.invalidateQueries({ queryKey: ["workroom"] });
      void qc.invalidateQueries({ queryKey: ["inquiries"] });
      setMode("idle");
      setReason("");
      setNote("");
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (decision: "approve" | "reject" | "return") => {
    if (decision === "return" && !reason.trim()) {
      toast.error("חובה למלא «מה חסר»");
      return;
    }
    mut.mutate({
      data: {
        inquiryId,
        noteId,
        decision,
        text: note,
        reason: reason.trim(),
        dueAt: dueLocal ? new Date(dueLocal).toISOString() : defaultDueAt(4),
        nudgeEveryMin: nudgeMin,
        annotationUrl,
        fileId,
      },
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4" dir="rtl">
      <div className="text-sm font-bold text-amber-950">החלטת הראל</div>

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={mut.isPending}
            onClick={() => submit("approve")}
          >
            <Check className="h-4 w-4" />
            אשר וסגור
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-600 text-amber-900"
            disabled={mut.isPending}
            onClick={() => setMode("return")}
          >
            <RotateCcw className="h-4 w-4" />
            החזר לראמי
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-destructive"
            disabled={mut.isPending}
            onClick={() => setMode("reject")}
          >
            <X className="h-4 w-4" />
            דחה
          </Button>
        </div>
      )}

      {mode === "return" && (
        <div className="space-y-2">
          <label className="text-xs font-bold">
            מה חסר? <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="למשל: חסר אישור זיכוי ל-84 פומים / לבדוק זמן מנוף מול איתוראן"
            rows={3}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">
                יעד למענה ראמי
              </label>
              <Input
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">
                נדנוד כל (דקות)
              </label>
              <Input
                type="number"
                min={15}
                value={nudgeMin}
                onChange={(e) => setNudgeMin(Number(e.target.value) || 60)}
              />
            </div>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה נוספת (אופציונלי)"
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={mut.isPending} onClick={() => submit("return")}>
              שלח משימה לראמי
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="סיבת דחייה"
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={mut.isPending}
              onClick={() => submit("reject")}
            >
              אשר דחייה
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              ביטול
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
