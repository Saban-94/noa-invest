import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { NOTES, auditNote, ils, noteTotal } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import { approvals, useApprovals } from "@/lib/store";
import { playUrgentSignatureAlarm, playDispatchChime } from "@/lib/audio-alerts";
import { PageHeader, StatusPill } from "@/components/AppShell";
import { CheckCircle2, ShieldCheck, Crown, Layers, Sparkles, Send } from "lucide-react";

export const Route = createFileRoute("/notes/$id")({
  loader: async ({ params }) => {
    try {
      const live = await fetchLiveNotes();
      const n = live.find((x) => x.id === params.id);
      if (n) return n;
    } catch {
      // fallback
    }
    const n = NOTES.find((x) => x.id === params.id);
    if (!n) throw notFound();
    return n;
  },
  head: ({ params }) => ({
    meta: [
      { title: `תעודה ${params.id} — נועה ח. סבן` },
      { name: "description", content: "תצוגת תעודת משלוח עם שכבות בקרה וחותמות." },
      { property: "og:title", content: `תעודה ${params.id}` },
      { property: "og:description", content: "בקרת נועה AI, חותמת ראמי וחותמת מנכ״ל." },
    ],
  }),
  component: Viewer,
});

function Viewer() {
  const n = Route.useLoaderData();
  const ap = useApprovals()[n.id];
  const a = auditNote(n);

  const [customNote, setCustomNote] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);

  const handleRamiApproval = () => {
    approvals.rami(n.id, customNote.trim() || undefined);
    void playDispatchChime(0.85);
    toast.success(`ת.מ. ${n.id} נבדקה ואושרה אישית ע״י ראמי מסארווה ✍️`);
  };

  const handleHarelApproval = () => {
    approvals.harel(n.id, customNote.trim() || undefined);
    playUrgentSignatureAlarm();
    setShowCelebration(true);
    toast.success(`ת.מ. ${n.id} אושרה סופית לחיוב ע״י מנכ״ל 👑`);
  };

  return (
    <>
      <PageHeader
        title={`ת.מ. ${n.id}`}
        subtitle={`${n.customer} · הזמנת קומקס #${n.comaxOrder}`}
        action={<StatusPill s={a.status} />}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
        {/* Green Celebration Banner after Harel Approval */}
        {(ap?.harel || showCelebration) && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white shadow-lift animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-xs">
                <Crown className="h-7 w-7 text-amber-300" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-extrabold flex items-center gap-2">
                  <span>אושר סופית לחיוב ע״י הראל אידלסון (מנכ״ל) 👑</span>
                  <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                    סגירת מעגל 100%
                  </span>
                </h3>
                <p className="text-xs leading-relaxed text-emerald-100">
                  נשלחה הודעת אימות אוטומטית ללינה בהנהלת חשבונות (
                  <strong>lina@saban94.co.il</strong>) להפקת חשבונית מס, ועודכן יומן הפיקוח של ורד
                  אידלסון (<strong>050-6662300</strong>) ב-Google Drive.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          {/* Left Column: 4-Layer Adobe-Style Delivery Note Viewer */}
          <div className="space-y-4">
            {(n.scans ?? []).map((src, i) => (
              <div
                key={src}
                className="relative overflow-hidden rounded-3xl bg-card shadow-card border border-border/70"
              >
                {/* Layer 1: Original High-Res Scan Background */}
                <img
                  src={src}
                  alt={`סריקת תעודה ${n.id} - עמוד ${i + 1}`}
                  className="w-full object-contain select-none"
                  loading="eager"
                />

                {/* Layer 2: Noa AI Watermark Badge */}
                <div className="absolute top-4 left-4 rounded-xl bg-card/85 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-foreground border border-border/50 shadow-sm flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  <span>שכבת בקרת נועה AI · אומת 1:1</span>
                </div>

                {/* Layer 3: Rami Review Stamp */}
                {i === 0 && ap?.rami && (
                  <div className="stamp absolute bottom-16 left-6 bg-card/75 backdrop-blur-md text-sm text-rami border-rami/80 shadow-md">
                    ח. סבן — נבדק ואושר אישית ע״י ראמי מסארווה ✍️
                    <br />
                    <span className="text-xs font-mono opacity-90">{ap.rami.at}</span>
                  </div>
                )}

                {/* Layer 4: Harel CEO Final Burgundy Stamp */}
                {i === 0 && ap?.harel && (
                  <div className="stamp absolute bottom-40 right-6 bg-card/75 backdrop-blur-md text-sm text-ceo border-ceo/80 shadow-md">
                    ח. סבן (1994) בע״מ — אושר סופית לחיוב 👑
                    <br />
                    <span className="font-bold">הראל אידלסון (מנכ״ל)</span> ·{" "}
                    <span className="text-xs font-mono">{ap.harel.at}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right Column: Due Diligence & Approval Controls */}
          <aside className="space-y-4">
            {/* Due Diligence Summary */}
            <div className="rounded-3xl bg-card p-5 shadow-card border border-border/70 space-y-3">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-base font-bold">דוח בקרת נועה AI</h2>
                </div>
                <StatusPill s={a.status} />
              </div>

              <ul className="space-y-2 text-xs">
                {a.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl bg-muted/40 p-2.5">
                    <span className="shrink-0 text-sm">
                      {f.status === "ok" ? "🟢" : f.status === "warn" ? "⚠️" : "🔴"}
                    </span>
                    <span className="leading-relaxed font-medium text-foreground/90">{f.text}</span>
                  </li>
                ))}
              </ul>

              {/* 1:1 Deposits Summary */}
              <div className="grid grid-cols-2 gap-2 border-t pt-3 text-center text-xs">
                <div className="rounded-xl bg-amber-500/10 p-2 border border-amber-500/20">
                  <span className="text-[10px] text-amber-900 block font-semibold">
                    בלות (60002)
                  </span>
                  <span className="font-display text-base font-extrabold text-amber-800">
                    {n.deposits.bales60002.delivered} סופקו
                  </span>
                </div>

                <div className="rounded-xl bg-emerald-500/10 p-2 border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-900 block font-semibold">
                    משטחים (60060)
                  </span>
                  <span className="font-display text-base font-extrabold text-emerald-800">
                    {n.deposits.pallets60060.delivered} סופקו
                  </span>
                </div>
              </div>

              {/* Bottom line total */}
              <div className="border-t pt-3 flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground font-semibold">סה״כ לתעודה</span>
                <span className="font-display text-2xl font-extrabold text-foreground">
                  {ils(noteTotal(n))}
                </span>
              </div>
            </div>

            {/* Approvals Action Card */}
            <div className="rounded-3xl bg-card p-5 shadow-card border border-border/70 space-y-3">
              <h3 className="font-display text-sm font-bold text-foreground">
                אישור וחתימה דיגיטלית
              </h3>

              {/* Optional note input */}
              <input
                type="text"
                placeholder="הערה לחתימה (אופציונלי)..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="w-full rounded-2xl bg-muted/50 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 border"
              />

              {/* Rami Button */}
              {!ap?.rami && (
                <button
                  onClick={handleRamiApproval}
                  className="w-full rounded-2xl bg-rami py-3.5 font-display text-sm font-bold text-rami-foreground shadow-sm hover:opacity-95 transition active:scale-98"
                >
                  נבדק ואושר אישית ע״י ראמי ✍️
                </button>
              )}

              {/* Harel CEO Button */}
              {ap?.rami && !ap?.harel && (
                <button
                  onClick={handleHarelApproval}
                  className="w-full rounded-2xl bg-ceo py-3.5 font-display text-sm font-bold text-ceo-foreground shadow-lift hover:opacity-95 transition active:scale-98"
                >
                  אושר סופית לחיוב 👑 הראל אידלסון
                </button>
              )}

              {/* Reset button for testing / corrections */}
              {ap && (
                <button
                  onClick={() => {
                    approvals.reset(n.id);
                    setShowCelebration(false);
                    toast.info("חתימות התעודה אופסו");
                  }}
                  className="w-full rounded-2xl border border-border py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                >
                  איפוס חתימות
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
