/**
 * /customers — רשימת לקוחות חיה, מצטברת מכל טאבי הגיליון (תעודות, הזמנות, ביקורים, בירורים)
 */
import * as React from "react";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { listCustomerIndexFn, type CustomerSummary } from "@/lib/customer-history.functions";
import { fmtShort, relativeFromIso } from "@/lib/he-date";
import {
  Users,
  Search,
  Phone,
  MessageSquare,
  Navigation,
  FolderOpen,
  ChevronLeft,
  Truck,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  Package,
  Timer,
  MapPin,
  MessageCircleWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "תיקי לקוחות — ח. סבן לוגיסטיקה" },
      { name: "description", content: "היסטוריית לקוחות מכל טאבי הגיליון · מספר לקוח כמפתח" },
    ],
  }),
  component: CustomersLayout,
});

function CustomersLayout() {
  const { pathname } = useLocation();
  const isList = pathname === "/customers" || pathname === "/customers/";
  return isList ? <CustomersList /> : <Outlet />;
}

type Sort = "recent" | "notes" | "name" | "site";
type Chip = "all" | "returning" | "inquiry" | "measured";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "אספקה אחרונה" },
  { key: "notes", label: "הכי הרבה תעודות" },
  { key: "site", label: "זמן פריקה ארוך" },
  { key: "name", label: "שם (א׳-ת׳)" },
];

const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "returning", label: "לקוחות חוזרים" },
  { key: "inquiry", label: "בירור פתוח" },
  { key: "measured", label: "עם מדידת פריקה" },
];

