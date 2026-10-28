import { useMemo } from "react";
import { Activity, CheckCircle2, Clock3, Package, Truck } from "lucide-react";

export type OrdersMetricKey = "הכל" | "פתוחה" | "בהעמסה" | "בדרך" | "סופק";

type MetricOrder = { status: string; weightKg: number };

type Props = {
  orders: MetricOrder[];
  loading?: boolean;
  isFetching?: boolean;
  activeMetric: OrdersMetricKey;
  onSelect: (metric: OrdersMetricKey) => void;
};

const METRICS: { key: OrdersMetricKey; icon: typeof Package; color: string }[] = [
  { key: "הכל", icon: Package, color: "text-primary" },
  { key: "פתוחה", icon: Clock3, color: "text-emerald-600" },
  { key: "בהעמסה", icon: Activity, color: "text-amber-600" },
  { key: "בדרך", icon: Truck, color: "text-sky-600" },
  { key: "סופק", icon: CheckCircle2, color: "text-emerald-600" },
];

export function OrdersMetricsRow({ orders, loading = false, isFetching = false, activeMetric, onSelect }: Props) {
  const stats = useMemo(() => {
    const totalWeightKg = orders.reduce((sum, order) => sum + (Number(order.weightKg) || 0), 0);
    return {
      "הכל": { count: orders.length, weightKg: totalWeightKg },
      "פתוחה": { count: orders.filter((o) => o.status === "פתוחה").length, weightKg: orders.filter((o) => o.status === "פתוחה").reduce((s, o) => s + (Number(o.weightKg) || 0), 0) },
      "בהעמסה": { count: orders.filter((o) => o.status === "בהעמסה").length, weightKg: orders.filter((o) => o.status === "בהעמסה").reduce((s, o) => s + (Number(o.weightKg) || 0), 0) },
      "בדרך": { count: orders.filter((o) => o.status === "בדרך").length, weightKg: orders.filter((o) => o.status === "בדרך").reduce((s, o) => s + (Number(o.weightKg) || 0), 0) },
      "סופק": { count: orders.filter((o) => o.status === "סופק").length, weightKg: orders.filter((o) => o.status === "סופק").reduce((s, o) => s + (Number(o.weightKg) || 0), 0) },
    } satisfies Record<OrdersMetricKey, { count: number; weightKg: number }>;
  }, [orders]);

  const maxCount = Math.max(1, ...Object.values(stats).map((item) => item.count));

  return (
    <section aria-label="מדדי הזמנות" aria-busy={loading || isFetching} className="rounded-3xl border border-border/60 bg-card p-3 shadow-card sm:p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-sm font-extrabold text-foreground">תמונת מצב</p>
          <p className="text-[11px] text-muted-foreground">סיכום חי של ההזמנות והמשקל</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 transition-opacity ${isFetching ? "opacity-100" : "opacity-70"}`}>
          <span className={`h-1.5 w-1.5 rounded-full bg-emerald-500 ${isFetching ? "animate-pulse" : ""}`} />
          {isFetching ? "מסנכרן" : "מעודכן"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {METRICS.map(({ key, icon: Icon, color }) => {
          const active = activeMetric === key;
          const item = stats[key];
          return (
            <button key={key} type="button" onClick={() => onSelect(key)} aria-pressed={active}
              className={`group relative min-h-24 overflow-hidden rounded-2xl border p-3 text-right transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[.98] motion-reduce:transition-none ${active ? "border-primary/30 bg-primary/[.06] shadow-sm" : "border-border/60 bg-background hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-muted-foreground">{key === "הכל" ? "כל ההזמנות" : key}</span>
                <Icon className={`h-4 w-4 ${color} transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none`} aria-hidden="true" />
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span className="text-2xl font-black leading-none tabular-nums text-foreground transition-all duration-300">{loading ? "—" : item.count}</span>
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{(item.weightKg / 1000).toLocaleString("he-IL", { maximumFractionDigits: 1 })} טון</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${active ? "bg-primary" : "bg-primary/50"}`} style={{ width: `${loading ? 0 : (item.count / maxCount) * 100}%` }} />
              </div>
              {active && <CheckCircle2 className="absolute left-2 top-2 h-3.5 w-3.5 text-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
