import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listOrdersFn, type SheetOrder } from "@/lib/orders-api.functions";
import {
  Truck,
  Search,
  RefreshCw,
  Phone,
  Navigation,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "הזמנות חיות — נועה ח. סבן" },
      {
        name: "description",
        content: "לוח הזמנות חיות מגיליון נועה, מניפסט פריטים נפתח, שיוך נהגים וניווט Waze ישיר.",
      },
      { property: "og:title", content: "הזמנות חיות — ח. סבן" },
      { property: "og:description", content: "ניהול סידור עבודה והזמנות לוגיסטיקה." },
    ],
  }),
  component: LiveOrdersPage,
});

type StatusKey = "פתוחה" | "בהעמסה" | "בדרך";

function normStatus(raw: string): StatusKey {
  if (raw.includes("בהעמסה") || raw.includes("העמסה")) return "בהעמסה";
  if (raw.includes("בדרך") || raw.includes("יצא")) return "בדרך";
  return "פתוחה";
}

const fmtDate = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

function orderWeightTons(o: SheetOrder): number {
  return o.items.reduce((s, i) => s + (i.weightKg || 0) * (i.qty || 0), 0) / 1000;
}

function LiveOrdersPage() {
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("הכל");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["live-orders"],
    queryFn: () => listOrdersFn(),
    staleTime: 30_000,
    retry: 1,
  });

  const orders = useMemo(() => data?.orders ?? [], [data]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return orders.filter((o) => {
      const matchQuery =
        !query ||
        [o.customer, o.id, o.address, o.yard, o.driver]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchStatus = filterStatus === "הכל" || normStatus(o.status) === filterStatus;
      return matchQuery && matchStatus;
    });
  }, [orders, q, filterStatus]);

  const handleRefresh = async () => {
    const res = await refetch();
    if (res.isSuccess) toast.success("לוח ההזמנות סונכרן מהגיליון 🚚");
  };

  const header = (
    <PageHeader
      title="לוח הזמנות חיות"
      subtitle={
        data?.tab
          ? `מקור: טאב "${data.tab}" · ${orders.length} הזמנות`
          : "סנכרון חי מול גיליון ההזמנות"
      }
      action={
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition active:scale-95 disabled:opacity-50"
          title="סנכרן הזמנות מול Google Sheets"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-primary ${isFetching ? "animate-spin" : ""}`} />
          <span>{isFetching ? "מסנכרן..." : "סנכרון גיליון"}</span>
        </button>
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-4xl p-12 text-center text-sm text-muted-foreground" dir="rtl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
          טוען הזמנות מהגיליון...
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-xl p-6" dir="rtl">
          <Card className="p-6 space-y-3 border-red-500/40 bg-red-500/5 text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-red-700">
              <AlertTriangle className="h-5 w-5" /> כשל בטעינת הזמנות מהגיליון
            </div>
            <p className="text-xs text-muted-foreground break-words">
              {error instanceof Error ? error.message : "שגיאת שרת"}. לא מוצגים נתוני דוגמה.
            </p>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ml-1 ${isFetching ? "animate-spin" : ""}`} />
              נסה שוב
            </Button>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-8" dir="rtl">
        <div className="rounded-3xl bg-card p-4 shadow-card border border-border/60 space-y-3">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="חיפוש לפי לקוח, מספר הזמנה, כתובת, מחסן או נהג..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-2xl bg-muted/40 py-3 pr-11 pl-4 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 border border-transparent focus:border-primary/20"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {["הכל", "בהעמסה", "בדרך", "פתוחה"].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    filterStatus === st
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="text-[11px] font-semibold text-muted-foreground">
              {filtered.length} הזמנות מוצגות
            </div>
          </div>
        </div>

        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            הטאב "{data?.tab}" ריק או שאין בו שורות עם מספר הזמנה.
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((o) => {
            const isExpanded = expandedId === o.id;
            const status = normStatus(o.status);
            const tons = orderWeightTons(o);
            const unmatched = o.items.filter((i) => !i.matched).length;

            return (
              <div
                key={o.id}
                className="overflow-hidden rounded-3xl bg-card shadow-card border border-border/60 transition"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  className="flex cursor-pointer flex-col gap-3 p-5 transition hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        הזמנה #{o.id}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {fmtDate(o.date)}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          status === "בהעמסה"
                            ? "bg-amber-500/15 text-amber-800 border border-amber-500/30"
                            : status === "בדרך"
                              ? "bg-blue-500/15 text-blue-800 border border-blue-500/30"
                              : "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                        }`}
                      >
                        {o.status || status}
                      </span>
                      {o.window && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {o.window}
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-lg font-bold text-foreground">
                      {o.customer || "לא צוין לקוח"}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{o.address || "ללא כתובת"}</span>
                      {o.yard && (
                        <>
                          <span>·</span>
                          <span>{o.yard}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-2 sm:border-0 sm:pt-0">
                    <div className="text-right">
                      <span className="text-xs font-bold text-foreground block">
                        {tons > 0 ? `${tons.toFixed(2)} טון` : "משקל לא ידוע"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {o.driver ? `נהג: ${o.driver}` : "ללא שיבוץ"}
                      </span>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border/60 bg-muted/20 p-5 space-y-4 animate-in fade-in duration-200">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground mb-2">
                        <span>פריטי ההזמנה ({o.items.length} שורות):</span>
                        <span>
                          {tons > 0 ? `משקל מוערך: ${tons.toFixed(2)} טון` : ""}
                          {unmatched > 0 ? ` · ${unmatched} פריטים לא זוהו בקטלוג` : ""}
                        </span>
                      </div>

                      {o.items.length === 0 ? (
                        <div className="rounded-2xl bg-card p-3 text-xs border border-border/50 text-muted-foreground">
                          {o.itemsText || "אין פירוט פריטים בגיליון"}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {o.items.map((it, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-2xl bg-card p-3 text-xs border border-border/50 shadow-2xs"
                            >
                              <div className="space-y-0.5">
                                <span className="font-bold text-foreground">{it.name}</span>
                                {it.sku && (
                                  <span className="block text-[10px] font-mono text-muted-foreground">
                                    מק״ט {it.sku}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-sm">
                                  {it.qty} {it.unit}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {it.matched && it.weightKg > 0
                                    ? `${((it.weightKg * it.qty) / 1000).toFixed(2)} טון`
                                    : "משקל לא ידוע"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 border border-border/60 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
                          <Truck className="h-5 w-5" />
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">נהג משובץ:</span>
                          <span className="font-bold text-foreground">
                            {o.driver || "ממתין לשיבוץ סדרן ראמי"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {o.phone && (
                          <a
                            href={`tel:${o.phone.replace(/[^\d+]/g, "")}`}
                            className="flex items-center gap-1.5 rounded-xl bg-muted px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted/80 transition"
                          >
                            <Phone className="h-3.5 w-3.5 text-primary" />
                            <span>חיוג לאתר</span>
                          </a>
                        )}
                        {o.address && (
                          <a
                            href={`https://waze.com/ul?q=${encodeURIComponent(o.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-500/25 transition"
                          >
                            <Navigation className="h-3.5 w-3.5 text-blue-600" />
                            <span>Waze ישיר</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
