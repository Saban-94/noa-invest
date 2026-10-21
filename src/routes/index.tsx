import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  NOTES,
  auditNote,
  noteWeightTons,
  driverOf,
  fetchNotes,
  type DeliveryNote,
} from "@/lib/data";
import { approvals, useApprovals } from "@/lib/store";
import { playUrgentSignatureAlarm } from "@/lib/audio-alerts";
import { PageHeader, StatusPill } from "@/components/AppShell";
import { Crown, ChevronLeft, RefreshCw, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "אישורי מנכ״ל — נועה ח. סבן" },
      {
        name: "description",
        content: "כרטיסי אישור מהירים להראל אידלסון: תעודות שנבדקו ע״י ראמי ונועה AI.",
      },
      { property: "og:title", content: "אישורי מנכ״ל — נועה ח. סבן" },
      { property: "og:description", content: "אישור תעודות משלוח לחיוב בלחיצה אחת." },
    ],
  }),
  component: Index,
});

function Index() {
  const ap = useApprovals();

  const {
    data: notes = NOTES,
    isFetching,
    refetch,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["delivery-notes"],
    queryFn: fetchNotes,
    initialData: NOTES,
    staleTime: 30000,
  });

  const ready = notes.filter((n) => ap[n.id]?.rami && !ap[n.id]?.harel);
  const pendingRami = notes.filter((n) => !ap[n.id]?.rami);
  const done = notes.filter((n) => ap[n.id]?.harel);
  const sumTons = ready.reduce((s, n) => s + noteWeightTons(n), 0);

  const handleApproveAll = () => {
    ready.forEach((n) => approvals.harel(n.id));
    playUrgentSignatureAlarm();
    toast.success(
      `${ready.length} תעודות אושרו לחיוב 👑 הודעות סגירת מעגל שוגרו ללינה ולוורד אידלסון!`,
    );
  };

  const handleApproveSingle = (noteId: string) => {
    approvals.harel(noteId);
    playUrgentSignatureAlarm();
    toast.success(`ת.מ. ${noteId} אושרה סופית לחיוב 👑 נשלחה הודעה ללינה`);
  };

  return (
    <>
      <PageHeader
        title="בוקר טוב, הראל"
        subtitle="רק מה שראמי ונועה כבר בדקו · סנכרון חי מול Apps Script"
        action={
          <button
            onClick={() => {
              void refetch();
              toast.info("מתבצע רענון תעודות מול Google Sheets...");
            }}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition active:scale-95 disabled:opacity-50"
            title="רענן מול Google Apps Script"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-primary ${isFetching ? "animate-spin" : ""}`} />
            <span>{isFetching ? "מסנכרן..." : "רענן ענן"}</span>
          </button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8">
        {/* CEO Pending Stamp Hero Banner */}
        <section className="bg-ceo-gradient rounded-3xl p-6 text-ceo-foreground shadow-lift">
          <div className="flex items-center gap-2 text-sm opacity-80">
            <Crown className="h-4 w-4" /> ממתין לחתימתך
          </div>
          <div className="mt-2 font-display text-5xl font-extrabold">{ready.length}</div>
          <div className="mt-1 text-lg">
            תעודות · <b>{sumTons.toFixed(1)} טון</b> לאישור
          </div>
          {ready.length > 1 && (
            <button
              onClick={handleApproveAll}
              className="mt-5 w-full rounded-2xl bg-card py-4 font-display text-lg font-bold text-ceo shadow-md hover:bg-card/95 transition active:scale-98"
            >
              אשר הכל בלחיצה אחת 👑
            </button>
          )}
        </section>

        {ready.length === 0 && (
          <div className="rounded-3xl bg-card p-8 text-center shadow-card border border-border/60">
            <div className="text-4xl">☕</div>
            <p className="mt-2 font-display text-lg font-bold">אין מה לאשר כרגע</p>
            <p className="text-sm text-muted-foreground">
              {pendingRami.length} תעודות עדיין בבדיקת ראמי וסדרני החצר
            </p>
          </div>
        )}

        {/* Ready Delivery Notes Cards for Harel */}
        {ready.map((n) => {
          const a = auditNote(n);
          return (
            <article
              key={n.id}
              className="overflow-hidden rounded-3xl bg-card shadow-card border border-border/70"
            >
              <Link to="/notes/$id" params={{ id: n.id }} className="block p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    ת.מ. #{n.id} · {n.driver || driverOf(n.driverId)?.name || "חכמת מנוף"} · קומקס #
                    {n.comaxOrder}
                  </span>
                  <StatusPill s={a.status} />
                </div>
                <h2 className="mt-2 text-xl font-bold">{n.customer}</h2>
                <p className="mt-1 text-[15px] font-medium leading-relaxed">
                  {a.status === "ok"
                    ? "הכל תואם — קומקס, פקדונות 1:1 ואיתוראן 🟢"
                    : a.findings.find((f) => f.status !== "ok")?.text}
                </p>
                <div className="mt-3 flex items-end justify-between">
                  <div className="text-left">
                    <span className="font-display text-2xl font-extrabold text-foreground">
                      {noteWeightTons(n).toFixed(1)} טון
                    </span>
                    <span className="block text-xs text-muted-foreground font-medium">
                      ({(n.items || []).length} פריטים)
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-primary">
                    לתעודה ומסמכים <ChevronLeft className="h-4 w-4" />
                  </span>
                </div>
              </Link>
              <button
                onClick={() => handleApproveSingle(n.id)}
                className="w-full border-t border-ceo/30 bg-ceo py-4 font-display text-lg font-bold text-ceo-foreground shadow-sm hover:opacity-95 transition active:scale-98"
              >
                אושר סופית לחיוב 👑 הראל אידלסון
              </button>
            </article>
          );
        })}

        {/* Approved Today Feed */}
        {done.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-bold text-muted-foreground flex items-center justify-between">
              <span>אושרו היום ע״י מנכ״ל ({done.length})</span>
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> שוגר להנה״ח
              </span>
            </h3>
            <div className="space-y-2">
              {done.map((n) => (
                <Link
                  key={n.id}
                  to="/notes/$id"
                  params={{ id: n.id }}
                  className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-card border border-border/50 hover:border-primary/40 transition"
                >
                  <span className="font-semibold text-sm">
                    {n.customer} · ת.מ. #{n.id}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-500/10 rounded-full px-2.5 py-0.5">
                    {ap[n.id]?.closed ? "✅ נסגר" : "👑 אושר לחיוב"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
