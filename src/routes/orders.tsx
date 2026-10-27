import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { ORDERS, DRIVERS, type Order } from "@/lib/data";
import { fetchLiveOrdersFromSheet } from "@/lib/google-orders";
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
  Package,
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

function LiveOrdersPage() {
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("הכל");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: orders = (import.meta.env.VITE_NOA_ORDERS_API_URL ? [] : ORDERS),
    isFetching,
    refetch,
  } = useQuery<Order[]>({
    queryKey: ["live-orders"],
    queryFn: fetchLiveOrdersFromSheet,
    initialData: import.meta.env.VITE_NOA_ORDERS_API_URL ? undefined : ORDERS,
    staleTime: 30000,
  });

  const handleRefresh = async () => {
    try {
      const res = await refetch();
      if (res.isSuccess) toast.success("הנתונים נטענו מחדש");
      else toast.error("לא ניתן לסנכרן כרגע. בדוק את חיבור הגיליון.");
    } catch {
      toast.error("שגיאה בסנכרון הגיליון");
    }
  };

  const filtered = orders.filter((o) => {
    const query = q.trim().toLowerCase();
    const matchQuery =
      !query ||
      o.customer.toLowerCase().includes(query) ||
      o.id.includes(query) ||
      o.address.toLowerCase().includes(query) ||
      o.yard.toLowerCase().includes(query);

    const matchStatus = filterStatus === "הכל" || o.status === filterStatus;
    return matchQuery && matchStatus;
  });

  const getDriver = (driverId: string | null) => {
    if (!driverId) return null;
    return DRIVERS.find((d) => d.id === driverId);
  };

  const calcOrderWeightTons = (o: Order) => {
    const totalKg = o.items.reduce((sum, item) => sum + (item.weightKg || 0) * item.qty, 0);
    return (totalKg / 1000).toFixed(2);
  };

  return (
    <>
      <PageHeader
        title="לוח הזמנות וסידור עבודה"
        subtitle="סנכרון מלא מול טאב הזמנות בגיליון, ניהול מניפסט פריטים ושיבוצי נהגים"
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

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-8">
        <div className={`rounded-xl border px-3 py-2 text-xs ${import.meta.env.VITE_NOA_ORDERS_API_URL ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800" : "border-amber-500/30 bg-amber-500/10 text-amber-900"}`} role="status">
          {import.meta.env.VITE_NOA_ORDERS_API_URL ? "מקור נתונים: חיבור Google Sheets מוגדר · רענון ידני זמין" : "מצב הדגמה: לא הוגדר VITE_NOA_ORDERS_API_URL ולכן מוצגות הזמנות לדוגמה בלבד"}
        </div>
        {/* Search & Status Filters */}
        <div className="rounded-3xl bg-card p-4 shadow-card border border-border/60 space-y-3">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="חיפוש לפי לקוח, מספר הזמנה, כתובת אספקה או מחסן מוצא..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-2xl bg-muted/40 py-3 pr-11 pl-4 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 border border-transparent focus:border-primary/20"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {["הכל", "בהעמסה", "בדרך", "פתוחה", "סופק"].map((st) => (
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

        {orders.length === 0 && !isFetching && <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">לא התקבלו הזמנות מהשרת. בדוק את חיבור Google Apps Script ואת הרשאות הגיליון.</div>}

        {/* Orders Accordion List */}
        <div className="space-y-3">
          {filtered.map((o) => {
            const isExpanded = expandedId === o.id;
            const driver = getDriver(o.driverId);
            const weightTons = calcOrderWeightTons(o);

            return (
              <div
                key={o.id}
                className="overflow-hidden rounded-3xl bg-card shadow-card border border-border/60 transition"
              >
                {/* Accordion Header Row */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  className="flex w-full cursor-pointer flex-col gap-3 p-5 text-right transition hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary">
                        הזמנה #{o.id}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {o.date.split("-").reverse().join("/")}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          o.status === "בהעמסה"
                            ? "bg-amber-500/15 text-amber-800 border border-amber-500/30"
                            : o.status === "בדרך"
                              ? "bg-blue-500/15 text-blue-800 border border-blue-500/30"
                              : o.status === "סופק"
                                ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                                : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {o.status}
                      </span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {o.window}
                      </span>
                    </div>

                    <h3 className="font-display text-lg font-bold text-foreground">{o.customer}</h3>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{o.address}</span>
                      <span>·</span>
                      <span>{o.yard}</span>
                    </div>
                  </div>

                  {/* Summary & Chevron */}
                  <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-2 sm:border-0 sm:pt-0">
                    <div className="text-right">
                      <span className="text-xs font-bold text-foreground block">
                        {weightTons} טון
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {driver ? `נהג: ${driver.name}` : "ללא שיבוץ"}
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
                </button>

                {/* Accordion Body: Manifest of Items & Action Buttons */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-muted/20 p-5 space-y-4 animate-in fade-in duration-200">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-muted-foreground mb-2">
                        <span className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-primary" />
                          מניפסט פריטי הזמנה ({o.items.length} שורות):
                        </span>
                        <span>משקל כולל: {weightTons} טון</span>
                      </div>

                      <div className="space-y-2">
                        {o.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-2xl bg-card p-3 text-xs border border-border/50 shadow-2xs"
                          >
                            <div className="space-y-0.5">
                              <span className="font-bold text-foreground">{it.name}</span>
                              {it.deposit ? (
                                <span className="block text-[10px] text-amber-700 font-semibold">
                                  מעקב פקדון 1:1
                                </span>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-sm">
                                {it.qty} {it.unit}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {((it.weightKg * it.qty) / 1000).toFixed(2)} טון
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Vehicle Assignment & Deep Links */}
                    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 border border-border/60 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
                          <Truck className="h-5 w-5" />
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground block">רכב ונהג משובץ:</span>
                          <span className="font-bold text-foreground">
                            {driver
                              ? `${driver.name} · ${driver.truck} (${driver.plate})`
                              : o.driverName || "ממתין לשיבוץ סדרן ראמי"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {o.phone && (
                          <a
                            href={`tel:${o.phone}`}
                            className="flex items-center gap-1.5 rounded-xl bg-muted px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted/80 transition"
                          >
                            <Phone className="h-3.5 w-3.5 text-primary" />
                            <span>חיוג לאתר</span>
                          </a>
                        )}

                        <a
                          href={`https://waze.com/ul?q=${encodeURIComponent(o.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-500/25 transition"
                        >
                          <Navigation className="h-3.5 w-3.5 text-blue-600" />
                          <span>Waze ישיר</span>
                        </a>
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
