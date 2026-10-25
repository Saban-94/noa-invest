/**
 * חדר צ׳אט נועה — הקשר דף + תשובות מעוצבות + CTA
 * לשילוב ב-layout או לצד שרשור בירור
 */

import { useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoaPage =
  | "inquiry"
  | "note"
  | "harel"
  | "ituran"
  | "customer"
  | "canvas"
  | "orders"
  | "other";

export type NoaContext = {
  page: NoaPage;
  noteId?: string;
  inquiryId?: string;
  customerNo?: string;
  issueSummary?: string;
  status?: string;
};

export type NoaCta = {
  id: string;
  label: string;
  action: "send-to-rami" | "cross-ituran" | "customer-history" | "open-canvas" | "custom";
};

export type NoaReply = {
  htmlTitle: string;
  body?: string;
  ctas?: NoaCta[];
};

function detectPage(pathname: string): NoaPage {
  if (pathname.startsWith("/inquiry")) return "inquiry";
  if (pathname.startsWith("/harel") || pathname.startsWith("/approvals")) return "harel";
  if (pathname.startsWith("/notes")) return "note";
  if (pathname.startsWith("/ituran")) return "ituran";
  if (pathname.startsWith("/customers")) return "customer";
  if (pathname.startsWith("/canvas")) return "canvas";
  if (pathname.startsWith("/orders")) return "orders";
  return "other";
}

const PAGE_TITLE: Record<NoaPage, string> = {
  inquiry: "בירור תעודה",
  harel: "דשבורד הראל",
  note: "תעודת משלוח",
  ituran: "איתוראן GPS",
  customer: "תיק לקוח",
  canvas: "קנבס סימון",
  orders: "הזמנות",
  other: "מערכת נועה",
};

/** תשובת דמו מקומית — להחלפה ב-askNoa server fn */
function localNoaReply(ctx: NoaContext, q: string): NoaReply {
  const issue = ctx.issueSummary || q || "לא זוהתה חריגה מפורשת";
  return {
    htmlTitle: issue.slice(0, 120),
    body:
      ctx.page === "ituran"
        ? "אפשר להצליב את כתובת התעודה מול עצירות ה-GPS של חכמת/עלי."
        : ctx.page === "harel"
          ? "תור האישורים ממתין להחלטה. אפשר להחזיר לראמי עם «מה חסר» ויעד זמן."
          : "מומלץ לבדוק כתב יד, פקדונות והצלבה לאיתוראן לפני סגירה.",
    ctas: [
      { id: "1", label: "שלח לבירור ראמי", action: "send-to-rami" },
      { id: "2", label: "הצלב מול איתוראן", action: "cross-ituran" },
      { id: "3", label: "היסטוריית לקוח", action: "customer-history" },
    ],
  };
}

export function NoaChatShell({
  context: contextProp,
  className,
  defaultOpen = false,
  onCta,
}: {
  context?: Partial<NoaContext>;
  className?: string;
  defaultOpen?: boolean;
  onCta?: (cta: NoaCta, ctx: NoaContext) => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [replies, setReplies] = useState<{ q: string; r: NoaReply }[]>([]);

  const ctx: NoaContext = useMemo(
    () => ({
      page: contextProp?.page || detectPage(pathname),
      noteId: contextProp?.noteId,
      inquiryId: contextProp?.inquiryId,
      customerNo: contextProp?.customerNo,
      issueSummary: contextProp?.issueSummary,
      status: contextProp?.status,
    }),
    [pathname, contextProp],
  );

  const ask = () => {
    const q = input.trim();
    if (!q) return;
    const r = localNoaReply(ctx, q);
    setReplies((prev) => [...prev, { q, r }]);
    setInput("");
  };

  return (
    <div className={cn("flex flex-col", className)} dir="rtl">
      {!open ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-2 rounded-full shadow-md"
          onClick={() => setOpen(true)}
        >
          <Sparkles className="h-4 w-4 text-violet-600" />
          נועה · {PAGE_TITLE[ctx.page]}
        </Button>
      ) : (
        <div className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-violet-500/30 bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border/60 bg-violet-500/10 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="h-4 w-4 text-violet-600" />
                נועה
              </div>
              <div className="text-[11px] text-muted-foreground">
                {PAGE_TITLE[ctx.page]}
                {ctx.noteId ? ` · ת.מ. ${ctx.noteId}` : ""}
                {ctx.status ? ` · ${ctx.status}` : ""}
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {ctx.issueSummary && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="text-base font-extrabold leading-snug text-violet-950">
                  {ctx.issueSummary}
                </div>
              </div>
            )}
            {replies.map((item, i) => (
              <div key={i} className="space-y-2">
                <div className="text-[11px] text-muted-foreground">אתה: {item.q}</div>
                <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 p-3">
                  <div className="text-lg font-extrabold leading-snug text-foreground">
                    {item.r.htmlTitle}
                  </div>
                  {item.r.body && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.r.body}</p>
                  )}
                  {!!item.r.ctas?.length && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.r.ctas.map((c) => (
                        <Button
                          key={c.id}
                          size="sm"
                          variant="secondary"
                          className="text-[11px] font-bold"
                          onClick={() => onCta?.(c, ctx)}
                        >
                          {c.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border/60 p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="שאל את נועה על החריגה, איתוראן, לקוח..."
                rows={2}
                className="min-h-0 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
              />
              <Button size="icon" className="shrink-0" onClick={ask}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
