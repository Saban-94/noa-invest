/**
 * /customers/$id — תיק לקוח חי: תעודות + הזמנות + מסמכים + תובנות מכל הטאבים
 * מפתח: מספר לקוח (customerNo)
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { uploadCustomerDocumentFn, type CustomerDocumentType } from "@/lib/customer-documents.functions";
import { PageHeader } from "@/components/AppShell";
import { getCustomerBundleFn } from "@/lib/customers.functions";
import {
  Phone,
  MessageSquare,
  Navigation,
  FileText,
  ExternalLink,
  ArrowRight,
  Loader2,
  RefreshCw,
  Package,
  Truck,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Search,
  MapPin,
  CalendarDays,
  Repeat2,
  Sparkles,
  ChevronDown,
  Layers,
  Clock,
  FolderOpen,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers/$id")({
  head: ({ params }) => ({
    meta: [{ title: `תיק לקוח ${params.id} — ח. סבן` }],
  }),
  component: CustomerDetailView,
});

/** כפתור "בירור" מוסתר כברירת מחדל. להחזרה: true */
const SHOW_INQUIRY_BUTTON = false;

/* ------------------------------ עזרים ------------------------------ */

type Rec = Record<string, unknown>;
type Line = { name: string; qty: number; unit: string };

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

/** מפענח תאריך ממגוון פורמטים: dd/mm/yyyy, dd-mm-yy, ISO, ו"Sun Oct 13 2024 ..." */
function parseDate(raw: unknown): Date | null {
  const str = s(raw);
  if (!str) return null;
  const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const fmtLong = (raw: unknown): string => {
  const d = parseDate(raw);
  return d
    ? d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : s(raw);
};

const fmtShort = (raw: unknown): string => {
  const d = parseDate(raw);
  return d ? d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : s(raw);
};

const fmtMonth = (d: Date): string => d.toLocaleDateString("he-IL", { month: "short" });

function relativeFromNow(d: Date | null): string {
  if (!d) return "—";
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 30) return `לפני ${days} ימים`;
  if (days < 365) return `לפני ${Math.round(days / 30)} חודשים`;
  return `לפני ${(days / 365).toFixed(1)} שנים`;
}

const normAddr = (a: string) =>
  a
    .toLowerCase()
    .replace(/["'״׳,.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function itemsOf(r: Rec): Line[] {
  const raw = r.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Rec => !!i && typeof i === "object")
    .map((i) => ({ name: s(i.name), qty: Number(i.qty) || 0, unit: s(i.unit) }))
    .filter((i) => i.name);
}

function depositQty(text: string, code: string): number {
  const m = text.match(new RegExp(`${code}\\D{0,25}(\\d+)`));
  return m ? parseInt(m[1], 10) : 0;
}

const wazeUrl = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;

/* ------------------------------- דף ------------------------------- */

type Tab = "overview" | "notes" | "orders" | "documents";

