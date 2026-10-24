import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clock,
  FileWarning,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listRamiInquiriesFn,
  replyRamiInquiryFn,
  type InquiryKind,
  type RamiInquiry,
} from "@/lib/inquiries-api.functions";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import { playDispatchChime } from "@/lib/audio-alerts";

export const Route = createFileRoute("/inquiries")({
  head: () => ({
    meta: [
      { title: "בירור תעודות — נועה ח. סבן" },
      {
        name: "description",
        content: "מרכז טיפול בחריגים, החזרות ופערים בתעודות משלוח. מענה ראמי ואישור הראל.",
      },
      { property: "og:title", content: "בירור תעודות (ראמי) — ח. סבן" },
      { property: "og:description", content: "טיפול בחריגי תעודות והעברה לאישור מנכ״ל." },
    ],
  }),
  component: InquiriesPage,
});

const FILTERS: { key: "all" | InquiryKind; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "return", label: "🔴 החזרות/החלפות" },
  { key: "crane", label: "⏱️ חריגות מנוף" },
  { key: "damaged", label: "📄 תעודה פגומה/חסרה" },
  { key: "other", label: "אחר" },
];

/** סיווג חריגה לפי הטקסט שחילץ מנוע ה-AI */
function classify(q: RamiInquiry): InquiryKind {
  const t = `${q.issue} ${q.aiAnalysis}`;
  if (/הוחזר|החזר|הוחלף|החלפ/.test(t)) return "return";
  if (/מנוף|פריקה|המתנה/.test(t)) {
    const mins = [...t.matchAll(/(\d{2,3})\s*דק/g)].map((m) => Number(m[1]));
    if (mins.some((m) => m > 45) || /חריג/.test(t)) return "crane";
  }
  if (/דהוי|חסר מספר|ללא מספר|לא קריא|פגום/.test(t)) return "damaged";
  return "other";
}

function Badge({ kind }: { kind: InquiryKind }) {
  const map: Record<InquiryKind, [string, string]> = {
    return: ["🔴 החזרה/החלפה", "bg-destructive/15 text-destructive border-destructive/30"],
    crane: ["⏱️ חריגת מנוף", "bg-amber-500/15 text-amber-800 border-amber-500/30"],
    damaged: ["📄 תעודה פגומה", "bg-purple-500/15 text-purple-700 border-purple-500/30"],
    other: ["❔ אחר", "bg-muted text-muted-foreground border-border"],
  };
  const [label, cls] = map[kind];
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
  );
}

function ScanPane({ fileId }: { fileId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["scan", fileId],
    enabled: !!fileId,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  if (!fileId) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
        אין סריקה מקושרת לתעודה זו
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-2 p-6 text-center text-sm">
        <p className="font-bold text-destructive">לא ניתן לטעון את הסריקה</p>
        <Button size="sm" onClick={() => refetch()}>
          נסה שוב
        </Button>
      </div>
    );
  }
  return (
    <img
      src={data}
      alt="סריקת תעודה"
      className="w-full select-none rounded-2xl border object-contain"
    />
  );
}

function InquiriesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | InquiryKind>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["rami-inquiries"],
    queryFn: async () => (await listRamiInquiriesFn()).inquiries,
    staleTime: 30_000,
    retry: 1,
  });

  const items = useMemo(
    () => (data || []).map((q) => ({ q, kind: classify(q) })),
    [data],
  );
  const visible = items.filter((x) => filter === "all" || x.kind === filter);
  const selected = items.find((x) => x.q.id === selectedId) || null;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const x of items) c[x.kind] = (c[x.kind] || 0) + 1;
    return c;
  }, [items]);

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await replyRamiInquiryFn({ data: { noteId: selected.q.id, text: reply } });
      void playDispatchChime(0.8);
      toast.success(`מענה לת.מ. ${selected.q.id} הועבר לאישור הראל 👑`);
      setReply("");
      await qc.invalidateQueries({ queryKey: ["rami-inquiries"] });
    } catch (err) {
      toast.error("שליחת המענה נדחתה ע״י השרת", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="בירור תעודות" subtitle="טאב בירור_ראמי · סנכרון חי" />
        <div className="p-12 text-center text-sm text-muted-foreground" dir="rtl">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
          טוען בירורים מהגיליון...
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="בירור תעודות" subtitle="טאב בירור_ראמי · סנכרון חי" />
        <div className="mx-auto max-w-xl p-6" dir="rtl">
          <Card className="space-y-3 border-red-500/40 bg-red-500/5 p-6 text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-red-700">
              <AlertTriangle className="h-5 w-5" /> כשל בטעינת הבירורים
            </div>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "שגיאת שרת"}
            </p>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`ml-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              נסה שוב
            </Button>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="בירור תעודות (ראמי)"
        subtitle={`${items.length} תעודות ממתינות לטיפול · טאב בירור_ראמי`}
        action={
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-primary ${isFetching ? "animate-spin" : ""}`} />
            <span>{isFetching ? "מסנכרן..." : "רענן"}</span>
          </button>
        }
      />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 md:px-8" dir="rtl">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label} ({counts[f.key] || 0})
            </button>
          ))}
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
          {/* רשימה */}
          <div className="space-y-2">
            {visible.length === 0 && (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                אין בירורים בסינון הזה ☕
              </div>
            )}
            {visible.map(({ q, kind }) => (
              <button
                key={q.id}
                onClick={() => {
                  setSelectedId(q.id);
                  setReply("");
                }}
                className={`w-full rounded-2xl border bg-card p-3.5 text-right shadow-card transition hover:border-primary/40 ${
                  selectedId === q.id ? "border-primary ring-1 ring-primary/30" : "border-border/70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold">ת.מ. #{q.id}</span>
                  <Badge kind={kind} />
                </div>
                <div className="mt-1 font-display text-sm font-bold">{q.customer}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{q.issue}</div>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{q.date}</span>
                  <span>·</span>
                  <span>{q.status}</span>
                </div>
              </button>
            ))}
          </div>

          {/* מסך טיפול: Split View */}
          {!selected ? (
            <div className="flex h-96 items-center justify-center rounded-3xl border border-dashed text-sm text-muted-foreground">
              בחר תעודה מהרשימה כדי לטפל בה
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {/* מימין: סריקה */}
              <Card className="space-y-3 rounded-3xl p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-bold">
                    <FileWarning className="h-4 w-4 text-primary" />
                    סריקה מקורית
                  </span>
                  {selected.q.driveUrl && (
                    <a
                      href={selected.q.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-bold text-primary hover:underline"
                    >
                      פתח ב-Drive <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <ScanPane fileId={selected.q.fileId} />
              </Card>

              {/* משמאל: ניתוח + מענה + היסטוריה */}
              <div className="space-y-4">
                <Card className="space-y-2 rounded-3xl p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold">{selected.q.customer}</h2>
                    <Badge kind={selected.kind} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selected.q.address} · נהג: {selected.q.driver || "לא זוהה"}
                  </p>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                    <div className="mb-1 font-bold text-amber-900">החריגה שזוהתה</div>
                    {selected.q.issue}
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                    <div className="mb-1 flex items-center gap-1 font-bold text-emerald-800">
                      <Sparkles className="h-3.5 w-3.5" /> ניתוח נועה AI
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {selected.q.aiAnalysis || "אין ניתוח זמין"}
                    </div>
                  </div>
                </Card>

                {selected.q.rounds.length > 0 && (
                  <Card className="space-y-3 rounded-3xl p-4">
                    <div className="flex items-center gap-1.5 text-sm font-bold">
                      <RotateCcw className="h-4 w-4 text-primary" /> היסטוריית בירור
                    </div>
                    {selected.q.rounds.map((r) => (
                      <div key={r.round} className="space-y-1.5 border-t pt-2 text-xs">
                        <div className="font-bold text-muted-foreground">סבב {r.round}</div>
                        {r.rami && (
                          <div className="rounded-xl bg-primary/10 p-2.5">
                            <b>ראמי</b> · {r.rami.at}
                            <div className="mt-0.5">{r.rami.text}</div>
                          </div>
                        )}
                        {r.harel && (
                          <div className="rounded-xl bg-ceo/10 p-2.5">
                            <b>הראל 👑</b> · {r.harel.at}
                            <div className="mt-0.5">{r.harel.text}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </Card>
                )}

                <Card className="space-y-2 rounded-3xl p-4">
                  <label className="text-sm font-bold">המענה שלך להראל</label>
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={4}
                    placeholder="הסבר מה קרה בפועל: החזרה, החלפה, זמן מנוף, תעודה פגומה..."
                    className="text-xs"
                  />
                  <Button
                    onClick={send}
                    disabled={sending || reply.trim().length < 3}
                    className="w-full gap-2 font-bold"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span>שלח מענה להראל מנכ״ל 👑</span>
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}