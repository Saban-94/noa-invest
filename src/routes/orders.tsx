import { createFileRoute, Link } from "@tanstack/react-router";
import { listOrdersFn, updateOrderStatusFn } from "@/lib/orders.functions";
import { AdvanceStatusButton, CallButton, WazeButton } from "@/components/OrderActionButtons";
import { OrdersMetricsRow, type OrdersMetricKey } from "@/components/OrdersMetricsRow";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Layers,
  MapPin,
  Minus,
  PackageSearch,
  RefreshCw,
  Scale,
  Search,
  Timer,
  TrendingDown,
  TrendingUp,
  Truck,
  Warehouse,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/orders")({
  component: OrdersPage,
});

/* ────────────────────────────── Types ────────────────────────────── */

const STATUSES = ["פתוחה", "בהעמסה", "בדרך", "סופק"] as const;
type Status = (typeof STATUSES)[number];
type Filter = "הכל" | Status;
type Deposit = "pallet" | "crate" | null;

interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unit: string;
  unitWeightKg: number;
  deposit: Deposit;
}

interface Order {
  id: string;
  customerId: string;
  customerNo: string;
  receivedDate: string;
  deliveryDate: string;
  deliveryTime: string;
  driver: string;
  customer: string;
  address: string;
  phone: string;
  yard: string;
  status: Status;
  updatedAt: string;
  items: OrderItem[];
}

/* ───────────────────────── Status presentation ───────────────────────── */

interface StatusStyle {
  icon: LucideIcon;
  border: string;
  glow: string;
  badge: string;
  dot: string;
}

const STATUS_STYLE: Record<Status, StatusStyle> = {
  פתוחה: {
    icon: Timer,
    border: "border-amber-500",
    glow: "from-amber-500/10",
    badge:
      "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/40",
    dot: "bg-amber-500",
  },
  בהעמסה: {
    icon: Boxes,
    border: "border-orange-500",
    glow: "from-orange-500/10",
    badge:
      "bg-orange-50 text-orange-900 ring-orange-300 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-500/40",
    dot: "bg-orange-500",
  },
  בדרך: {
    icon: Truck,
    border: "border-blue-600",
    glow: "from-blue-600/10",
    badge:
      "bg-blue-50 text-blue-900 ring-blue-300 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/40",
    dot: "bg-blue-600",
  },
  סופק: {
    icon: CheckCircle2,
    border: "border-emerald-600",
    glow: "from-transparent",
    badge:
      "bg-emerald-50 text-emerald-900 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/40",
    dot: "bg-emerald-600",
  },
};

const nextStatus = (s: Status): Status | null => {
  const i = STATUSES.indexOf(s);
  return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
};

/* ───────────────────────── Google Sheets sync layer ─────────────────────────
 * All requests go through server functions. No local demo orders are used.
 */
