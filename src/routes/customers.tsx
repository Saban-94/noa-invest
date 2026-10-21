import * as React from "react";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { CUSTOMERS, calculateTotalCustomerDeposits, type CustomerTag } from "@/lib/customers-data";
import {
  Users,
  Package,
  Layers,
  Search,
  Phone,
  MessageSquare,
  Navigation,
  FolderOpen,
  ChevronLeft,
  Truck,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "תיקי לקוחות — ח. סבן לוגיסטיקה" },
      {
        name: "description",
        content:
          "סייר תיקי לקוחות קנוני ב-Google Drive, יתרות פקדונות, מניפסט הזמנות ותעודות משלוח.",
      },
      { property: "og:title", content: "תיקי לקוחות — ח. סבן" },
      { property: "og:description", content: "ניהול תיקי לקוחות וסייר Google Drive." },
    ],
  }),
  component: CustomersLayout,
});

function CustomersLayout() {
  const { pathname } = useLocation();
  const isList = pathname === "/customers" || pathname === "/customers/";
  return isList ? <CustomersList /> : <Outlet />;
}

const TAG_COLORS: Record<CustomerTag, string> = {
  "לקוח עוגן": "bg-blue-500/15 text-blue-700 border-blue-500/30",
  "שוטף מאושר": "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  "דורש תשלום במזומן": "bg-amber-500/15 text-amber-700 border-amber-500/30",
  "מלגזה באתר": "bg-purple-500/15 text-purple-700 border-purple-500/30",
};

function CustomersList() {
  const [search, setSearch] = React.useState("");
  const [selectedTag, setSelectedTag] = React.useState<string>("הכל");

  const kpis = React.useMemo(() => calculateTotalCustomerDeposits(), []);

  const filteredCustomers = React.useMemo(() => {
    return CUSTOMERS.filter((c) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q);

      const matchTag = selectedTag === "הכל" || c.tag === selectedTag;

      return matchSearch && matchTag;
    });
  }, [search, selectedTag]);

  const tags = ["הכל", "לקוח עוגן", "שוטף מאושר", "דורש תשלום במזומן", "מלגזה באתר"];

  return (
    <>
      <PageHeader
        title="תיקי לקוחות וסייר Drive"
        subtitle="תיקיות לקוחות / [מספר לקוח] - [שם לקוח] · יתרות פקדונות ושיבוצי פריקה"
      />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
        {/* כרטיסי KPI עליונים */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-card border border-border/60">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-600">
              <Users className="h-7 w-7" />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">
                לקוחות פעילים במערכת
              </div>
              <div className="font-display text-3xl font-extrabold text-foreground">
                {kpis.totalActiveCustomers}
              </div>
              <div className="text-[11px] text-emerald-600 font-medium">
                סנכרון מלא מול קומקס ERP
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-card border border-border/60">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600">
              <Package className="h-7 w-7" />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">
                יתרת שקי בלה בשטח (60002)
              </div>
              <div className="font-display text-3xl font-extrabold text-amber-700">
                {kpis.totalFieldBales60002}
              </div>
              <div className="text-[11px] text-muted-foreground">בלות פתוחות להחזרה / חיוב</div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-card border border-border/60">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
              <Layers className="h-7 w-7" />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">
                יתרת משטחי עץ סבן (60060)
              </div>
              <div className="font-display text-3xl font-extrabold text-emerald-700">
                {kpis.totalFieldPallets60060}
              </div>
              <div className="text-[11px] text-muted-foreground">משטחים מנוהלים ברישום 1:1</div>
            </div>
          </div>
        </div>

        {/* שורת חיפוש וסינון תגיות */}
        <div className="rounded-3xl bg-card p-4 shadow-card border border-border/60 space-y-3">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="חיפוש לפי שם לקוח, מספר בקומקס (לדוגמה: 612108), איש קשר או עיר..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl bg-muted/50 py-3 pr-11 pl-4 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 border border-transparent focus:border-primary/20"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(t)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  selectedTag === t
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/80 text-muted-foreground hover:bg-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* רשת כרטיסי לקוחות */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredCustomers.map((c) => (
            <article
              key={c.id}
              className="flex flex-col justify-between rounded-3xl bg-card p-5 shadow-card border border-border/60 hover:border-primary/40 transition duration-150"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-muted-foreground">
                        #{c.id}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${TAG_COLORS[c.tag]}`}
                      >
                        {c.tag}
                      </span>
                    </div>
                    <h2 className="mt-1 font-display text-xl font-bold text-foreground">
                      {c.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">ח״פ / ע.מ: {c.hp}</p>
                  </div>

                  <Link
                    to="/customers/$id"
                    params={{ id: c.id }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition"
                    title="פתח תיק לקוח ודרייב"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Link>
                </div>

                <div className="mt-3.5 space-y-1.5 text-xs text-foreground/80">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-muted-foreground">איש קשר:</span>
                    <span className="font-medium">{c.contactName}</span>
                    <span className="text-muted-foreground">({c.phone})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-muted-foreground">כתובת:</span>
                    <span>{c.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">נהג מועדף:</span>
                    <span className="font-semibold text-foreground">{c.preferredDriver}</span>
                    <span className="text-[11px] text-muted-foreground">({c.truckType})</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-muted/40 p-2.5 text-center text-xs">
                  <div className="border-l border-border/60">
                    <span className="text-[11px] text-muted-foreground block">
                      בלות פתוחות (60002)
                    </span>
                    <span className="font-display font-extrabold text-amber-700 text-base">
                      {c.depositLedger?.bales60002?.openBalance ?? 0} יח׳
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground block">
                      משטחי עץ (60060)
                    </span>
                    <span className="font-display font-extrabold text-emerald-700 text-base">
                      {c.depositLedger?.pallets60060?.openBalance ?? 0} יח׳
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${c.phone}`}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-foreground transition"
                    title={`חייג ל${c.contactName}`}
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                  <a
                    href={`https://wa.me/972${c.phone.replace(/[^0-9]/g, "").slice(-9)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 transition"
                    title={`וואטסאפ ל${c.contactName}`}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </a>
                  <a
                    href={`https://waze.com/ul?q=${encodeURIComponent(c.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 transition"
                    title="נווט ב-Waze לאתר"
                  >
                    <Navigation className="h-4 w-4" />
                  </a>
                </div>

                <Link
                  to="/customers/$id"
                  params={{ id: c.id }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 font-bold text-primary hover:bg-primary hover:text-primary-foreground transition"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>סייר תיק לקוח</span>
                </Link>
              </div>
            </article>
          ))}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="rounded-3xl bg-card p-10 text-center shadow-card border border-border/60">
            <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-2 font-display text-lg font-bold">לא נמצאו לקוחות מתאימים</h3>
            <p className="text-sm text-muted-foreground">נסו לשנות את מילת החיפוש או הסינון</p>
          </div>
        )}
      </div>
    </>
  );
}