function CustomerDetailView() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [openNote, setOpenNote] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["customer-bundle", id],
    queryFn: () => getCustomerBundleFn({ data: { customerNo: id } }),
    staleTime: 30_000,
  });

  const customer = q.data?.customer;
  const rawNotes = (q.data?.notes || []) as Rec[];
  const orders = (q.data?.orders || []) as Rec[];
  const documents = (q.data?.documents || []) as Rec[];

  /* ---- ניתוח הלקוח מכל הטאבים ---- */
  const intel = useMemo(() => {
    const notes = [...rawNotes].sort(
      (a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0),
    );

    // ביקורים לפי כתובת (מנורמלת)
    const byAddr = new Map<string, { label: string; dates: number[] }>();
    for (const n of notes) {
      const label = s(n.address);
      if (!label) continue;
      const key = normAddr(label);
      const entry = byAddr.get(key) || { label, dates: [] };
      entry.dates.push(parseDate(n.date)?.getTime() ?? 0);
      byAddr.set(key, entry);
    }
    const addresses = [...byAddr.values()].sort((a, b) => b.dates.length - a.dates.length);

    // לכל תעודה: כמה אספקות קודמות היו לאותה כתובת
    const priorAtAddress = new Map<string, number>();
    for (const n of notes) {
      const key = normAddr(s(n.address));
      const t = parseDate(n.date)?.getTime() ?? 0;
      const entry = key ? byAddr.get(key) : undefined;
      priorAtAddress.set(s(n.id), entry ? entry.dates.filter((x) => x < t).length : 0);
    }

    // רכישות עיקריות: תעודות + הזמנות
    const products = new Map<string, { qty: number; unit: string; hits: number }>();
    for (const r of [...notes, ...orders]) {
      for (const it of itemsOf(r)) {
        const p = products.get(it.name) || { qty: 0, unit: it.unit, hits: 0 };
        p.qty += it.qty;
        p.hits += 1;
        products.set(it.name, p);
      }
    }
    const topProducts = [...products.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.hits - a.hits || b.qty - a.qty)
      .slice(0, 6);

    // נהגים
    const drivers = new Map<string, number>();
    for (const n of notes) {
      const d = s(n.driver);
      if (d) drivers.set(d, (drivers.get(d) || 0) + 1);
    }
    const topDriver = [...drivers.entries()].sort((a, b) => b[1] - a[1])[0];

    // פקדונות
    let bales = 0;
    let pallets = 0;
    for (const n of notes) {
      const t = s(n.depositsText);
      bales += depositQty(t, "60002");
      pallets += depositQty(t, "60060");
    }

    // 6 חודשים אחרונים
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: fmtMonth(d), count: 0 };
    });
    for (const n of notes) {
      const d = parseDate(n.date);
      if (!d) continue;
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.count += 1;
    }

    const firstDate = parseDate(notes[notes.length - 1]?.date);
    const lastDate = parseDate(notes[0]?.date);

    return { notes, addresses, priorAtAddress, topProducts, topDriver, bales, pallets, months, firstDate, lastDate };
  }, [rawNotes, orders]);

  if (q.isLoading) {
    return (
      <div className="flex justify-center gap-2 py-24 text-muted-foreground" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin" />
        טוען תיק לקוח #{id}…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center" dir="rtl">
        <p className="text-destructive">{(q.error as Error).message}</p>
        <Link to="/customers" className="mt-4 inline-flex gap-2 font-bold text-primary">
          <ArrowRight className="h-4 w-4" /> חזרה
        </Link>
      </div>
    );
  }

  const name = customer?.name || s(rawNotes[0]?.customer) || `לקוח ${id}`;
  const address = customer?.address || intel.addresses[0]?.label || "";
  const phone = customer?.phone || "";
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  const wa = phoneDigits ? `972${phoneDigits.slice(-9)}` : "";

  const isReturning = intel.notes.length > 1;
  const maxMonth = Math.max(1, ...intel.months.map((m) => m.count));
  const maxProduct = Math.max(1, ...intel.topProducts.map((p) => p.hits));

  const term = search.trim().toLowerCase();
  const filteredNotes = term
    ? intel.notes.filter((n) =>
        [n.id, n.docNumber, n.comaxOrder, n.address, n.driver, n.craneNotes, n.craneTime]
          .map(s)
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : intel.notes;

  const tabs: { key: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { key: "overview", label: "סקירה", icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: "notes", label: "תעודות", icon: <FileText className="h-4 w-4" />, count: intel.notes.length },
    { key: "orders", label: "הזמנות", icon: <Package className="h-4 w-4" />, count: orders.length },
    { key: "documents", label: "מסמכים", icon: <FolderOpen className="h-4 w-4" />, count: documents.length },
  ];

  return (
    <>
      <PageHeader
        title={`תיק לקוח: ${name}`}
        subtitle={`מספר לקוח ${id} · נתונים חיים מכל טאבי הגיליון`}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} />
              רענון
            </button>
            <Link
              to="/customers"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" />
              כל הלקוחות
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-card">
          <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-muted-foreground">קומקס #{id}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                    isReturning
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
                      : "border-amber-500/30 bg-amber-500/15 text-amber-800",
                  )}
                >
                  <Repeat2 className="h-3 w-3" />
                  {isReturning ? `לקוח חוזר · ${intel.notes.length} אספקות` : "אספקה ראשונה"}
                </span>
              </div>
              <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">{name}</h1>
              {address && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  {address}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {(customer?.preferredDriver || intel.topDriver?.[0]) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-primary" />
                    נהג עיקרי: <strong className="text-foreground">{customer?.preferredDriver || intel.topDriver?.[0]}</strong>
                  </span>
                )}
                {intel.lastDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    אספקה אחרונה: <strong className="text-foreground">{relativeFromNow(intel.lastDate)}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              <CustomerDocumentUpload customerNo={id} customerName={name} />
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-2 rounded-2xl bg-muted/80 px-4 py-3 text-xs font-bold transition hover:bg-muted active:scale-95"
                >
                  <Phone className="h-4 w-4 text-primary" />
                  חיוג
                </a>
              )}
              {wa && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/25 active:scale-95"
                >
                  <MessageSquare className="h-4 w-4" />
                  וואטסאפ
                </a>
              )}
              {address && (
                <a
                  href={wazeUrl(address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-xs font-bold text-blue-700 transition hover:bg-blue-500/25 active:scale-95"
                >
                  <Navigation className="h-4 w-4" />
                  נווט ל-Waze
                </a>
              )}
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-border/50 pt-4 sm:grid-cols-4">
            <Kpi label="תעודות משלוח" value={String(intel.notes.length)} icon={<FileText className="h-4 w-4 text-amber-500" />} />
            <Kpi label="הזמנות" value={String(orders.length)} icon={<Package className="h-4 w-4 text-blue-500" />} />
            <Kpi label="כתובות אספקה" value={String(intel.addresses.length)} icon={<MapPin className="h-4 w-4 text-emerald-500" />} />
            <Kpi label="לקוח מאז" value={intel.firstDate ? fmtShort(intel.firstDate) : "—"} icon={<CalendarDays className="h-4 w-4 text-primary" />} small />
          </div>
        </section>

        {/* ---------- ניווט טאבים ---------- */}
        <nav className="sticky top-[60px] z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/90 p-1 shadow-sm backdrop-blur-md">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-xs font-bold transition",
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px]",
                    tab === t.key ? "bg-white/25" : "bg-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* ---------- סקירה ---------- */}
        {tab === "overview" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="היכרות עם הלקוח" icon={<Sparkles className="h-5 w-5 text-primary" />}>
              <ul className="space-y-2.5 text-sm">
                <Insight>
                  {isReturning ? (
                    <>
                      <strong>לקוח מוכר</strong> — סופקו לו {intel.notes.length} תעודות
                      {intel.firstDate ? <> מאז {fmtLong(intel.firstDate)}</> : null}.
                    </>
                  ) : intel.notes.length === 1 ? (
                    <>
                      <strong>אספקה ראשונה</strong> ללקוח במערכת ({fmtLong(intel.notes[0].date)}).
                    </>
                  ) : (
                    <>אין עדיין תעודות ללקוח זה.</>
                  )}
                </Insight>
                {intel.addresses[0] && (
                  <Insight>
                    הכתובת השכיחה: <strong>{intel.addresses[0].label}</strong> —{" "}
                    {intel.addresses[0].dates.length === 1
                      ? "פעם אחת"
                      : `${intel.addresses[0].dates.length} פעמים`}
                    {intel.addresses.length > 1 && <> (ועוד {intel.addresses.length - 1} כתובות נוספות)</>}.
                  </Insight>
                )}
                {intel.topProducts[0] && (
                  <Insight>
                    רכישה עיקרית: <strong>{intel.topProducts[0].name}</strong>
                    {intel.topProducts[1] && <>, ואחריה {intel.topProducts[1].name}</>}.
                  </Insight>
                )}
                {intel.topDriver && (
                  <Insight>
                    נהג מוביל: <strong>{intel.topDriver[0]}</strong> ({intel.topDriver[1]} אספקות).
                  </Insight>
                )}
                {(intel.bales > 0 || intel.pallets > 0) && (
                  <Insight>
                    פקדונות שנקראו מהתעודות: <strong>{intel.bales}</strong> בלות (60002) ·{" "}
                    <strong>{intel.pallets}</strong> משטחים (60060).
                  </Insight>
                )}
              </ul>

              {intel.topProducts.length > 0 && (
                <div className="mt-5 border-t border-border/50 pt-4">
                  <h3 className="mb-3 text-xs font-bold text-muted-foreground">רכישות עיקריות</h3>
                  <div className="space-y-2">
                    {intel.topProducts.map((p) => (
                      <div key={p.name} className="text-xs">
                        <div className="mb-1 flex justify-between gap-2">
                          <span className="truncate font-semibold">{p.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {p.qty.toLocaleString("he-IL")} {p.unit} · {p.hits} הופעות
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-l from-primary to-primary/50 transition-all duration-500"
                            style={{ width: `${(p.hits / maxProduct) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div className="space-y-5">
              <Card title="קצב אספקות (6 חודשים)" icon={<CalendarDays className="h-5 w-5 text-primary" />}>
                <div className="flex h-28 items-end gap-2">
                  {intel.months.map((m) => (
                    <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-muted-foreground">{m.count || ""}</span>
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-primary/60 to-primary transition-all duration-500"
                        style={{ height: `${Math.max(4, (m.count / maxMonth) * 80)}px`, opacity: m.count ? 1 : 0.2 }}
                      />
                      <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="כתובות אספקה" icon={<MapPin className="h-5 w-5 text-emerald-500" />}>
                {intel.addresses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">אין כתובות מתועדות</p>
                ) : (
                  <ul className="space-y-2">
                    {intel.addresses.slice(0, 5).map((a) => (
                      <li key={a.label} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 p-2.5 text-xs">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{a.label}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.dates.length} אספקות · אחרונה {relativeFromNow(new Date(Math.max(...a.dates)))}
                          </div>
                        </div>
                        <a
                          href={wazeUrl(a.label)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-700 transition hover:bg-blue-500/25"
                          title="ניווט"
                        >
                          <Navigation className="h-4 w-4" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ---------- תעודות ---------- */}
        {tab === "notes" && (
          <Card title={`תעודות משלוח (${filteredNotes.length}/${intel.notes.length})`} icon={<FileText className="h-5 w-5 text-amber-500" />}>
            <div className="relative mb-4">
              <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי מספר תעודה, הזמנה, כתובת, נהג…"
                className="w-full rounded-2xl border bg-muted/40 py-3 pl-4 pr-11 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {filteredNotes.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                {intel.notes.length === 0 ? `אין תעודות עם מספר לקוח ${id} בגיליון` : "לא נמצאו תעודות תואמות"}
              </p>
            ) : (
              <ol className="relative space-y-3 before:absolute before:bottom-2 before:right-[11px] before:top-2 before:w-px before:bg-border">
                {filteredNotes.map((n) => {
                  const noteId = s(n.id || n.docNumber);
                  const driveUrl = s(n.driveUrl || n.signedUrl);
                  const fileId = s(n.fileId);
                  const addr = s(n.address);
                  const crane = s(n.craneNotes || n.craneTime);
                  const lines = itemsOf(n);
                  const prior = intel.priorAtAddress.get(noteId) || 0;
                  const open = openNote === noteId;
                  const bales = depositQty(s(n.depositsText), "60002");
                  const pallets = depositQty(s(n.depositsText), "60060");

                  return (
                    <li key={noteId} className="relative pr-8">
                      <span className="absolute right-0 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-card">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      </span>
                      <div className="rounded-2xl border border-border/60 bg-muted/20 transition hover:border-primary/40 hover:bg-muted/30">
                        <button
                          type="button"
                          onClick={() => setOpenNote(open ? null : noteId)}
                          className="flex w-full items-start justify-between gap-3 p-4 text-right"
                        >
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-bold">ת.מ. {noteId}</span>
                              {n.comaxOrder ? (
                                <span className="font-mono text-xs font-semibold text-primary">
                                  הזמנה #{s(n.comaxOrder)}
                                </span>
                              ) : null}
                              {addr && (
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                    prior > 0
                                      ? "bg-emerald-500/15 text-emerald-700"
                                      : "bg-amber-500/15 text-amber-800",
                                  )}
                                >
                                  {prior > 0 ? `כתובת מוכרת · אספקה #${prior + 1}` : "כתובת חדשה"}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                                {fmtLong(n.date)}
                                {s(n.time) ? ` · ${s(n.time)}` : ""}
                              </span>
                              {n.driver ? (
                                <span className="inline-flex items-center gap-1">
                                  <Truck className="h-3.5 w-3.5" />
                                  {s(n.driver)}
                                </span>
                              ) : null}
                            </div>
                            {addr && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{addr}</span>
                              </div>
                            )}
                            {crane && (
                              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                                🏗️ מנוף: {crane}
                              </p>
                            )}
                          </div>
                          <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                        </button>

                        {open && (
                          <div className="animate-in fade-in space-y-3 border-t border-border/50 p-4 duration-200">
                            {lines.length > 0 ? (
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {lines.map((l, i) => (
                                  <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-card p-2.5 text-xs">
                                    <span className="truncate font-semibold">{l.name}</span>
                                    <span className="shrink-0 font-mono text-muted-foreground">
                                      {l.qty} {l.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">אין פירוט פריטים לתעודה</p>
                            )}
                            {(bales > 0 || pallets > 0) && (
                              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                                {bales > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-amber-800">
                                    <Package className="h-3 w-3" /> בלות 60002: {bales}
                                  </span>
                                )}
                                {pallets > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-800">
                                    <Layers className="h-3 w-3" /> משטחים 60060: {pallets}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 border-t border-border/50 p-3">
                          <Link
                            to="/notes/$id"
                            params={{ id: noteId }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-95"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            פתח תעודה
                          </Link>
                          {addr && (
                            <a
                              href={wazeUrl(addr)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-500/20 active:scale-95"
                            >
                              <Navigation className="h-3.5 w-3.5" />
                              נווט לאתר
                            </a>
                          )}
                          {(driveUrl || fileId) && (
                            <a
                              href={driveUrl || `https://drive.google.com/file/d/${fileId}/view`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition hover:bg-muted active:scale-95"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Drive
                            </a>
                          )}
                          {SHOW_INQUIRY_BUTTON && (
                            <Link
                              to="/inquiry"
                              search={{ task: noteId }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-800"
                            >
                              בירור
                            </Link>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        )}

        {/* ---------- הזמנות ---------- */}
        {tab === "orders" && (
          <Card title={`הזמנות (${orders.length})`} icon={<Package className="h-5 w-5 text-blue-500" />}>
            {orders.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                אין הזמנות משויכות (בדקו עמודת מס׳ לקוח בטאב ההזמנות)
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {orders.map((o) => {
                  const oAddr = s(o.address);
                  const lines = itemsOf(o);
                  return (
                    <div key={s(o.id)} className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4 transition hover:border-primary/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-bold text-primary">הזמנה #{s(o.id)}</span>
                        {o.status ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                            {s(o.status)}
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {o.date ? (
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {fmtLong(o.date)}
                          </div>
                        ) : null}
                        {o.driver ? (
                          <div className="flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5" />
                            {s(o.driver)}
                          </div>
                        ) : null}
                        {oAddr && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {oAddr}
                          </div>
                        )}
                      </div>
                      {lines.length > 0 && (
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">
                          {lines.map((l) => `${l.qty} ${l.name}`).join(" · ")}
                        </p>
                      )}
                      {oAddr && (
                        <a
                          href={wazeUrl(oAddr)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-500/20"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          נווט
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* ---------- מסמכים ---------- */}
        {tab === "documents" && (
          <Card title={`מסמכים בתיק הלקוח (${documents.length})`} icon={<FolderOpen className="h-5 w-5 text-primary" />}>
            {documents.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                עדיין לא הועלו מסמכים דרך נועה
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc, index) => (
                  <div
                    key={s(doc.fileId) || `${s(doc.fileName) || "מסמך"}-${index}`}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 transition hover:border-primary/40 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{s(doc.originalFileName || doc.fileName) || "מסמך"}</span>
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {s(doc.docTypeLabel) || "מסמך"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {doc.uploadedAt ? new Date(s(doc.uploadedAt)).toLocaleString("he-IL") : ""}
                        {doc.status ? ` · ${s(doc.status)}` : ""}
                      </p>
                    </div>
                    {doc.driveUrl ? (
                      <a
                        href={s(doc.driveUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition hover:bg-muted"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        פתיחת מסמך
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

/* ------------------------- רכיבי עזר ------------------------- */

function Card({
  title,
  icon,
  className,
  children,
}: {
  title: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-3xl border border-border/70 bg-card p-5 shadow-card md:p-6", className)}>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="font-display text-lg font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Insight({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 leading-relaxed">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}

function Kpi({
  label,
  value,
  icon,
  small,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-card/80 p-3 shadow-xs ring-1 ring-border/50 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 font-extrabold", small ? "text-sm" : "text-2xl")}>{value}</div>
    </div>
  );
}

function CustomerDocumentUpload({
  customerNo,
  customerName,
}: {
  customerNo: string;
  customerName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState<CustomerDocumentType>("delivery_note");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError(true);
      setMessage("אפשר להעלות PDF או תמונה בלבד");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError(true);
      setMessage("הקובץ גדול מדי. המגבלה היא 12MB");
      return;
    }

    setBusy(true);
    setError(false);
    setMessage("מעלה ושומר בתיקיית הלקוח…");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("לא ניתן לקרוא את הקובץ"));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] || "";
      const result = await uploadCustomerDocumentFn({
        data: {
          customerNo,
          customerName,
          docType,
          fileName: file.name,
          mimeType: file.type,
          base64,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["customer-bundle", customerNo] });
      setError(false);
      setMessage(`נשמר בתיקיית הלקוח · ${result.folderName || customerName}`);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "העלאת המסמך נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="סוג המסמך להעלאה"
          value={docType}
          onChange={(event) => setDocType(event.target.value as CustomerDocumentType)}
          disabled={busy}
          className="min-h-10 max-w-36 rounded-xl border border-border bg-background px-2 text-xs font-semibold"
        >
          <option value="delivery_note">תעודת משלוח</option>
          <option value="order">הזמנה</option>
          <option value="other">מסמך אחר</option>
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UploadCloud className="h-4 w-4" />
          {busy ? "מעלה…" : "העלה לתיק לקוח"}
        </button>
      </div>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={`flex items-center gap-1 text-[11px] ${error ? "text-destructive" : "text-emerald-700"}`}
        >
          {error ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          ) : !busy ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : null}
          {message}
        </p>
      )}
    </div>
  );
}