const POLL_MS = 30_000;
const toNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
const toStatus = (v: unknown): Status => {
  const value = String(v ?? "").trim();
  return (STATUSES as readonly string[]).includes(value) ? (value as Status) : "פתוחה";
};
const toDeposit = (v: unknown): Deposit => {
  const value = String(v ?? "").trim().toLowerCase();
  if (["pallet", "משטח", "משטחים"].includes(value)) return "pallet";
  if (["crate", "ארגז", "ארגזים", "מכל"].includes(value)) return "crate";
  return null;
};
function normalizeOrder(raw: import("@/lib/orders.functions").SheetOrder): Order {
  const items: OrderItem[] = (Array.isArray(raw.items) ? raw.items : []).map((item, index) => ({
    sku: String(item.sku || `#${index + 1}`),
    name: String(item.catalogName || item.name || ""),
    qty: toNum(item.qty),
    unit: String(item.unit || "יח׳"),
    unitWeightKg: toNum(item.weightKg),
    deposit: toDeposit(item.name),
  }));
  let updatedAt = new Date().toISOString();
  if (raw.date) {
    const parsedDate = new Date(raw.date);
    if (!Number.isNaN(parsedDate.getTime())) updatedAt = parsedDate.toISOString();
  }
  return {
    id: String(raw.id), customerId: "", customerNo: String(raw.customerNo || ""),
    receivedDate: String(raw.receivedDate || ""), deliveryDate: String(raw.date || ""),
    deliveryTime: String(raw.window || ""), driver: String(raw.driver || ""),
    customer: String(raw.customer || "לקוח ללא שם"),
    address: String(raw.address || ""), phone: String(raw.phone || ""), yard: String(raw.yard || ""),
    status: toStatus(raw.status), updatedAt, items,
  };
}
type SyncState = "loading" | "live" | "error";
function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [sync, setSync] = useState<SyncState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const load = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    setRefreshing(true);
    try {
      const result = await listOrdersFn();
      if (signal?.aborted) return;
      const fresh = result.orders.map(normalizeOrder);
      setOrders((previous) => fresh.map((order) =>
        pendingRef.current.has(order.id) ? (previous.find((old) => old.id === order.id) ?? order) : order));
      setSync("live"); setError(null); setLastSync(new Date());
    } catch (cause) {
      if ((cause as Error).name === "AbortError" || signal?.aborted) return;
      setSync("error"); setError((cause as Error).message || "שגיאת סנכרון מול גיליון ההזמנות");
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(controller.signal);
    }, POLL_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);
  const setStatus = useCallback(async (id: string, status: Status) => {
    const previous = orders.find((order) => order.id === id)?.status;
    if (!previous || previous === status) return;
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status, updatedAt: new Date().toISOString() } : order));
    pendingRef.current.add(id); setBusyIds(new Set(pendingRef.current));
    try {
      await updateOrderStatusFn({ data: { id, status } }); setError(null);
    } catch (cause) {
      setOrders((current) => current.map((order) => order.id === id ? { ...order, status: previous } : order));
      setError(`לא ניתן היה לעדכן את ${id}: ${(cause as Error).message}`);
    } finally {
      pendingRef.current.delete(id); setBusyIds(new Set(pendingRef.current));
    }
  }, [orders]);
  return { orders, sync, error, lastSync, refreshing, busyIds, reload: () => load(), setStatus, dismissError: () => setError(null) };
}

/* ───────────────────────────── Helpers ───────────────────────────── */

const itemWeightKg = (it: OrderItem) => it.qty * it.unitWeightKg;
const orderWeightKg = (o: Order) => o.items.reduce((s, it) => s + itemWeightKg(it), 0);
const depositUnits = (o: Order) => o.items.reduce((s, it) => s + (it.deposit ? it.qty : 0), 0);

const fmt = (n: number, d = 0) =>
  n.toLocaleString("he-IL", { minimumFractionDigits: d, maximumFractionDigits: d });

const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.round((t - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return rtf.format(hrs, "hour");
  return rtf.format(Math.round(hrs / 24), "day");
}

/* ───────────────────────── Animated number + trend ───────────────────────── */

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = fmt(value, decimals);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = fmt(v, decimals);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, decimals, reduce]);

  return (
    <span ref={ref} className="tabular-nums">
      {fmt(value, decimals)}
    </span>
  );
}

function useSessionDelta(value: number, ready: boolean) {
  const base = useRef<number | null>(null);
  if (ready && base.current === null) base.current = value;
  return base.current === null ? 0 : value - base.current;
}

function Trend({ delta, decimals = 0, goodWhen }: { delta: number; decimals?: number; goodWhen: "up" | "down" | "neutral" }) {
  const rounded = Number(delta.toFixed(decimals));
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus;
  const tone =
    rounded === 0 || goodWhen === "neutral"
      ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      : (rounded > 0) === (goodWhen === "up")
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
        : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  return (
    <motion.span
      key={rounded}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
      title="שינוי מאז פתיחת המסך"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span dir="ltr" className="tabular-nums">
        {rounded > 0 ? "+" : ""}
        {fmt(rounded, decimals)}
      </span>
    </motion.span>
  );
}

/* ───────────────────────────── KPI bar ───────────────────────────── */

interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
  delta: number;
  goodWhen: "up" | "down" | "neutral";
  accent: string;
  loading: boolean;
}

