/**
 * /customers — רשימת לקוחות חיה מ-GAS (getCustomers)
 */
import * as React from "react";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { listCustomersFn, type LiveCustomer } from "@/lib/customers.functions";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "תיקי לקוחות — ח. סבן לוגיסטיקה" },
      {
        name: "description",
        content: "לקוחות מגיליון התעודות וההזמנות · מספר לקוח כמפתח",
      },
    ],
  }),
  component: CustomersLayout,
});

function CustomersLayout() {
  const { pathname } = useLocation();
  const isList = pathname === "/customers" || pathname === "/customers/";
  return isList ? <CustomersList /> : <Outlet />;
}

function CustomersList() {
  const [search, setSearch] = React.useState("");

  const q = useQuery({
    queryKey: ["live-customers"],
    queryFn: () => listCustomersFn(),
    staleTime: 60_000,
  });

  const customers = q.data?.customers || [];

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.customerNo.includes(s) ||
        c.id.includes(s) ||
        (c.address || "").toLowerCase().includes(s) ||
        (c.phone || "").includes(s),
    );
  }, [customers, search]);

  const totalNotes = customers.reduce((a, c) => a + (c.notesCount || 0), 0);

  return (
    <>
      <PageHeader
        title="תיקי לקוחות"
        subtitle={
          q.data
            ? `מקור: ${q.data.source} · ${q.data.count} לקוחות · ${totalNotes} תעודות`
            : "נטען מהגיליון דרך GAS"
        }
        action={
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold"
          >
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Kpi
            icon={Users}
            label="לקוחות בגיליון"
            value={q.isLoading ? "…" : String(customers.length)}
            hint="לפי מספר לקוח ייחודי"
            tone="blue"
          />
          <Kpi
            icon={FileText}
            label="תעודות משויכות"
            value={q.isLoading ? "…" : String(totalNotes)}
            hint="מארכיון התעודות"
            tone="amber"
          />
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-card">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="חיפוש לפי שם, מספר לקוח, כתובת או טלפון…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-transparent bg-muted/50 py-3 pr-11 pl-4 text-sm font-medium focus:border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {q.isLoading && (
          <div className="flex justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען לקוחות מהגיליון…
          </div>
        )}

        {q.isError && (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {(q.error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((c) => (
            <CustomerCard key={c.id} c={c} />
          ))}
        </div>

        {!q.isLoading && filtered.length === 0 && (
          <div className="rounded-3xl border border-border/60 bg-card p-10 text-center shadow-card">
            <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-2 font-display text-lg font-bold">לא נמצאו לקוחות</h3>
            <p className="text-sm text-muted-foreground">
              ודאו ש-action=getCustomers בפריסת GAS ושיש מספרי לקוח בתעודות
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function CustomerCard({ c }: { c: LiveCustomer }) {
  const phoneDigits = (c.phone || "").replace(/[^0-9]/g, "");
  const wa = phoneDigits ? `972${phoneDigits.slice(-9)}` : "";

  return (
    <article className="flex flex-col justify-between rounded-3xl border border-border/60 bg-card p-5 shadow-card transition hover:border-primary/40">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="font-mono text-xs font-bold text-muted-foreground">
              #{c.customerNo}
            </span>
            <h2 className="mt-1 font-display text-xl font-bold">{c.name}</h2>
            {c.address && (
              <p className="mt-1 text-xs text-muted-foreground">{c.address}</p>
            )}
          </div>
          <Link
            to="/customers/$id"
            params={{ id: c.customerNo }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {c.preferredDriver && (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              {c.preferredDriver}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {c.notesCount} תעודות
          </span>
          {c.ordersCount > 0 && <span>{c.ordersCount} הזמנות</span>}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex gap-2">
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
          )}
          {c.address && (
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(c.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-700"
            >
              <Navigation className="h-4 w-4" />
            </a>
          )}
        </div>
        <Link
          to="/customers/$id"
          params={{ id: c.customerNo }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground"
        >
          <FolderOpen className="h-4 w-4" />
          פתח תיק
        </Link>
      </div>
    </article>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "amber";
}) {
  const colors =
    tone === "blue"
      ? "bg-blue-500/15 text-blue-600"
      : "bg-amber-500/15 text-amber-600";
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-card">
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
          colors,
        )}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="font-display text-3xl font-extrabold">{value}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}