function CustomersList() {
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("recent");
  const [chip, setChip] = React.useState<Chip>("all");

  const q = useQuery({
    queryKey: ["customer-index"],
    queryFn: () => listCustomerIndexFn(),
    staleTime: 60_000,
  });

  const customers = q.data?.customers || [];

  const totals = React.useMemo(() => {
    const mins = customers.map((c) => c.avgSiteMin).filter((m): m is number => m != null);
    return {
      notes: customers.reduce((a, c) => a + c.notesCount, 0),
      orders: customers.reduce((a, c) => a + c.ordersCount, 0),
      inquiries: customers.reduce((a, c) => a + c.openInquiries, 0),
      avgSite: mins.length ? Math.round(mins.reduce((a, m) => a + m, 0) / mins.length) : null,
    };
  }, [customers]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = customers.filter((c) => {
      if (chip === "returning" && c.notesCount + c.ordersCount < 2) return false;
      if (chip === "inquiry" && c.openInquiries === 0) return false;
      if (chip === "measured" && c.avgSiteMin == null) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.customerNo.includes(term) ||
        c.address.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        c.contactName.toLowerCase().includes(term)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "notes") return b.notesCount - a.notesCount;
      if (sort === "site") return (b.avgSiteMin ?? -1) - (a.avgSiteMin ?? -1);
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      return b.lastIso.localeCompare(a.lastIso);
    });
    return list;
  }, [customers, search, sort, chip]);

  return (
    <>
      <PageHeader
        title="תיקי לקוחות"
        subtitle={q.data ? `${q.data.source} · ${customers.length} לקוחות` : "נטען מהגיליון"}
        action={
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted active:scale-95"
          >
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/15 via-card to-emerald-500/10 p-6 shadow-card">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <h1 className="font-display text-2xl font-extrabold md:text-3xl">היסטוריית לקוחות</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              כל תעודה, הזמנה, ביקור איתוראן ובירור — מקובצים לפי מספר לקוח
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Kpi icon={Users} label="לקוחות" value={q.isLoading ? "…" : String(customers.length)} tone="blue" />
              <Kpi icon={FileText} label="תעודות" value={q.isLoading ? "…" : String(totals.notes)} tone="amber" />
              <Kpi icon={Package} label="הזמנות" value={q.isLoading ? "…" : String(totals.orders)} tone="indigo" />
              <Kpi
                icon={Timer}
                label="ממוצע פריקה באתר"
                value={q.isLoading ? "…" : totals.avgSite != null ? `${totals.avgSite} דק׳` : "—"}
                tone="emerald"
              />
              <Kpi
                icon={MessageCircleWarning}
                label="בירורים פתוחים"
                value={q.isLoading ? "…" : String(totals.inquiries)}
                tone="rose"
              />
            </div>
          </div>
        </section>

        {/* חיפוש, מיון וסינון */}
        <div className="space-y-3 rounded-3xl border border-border/60 bg-card p-4 shadow-card">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="חיפוש לפי שם, מספר לקוח, כתובת, איש קשר או טלפון…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-2xl border border-transparent bg-muted/50 py-3 pl-4 pr-11 text-sm font-medium focus:border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <select
              aria-label="מיון"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="min-h-11 rounded-2xl border bg-muted/50 px-3 text-xs font-bold"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  מיון: {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setChip(c.key)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-bold transition",
                  chip === c.key ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted/80 text-muted-foreground hover:bg-muted",
                )}
              >
                {c.label}
              </button>
            ))}
            <span className="mr-auto self-center text-[11px] text-muted-foreground">{filtered.length} מוצגים</span>
          </div>
        </div>

        {q.isLoading && (
          <div className="flex justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            קורא 6 טאבים מהגיליון…
          </div>
        )}

        {q.isError && (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {(q.error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((c) => (
            <CustomerCard key={c.customerNo} c={c} />
          ))}
        </div>

        {!q.isLoading && !q.isError && filtered.length === 0 && (
          <div className="rounded-3xl border border-border/60 bg-card p-10 text-center shadow-card">
            <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-2 font-display text-lg font-bold">לא נמצאו לקוחות</h3>
            <p className="text-sm text-muted-foreground">נסו לשנות את החיפוש או הסינון</p>
          </div>
        )}
      </div>
    </>
  );
}

function initials(name: string) {
  return name
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

function CustomerCard({ c }: { c: CustomerSummary }) {
  const phoneDigits = c.phone.replace(/[^0-9]/g, "");
  const wa = phoneDigits ? `972${phoneDigits.slice(-9)}` : "";
  const returning = c.notesCount + c.ordersCount > 1;

  return (
    <article className="group flex flex-col justify-between rounded-3xl border border-border/60 bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
      <div>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-sm font-extrabold text-primary-foreground shadow-sm">
            {initials(c.name) || "#"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-muted-foreground">#{c.customerNo}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  returning ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-800",
                )}
              >
                {returning ? "לקוח חוזר" : "לקוח חדש"}
              </span>
              {c.openInquiries > 0 && (
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  {c.openInquiries} בירורים פתוחים
                </span>
              )}
            </div>
            <h2 className="mt-1 truncate font-display text-lg font-bold">{c.name}</h2>
            {c.address && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.address}</span>
                {c.addressesCount > 1 && <span className="shrink-0">(+{c.addressesCount - 1})</span>}
              </p>
            )}
          </div>
          <Link
            to="/customers/$id"
            params={{ id: c.customerNo }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground"
            aria-label="פתח תיק"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <Mini label="תעודות" value={String(c.notesCount)} />
          <Mini label="הזמנות" value={String(c.ordersCount)} />
          <Mini label="פריקה ממוצעת" value={c.avgSiteMin != null ? `${c.avgSiteMin} דק׳` : "—"} />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {c.lastIso && (
            <span>
              אספקה אחרונה: <strong className="text-foreground">{fmtShort(c.lastIso)}</strong> ({relativeFromIso(c.lastIso)})
            </span>
          )}
          {c.preferredDriver && (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              {c.preferredDriver}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex gap-2">
          {c.phone && (
            <a href={`tel:${c.phone}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted transition hover:bg-muted/70" title="חיוג">
              <Phone className="h-4 w-4" />
            </a>
          )}
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 transition hover:bg-emerald-500/25"
              title="וואטסאפ"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
          )}
          {c.address && (
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(c.address)}&navigate=yes`}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-700 transition hover:bg-blue-500/25"
              title="ניווט"
            >
              <Navigation className="h-4 w-4" />
            </a>
          )}
        </div>
        <Link
          to="/customers/$id"
          params={{ id: c.customerNo }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary hover:text-primary-foreground"
        >
          <FolderOpen className="h-4 w-4" />
          פתח תיק
        </Link>
      </div>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-display text-base font-extrabold">{value}</div>
    </div>
  );
}

const TONES = {
  blue: "bg-blue-500/15 text-blue-600",
  amber: "bg-amber-500/15 text-amber-600",
  indigo: "bg-indigo-500/15 text-indigo-600",
  emerald: "bg-emerald-500/15 text-emerald-600",
  rose: "bg-rose-500/15 text-rose-600",
} as const;

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card/80 p-3 shadow-xs ring-1 ring-border/50 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold text-muted-foreground">{label}</div>
        <div className="font-display text-xl font-extrabold">{value}</div>
      </div>
    </div>
  );
}