function KpiCard({ icon: Icon, label, value, unit, decimals = 0, delta, goodWhen, accent, loading }: KpiProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl transition-shadow duration-300 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/60"
    >
      <div className={`pointer-events-none absolute -top-10 -end-10 h-28 w-28 rounded-full blur-2xl ${accent} opacity-20`} aria-hidden />
      <div className="relative flex items-start justify-between gap-2">
        <span className={`grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm ${accent}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {!loading && <Trend delta={delta} decimals={decimals} goodWhen={goodWhen} />}
      </div>
      <div className="relative mt-3">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
        {loading ? (
          <div className="mt-1 h-8 w-20 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
        ) : (
          <p className="mt-0.5 flex items-baseline gap-1.5 text-3xl font-bold text-slate-900 dark:text-white">
            <AnimatedNumber value={value} decimals={decimals} />
            {unit && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{unit}</span>}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ───────────────────────── Status control (dropdown) ───────────────────────── */

function StatusControl({
  status,
  busy,
  onChange,
}: {
  status: Status;
  busy: boolean;
  onChange: (s: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const st = STATUS_STYLE[status];
  const Icon = st.icon;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`סטטוס הזמנה: ${status}. לחץ לשינוי`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-all duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 active:scale-95 ${st.badge}`}
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
        {status}
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={reduce ? false : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute end-0 z-40 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {STATUSES.map((s) => {
              const SIcon = STATUS_STYLE[s].icon;
              const active = s === status;
              return (
                <button
                  key={s}
                  role="menuitemradio"
                  aria-checked={active}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) onChange(s);
                  }}
                  className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
                >
                  <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s].dot}`} aria-hidden />
                  <SIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden />
                  <span className="flex-1 text-start">{s}</span>
                  {active && <Check className="h-4 w-4 text-blue-600" aria-hidden />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────────── Manifest ───────────────────────────── */

function Manifest({ order }: { order: Order }) {
  const totalKg = orderWeightKg(order);
  const deposits = depositUnits(order);
  const palletUnits = order.items.reduce((s, it) => s + (it.deposit === "pallet" ? it.qty : 0), 0);
  const crateUnits = order.items.reduce((s, it) => s + (it.deposit === "crate" ? it.qty : 0), 0);

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <Layers className="h-4 w-4 text-blue-600" aria-hidden />
          מניפסט קומקס
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {order.items.length} שורות
          </span>
        </h4>
        {order.customerId && (
          <Link
            to="/customers/$id"
            params={{ id: order.customerId }}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-blue-700 transition-colors duration-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 active:scale-95 dark:text-blue-300 dark:hover:bg-blue-500/10"
          >
            תיק לקוח
            <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>

      {order.items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-300">אין שורות מניפסט להזמנה זו.</p>
      ) : (
        <>
          <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-4 px-4 pt-3 text-xs font-semibold text-slate-500 sm:grid dark:text-slate-400">
            <span>פריט</span>
            <span className="w-24 text-end">כמות</span>
            <span className="w-24 text-end">משקל</span>
            <span className="w-24 text-end">פיקדון</span>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {order.items.map((it, idx) => (
              <li
                key={`${it.sku}-${idx}`}
                className="grid grid-cols-2 items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{it.name || "פריט ללא שם"}</p>
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                    {it.sku}
                  </p>
                </div>
                <p className="text-sm text-slate-700 sm:w-24 sm:text-end dark:text-slate-200">
                  <span className="tabular-nums font-semibold">{fmt(it.qty, it.qty % 1 ? 1 : 0)}</span> {it.unit}
                </p>
                <p className="text-end text-sm tabular-nums text-slate-700 sm:w-24 dark:text-slate-200">
                  {fmt(itemWeightKg(it), 1)} ק״ג
                </p>
                <div className="col-span-2 flex sm:col-span-1 sm:w-24 sm:justify-end">
                  {it.deposit ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/40">
                      <Boxes className="h-3.5 w-3.5" aria-hidden />
                      {fmt(it.qty)} {it.deposit === "pallet" ? "משטחים" : "ארגזים"}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">ללא</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
            <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
              <Scale className="h-4 w-4 text-slate-500" aria-hidden />
              סה״כ <span className="tabular-nums">{fmt(totalKg / 1000, 2)}</span> טון
            </span>
            <span className="text-slate-700 dark:text-slate-200">
              פיקדון 1:1 · <span className="tabular-nums font-semibold">{fmt(deposits)}</span> יח׳
              {deposits > 0 && (
                <span className="text-slate-500 dark:text-slate-400">
                  {" "}
                  ({fmt(palletUnits)} משטחים, {fmt(crateUnits)} ארגזים)
                </span>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────── Order card ───────────────────────────── */

interface OrderCardProps {
  order: Order;
  expanded: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onStatus: (id: string, s: Status) => void;
}

const OrderCard = memo(function OrderCard({ order, expanded, busy, onToggle, onStatus }: OrderCardProps) {
  const reduce = useReducedMotion();
  const st = STATUS_STYLE[order.status];
  const next = nextStatus(order.status);
  const kg = orderWeightKg(order);
  const panelId = `manifest-${order.id}`;

  return (
    <motion.article
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={`group relative overflow-hidden rounded-2xl border border-slate-200 border-s-4 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:p-5 dark:border-slate-700 dark:bg-slate-900 ${st.border}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-l ${st.glow} to-transparent transition-opacity duration-300 ${order.status !== "סופק" ? "opacity-60 group-hover:opacity-100" : "opacity-0"}`} aria-hidden />

      <div className="relative">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {order.customerId ? (
                <Link
                  to="/customers/$id"
                  params={{ id: order.customerId }}
                  className="cursor-pointer truncate rounded-md text-lg font-bold text-slate-900 transition-colors duration-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-white dark:hover:text-blue-300"
                >
                  {order.customer}
                </Link>
              ) : (
                <h3 className="truncate text-lg font-bold text-slate-900 dark:text-white">{order.customer}</h3>
              )}
              <span
                dir="ltr"
                className="rounded-lg bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-white dark:bg-slate-100 dark:text-slate-900"
              >
                {order.id}
              </span>
            </div>
            <p className="mt-2 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span>{order.address || "כתובת לא הוזנה"}</span>
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Warehouse className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <span>{order.yard || "חצר לא צוינה"}</span>
            </p>
          </div>
          <StatusControl status={order.status} busy={busy} onChange={(s) => onStatus(order.id, s)} />
        </div>

        {/* Meta chips */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
            <Scale className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{fmt(kg / 1000, 2)}</span> טון
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
            <Boxes className="h-3.5 w-3.5" aria-hidden />
            {order.items.length} שורות
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            עודכן {relativeTime(order.updatedAt)}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <WazeButton address={order.address} className="flex-1 sm:flex-none" />
          <CallButton phone={order.phone} name={order.customer} />
          <AdvanceStatusButton
            nextLabel={next}
            loading={busy}
            onAdvance={() => next && onStatus(order.id, next)}
          />
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => onToggle(order.id)}
            className="ms-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 active:scale-95 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {expanded ? "הסתר מניפסט" : "הצג מניפסט"}
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>

        {/* Accordion */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={panelId}
              key="manifest"
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <Manifest order={order} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
});

/* ───────────────────────────── Page ───────────────────────────── */

function OrdersPage() {
  const { orders, sync, error, lastSync, refreshing, busyIds, reload, setStatus, dismissError } = useOrders();
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("הכל");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [isMac, setIsMac] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ready = sync !== "loading" && orders.length > 0;
  const loading = sync === "loading";

  const metrics = useMemo(() => {
    const active = orders.filter((o) => o.status !== "סופק");
    return {
      active: active.length,
      tons: active.reduce((s, o) => s + orderWeightKg(o), 0) / 1000,
      moving: orders.filter((o) => o.status === "בהעמסה" || o.status === "בדרך").length,
      pending: orders.filter((o) => o.status === "פתוחה").length,
    };
  }, [orders]);

  const orderMetricRows = useMemo(
    () => orders.map((order) => ({ status: order.status, weightKg: orderWeightKg(order) })),
    [orders],
  );

  const dActive = useSessionDelta(metrics.active, ready);
  const dTons = useSessionDelta(metrics.tons, ready);
  const dMoving = useSessionDelta(metrics.moving, ready);
  const dPending = useSessionDelta(metrics.pending, ready);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { הכל: orders.length, פתוחה: 0, בהעמסה: 0, בדרך: 0, סופק: 0 };
    for (const o of orders) c[o.status] += 1;
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "הכל" && o.status !== filter) return false;
      if (!q) return true;
      return (
        o.customer.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        o.yard.toLowerCase().includes(q) ||
        o.phone.includes(q)
      );
    });
  }, [orders, filter, query]);

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const syncLabel =
    sync === "live"
      ? "מסונכרן עם Google Sheets"
      : sync === "error"
        ? "הסנכרון נכשל"
        : "טוען נתונים…";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-slate-100 pb-16 text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100"
    >
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {/* Title row */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">ניהול הזמנות</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">לוח בקרה לסדרנים · ח. סבן חומרי בניין</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              role="status"
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-xs font-semibold ring-1 ring-inset ${
                sync === "live"
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/40"
                  : sync === "error"
                    ? "bg-rose-50 text-rose-800 ring-rose-300 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/40"
                    : "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"
              }`}
            >
              {sync === "error" ? <WifiOff className="h-4 w-4" aria-hidden /> : <span className={`h-2 w-2 rounded-full ${sync === "live" ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} aria-hidden />}
              {syncLabel}
              {lastSync && sync !== "loading" && (
                <span className="font-normal opacity-80" dir="ltr">
                  {lastSync.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={refreshing}
              aria-label="רענן נתונים"
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition-all duration-200 hover:bg-slate-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 active:scale-95 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </div>
        </header>

        {/* KPI grid */}
        <section aria-label="מדדים" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <KpiCard icon={PackageSearch} label="הזמנות פעילות" value={metrics.active} delta={dActive} goodWhen="neutral" accent="bg-blue-600" loading={loading} />
          <KpiCard icon={Scale} label="משקל כולל" value={metrics.tons} unit="טון" decimals={1} delta={dTons} goodWhen="neutral" accent="bg-slate-700" loading={loading} />
          <KpiCard icon={Truck} label="בדרך / בהעמסה" value={metrics.moving} delta={dMoving} goodWhen="up" accent="bg-orange-500" loading={loading} />
          <KpiCard icon={AlertTriangle} label="ממתינות לטיפול" value={metrics.pending} delta={dPending} goodWhen="down" accent="bg-amber-500" loading={loading} />
        </section>

        <OrdersMetricsRow
          orders={orderMetricRows}
          loading={loading}
          isFetching={refreshing}
          activeMetric={filter}
          onSelect={setFilter}
        />

        {/* Command center */}
        <section
          aria-label="חיפוש וסינון"
          className="sticky top-2 z-30 mt-5 rounded-2xl border border-white/60 bg-white/80 p-2.5 shadow-lg shadow-slate-900/5 backdrop-blur-xl sm:p-3 dark:border-white/10 dark:bg-slate-900/80"
        >
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">חיפוש הזמנות לפי לקוח, מספר הזמנה, כתובת או חצר</span>
              <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="חיפוש לקוח, מס׳ הזמנה, כתובת…"
                className="h-12 w-full rounded-full border border-slate-200 bg-white ps-12 pe-24 text-base text-slate-900 shadow-inner outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <span className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex" aria-hidden>
                <kbd className="rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {isMac ? "⌘ K" : "Ctrl K"}
                </kbd>
                <kbd className="rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  /
                </kbd>
              </span>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="נקה חיפוש"
                  className="absolute end-3 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:hidden dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </label>

            <div role="tablist" aria-label="סינון לפי סטטוס" className="-mx-1 flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 dark:bg-slate-800">
              {(["הכל", ...STATUSES] as Filter[]).map((f) => {
                const active = filter === f;
                return (
                  <button
                    key={f}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => setFilter(f)}
                    className={`relative min-h-11 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 active:scale-95 ${
                      active ? "text-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="status-pill"
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-slate-950"
                      />
                    )}
                    <span className="relative flex items-center gap-2">
                      {f !== "הכל" && <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[f].dot}`} aria-hidden />}
                      {f}
                      <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-xs tabular-nums dark:bg-slate-700">{counts[f]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p className="flex-1">{error}</p>
              <button
                type="button"
                onClick={() => void reload()}
                className="min-h-11 cursor-pointer rounded-full px-3 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
              >
                נסה שוב
              </button>
              <button
                type="button"
                onClick={dismissError}
                aria-label="סגור הודעה"
                className="grid h-11 w-11 cursor-pointer place-items-center rounded-full hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:hover:bg-rose-500/20"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List */}
        <main className="mt-5" aria-busy={loading}>
          <p className="sr-only" role="status" aria-atomic="true">
            מוצגות {visible.length} הזמנות מתוך {orders.length}
          </p>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="grid place-items-center rounded-3xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                <PackageSearch className="h-7 w-7 text-slate-500" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-bold">לא נמצאו הזמנות</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-300">
                {orders.length === 0 ? "הגיליון עדיין לא החזיר הזמנות." : "נסו לשנות את החיפוש או לבחור סטטוס אחר."}
              </p>
              {(query || filter !== "הכל") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("הכל");
                  }}
                  className="mt-5 min-h-11 cursor-pointer rounded-full bg-blue-600 px-5 text-sm font-semibold text-white transition-all duration-200 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-95"
                >
                  נקה סינון
                </button>
              )}
            </div>
          ) : (
            <motion.div layout={!reduce} className="grid items-start gap-4 lg:grid-cols-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {visible.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    expanded={expandedIds.has(o.id)}
                    busy={busyIds.has(o.id)}
                    onToggle={toggle}
                    onStatus={setStatus}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
