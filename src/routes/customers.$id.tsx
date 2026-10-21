import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import {
  getCustomerById,
  getDeliveryNotesForCustomer,
  type CustomerOrder,
  type CustomerInvoice,
} from "@/lib/customers-data";
import { auditNote, noteTotal, ils } from "@/lib/data";
import { useApprovals, playAlert, playDispatchChime } from "@/lib/store";
import {
  Phone,
  MessageSquare,
  Navigation,
  Folder,
  FileText,
  Truck,
  AlertTriangle,
  Receipt,
  Download,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Layers,
  Package,
  Calendar,
  Building,
  User,
  ShieldAlert,
  ArrowRight,
  PlusCircle,
  FileCheck,
  Eye,
} from "lucide-react";

export const Route = createFileRoute("/customers/$id")({
  head: ({ params }) => {
    const c = getCustomerById(params.id);
    return {
      meta: [
        { title: `${c?.name || "תיק לקוח"} — ח. סבן לוגיסטיקה` },
        {
          name: "description",
          content: `תיק לקוח ${c?.name || ""} ומסמכי Google Drive, פקדונות ושיבוצי פריקה.`,
        },
      ],
    };
  },
  component: CustomerDetailView,
});

function CustomerDetailView() {
  const { id } = Route.useParams();
  const customer = getCustomerById(id);
  const approvalsState = useApprovals();

  const [activeFolder, setActiveFolder] = useState<"orders" | "notes" | "invoices">("notes");
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditBales, setCreditBales] = useState(1);
  const [creditPallets, setCreditPallets] = useState(1);
  const [creditNotes, setCreditNotes] = useState("");

  if (!customer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h2 className="text-2xl font-bold">לקוח מספר {id} לא נמצא</h2>
        <p className="mt-2 text-muted-foreground">הלקוח אינו מופיע במאגר הלקוחות הפעיל</p>
        <Link
          to="/customers"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground"
        >
          <ArrowRight className="h-4 w-4" /> חזרה לרשימת לקוחות
        </Link>
      </div>
    );
  }

  const deliveryNotes = getDeliveryNotesForCustomer(customer.id);

  const handleIssueDepositCredit = () => {
    playAlert();
    toast.success(
      `בקשת זיכוי פקדונות מהשטח (${creditBales} בלות, ${creditPallets} משטחים) שוגרה ללינה (lina@saban94.co.il) 📋`,
    );
    setShowCreditModal(false);
  };

  return (
    <>
      <PageHeader
        title={`תיק לקוח: ${customer.name}`}
        subtitle={`Google Drive: תיקיות לקוחות / [${customer.id}] - ${customer.name}`}
        action={
          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
          >
            <ChevronRight className="h-4 w-4" /> כל הלקוחות
          </Link>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        {/* 1. Profile Header Card */}
        <section className="relative overflow-hidden rounded-3xl bg-card p-6 shadow-card border border-border/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  קומקס #{customer.id}
                </span>
                <span className="rounded-md bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  {customer.tag}
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {customer.defaultYard}
                </span>
              </div>

              <h1 className="font-display text-2xl font-extrabold text-foreground md:text-3xl">
                {customer.name}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Building className="h-4 w-4 text-primary" />
                  <span>
                    ח״פ / ע.מ: <strong>{customer.hp}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="h-4 w-4 text-primary" />
                  <span>
                    איש קשר באתר: <strong>{customer.contactName}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Navigation className="h-4 w-4 text-primary" />
                  <span>{customer.address}</span>
                </div>
              </div>
            </div>

            {/* Quick action buttons (Tel, WhatsApp, Waze) */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-2 rounded-2xl bg-muted/80 px-4 py-3 text-xs font-bold text-foreground hover:bg-muted transition active:scale-95"
              >
                <Phone className="h-4 w-4 text-primary" />
                <span>חיוג לאיש קשר</span>
              </a>

              <a
                href={`https://wa.me/972${customer.phone.replace(/[^0-9]/g, "").slice(-9)}?text=${encodeURIComponent(
                  `שלום ${customer.contactName}, מדברים מח. סבן חומרי בניין (תיאום אספקה).`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-xs font-bold text-emerald-700 hover:bg-emerald-500/25 transition active:scale-95"
              >
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                <span>וואטסאפ מהיר</span>
              </a>

              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(customer.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-2xl bg-blue-500/15 border border-blue-500/30 px-4 py-3 text-xs font-bold text-blue-700 hover:bg-blue-500/25 transition active:scale-95"
              >
                <Navigation className="h-4 w-4 text-blue-600" />
                <span>ניווט Waze</span>
              </a>
            </div>
          </div>

          {/* Preferred Driver & Site Constraints */}
          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl bg-muted/40 p-3.5">
              <Truck className="h-5 w-5 shrink-0 text-primary mt-0.5" />
              <div className="text-xs">
                <div className="font-bold text-foreground">שיוך ושיבוץ רכב מועדף:</div>
                <div className="text-muted-foreground mt-0.5">
                  הנהג <strong>{customer.preferredDriver}</strong> ({customer.truckType})
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3.5">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold text-amber-900">דגשי אתר והגבלות גישה לפריקה:</div>
                <ul className="mt-1 list-disc list-inside text-amber-800 space-y-0.5">
                  {customer.accessNotes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 2. 1:1 Deposit Ledger Card */}
        <section className="rounded-3xl bg-card p-6 shadow-card border border-border/70">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-bold">ניהול יתרות פקדונות 1:1</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                אימות והצלבה שוטפת של שקי בלה (60002) ומשטחי עץ סבן (60060)
              </p>
            </div>

            <button
              onClick={() => setShowCreditModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition active:scale-95"
            >
              <PlusCircle className="h-4 w-4" />
              <span>הנפק זיכוי פקדונות מהשטח</span>
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Big bags 60002 */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-amber-600" />
                  <span className="font-bold text-sm text-amber-900">שקי בלה (מק״ט 60002)</span>
                </div>
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  מעקב 1:1
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-card p-2 shadow-xs">
                  <span className="text-[11px] text-muted-foreground block">חויבו</span>
                  <span className="font-display text-lg font-bold">
                    {customer.depositLedger.bales60002.billed}
                  </span>
                </div>
                <div className="rounded-xl bg-card p-2 shadow-xs">
                  <span className="text-[11px] text-muted-foreground block">הוחזרו</span>
                  <span className="font-display text-lg font-bold text-emerald-600">
                    {customer.depositLedger.bales60002.returned}
                  </span>
                </div>
                <div className="rounded-xl bg-amber-500/20 p-2 shadow-xs border border-amber-500/40">
                  <span className="text-[11px] font-bold text-amber-900 block">יתרה בשטח</span>
                  <span className="font-display text-xl font-extrabold text-amber-800">
                    {customer.depositLedger.bales60002.openBalance}
                  </span>
                </div>
              </div>
            </div>

            {/* Pallets 60060 */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-emerald-600" />
                  <span className="font-bold text-sm text-emerald-900">
                    משטחי עץ סבן (מק״ט 60060)
                  </span>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  מעקב 1:1
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-card p-2 shadow-xs">
                  <span className="text-[11px] text-muted-foreground block">חויבו</span>
                  <span className="font-display text-lg font-bold">
                    {customer.depositLedger.pallets60060.billed}
                  </span>
                </div>
                <div className="rounded-xl bg-card p-2 shadow-xs">
                  <span className="text-[11px] text-muted-foreground block">הוחזרו</span>
                  <span className="font-display text-lg font-bold text-emerald-600">
                    {customer.depositLedger.pallets60060.returned}
                  </span>
                </div>
                <div className="rounded-xl bg-emerald-500/20 p-2 shadow-xs border border-emerald-500/40">
                  <span className="text-[11px] font-bold text-emerald-900 block">יתרה בשטח</span>
                  <span className="font-display text-xl font-extrabold text-emerald-800">
                    {customer.depositLedger.pallets60060.openBalance}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Canonical Google Drive Folders Navigator */}
        <section className="rounded-3xl bg-card p-6 shadow-card border border-border/70 space-y-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5 text-amber-500" />
                <h2 className="font-display text-xl font-bold">סייר Google Drive קנוני</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                מסלול: תיקיות לקוחות / [{customer.id}] - {customer.name}
              </p>
            </div>

            {/* Folder switcher tabs */}
            <div className="flex rounded-2xl bg-muted/60 p-1 text-xs font-bold">
              <button
                onClick={() => setActiveFolder("orders")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${
                  activeFolder === "orders"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Folder className="h-4 w-4 text-blue-500" />
                <span>1. הזמנות ({customer.ordersHistory.length})</span>
              </button>

              <button
                onClick={() => setActiveFolder("notes")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${
                  activeFolder === "notes"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Folder className="h-4 w-4 text-amber-500" />
                <span>2. תעודות משלוח ({deliveryNotes.length})</span>
              </button>

              <button
                onClick={() => setActiveFolder("invoices")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${
                  activeFolder === "invoices"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Folder className="h-4 w-4 text-emerald-500" />
                <span>3. הצעות מחיר וחשבוניות ({customer.invoicesHistory.length})</span>
              </button>
            </div>
          </div>

          {/* Folder Content 1: Orders */}
          {activeFolder === "orders" && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                <span>רשימת הזמנות קומקס ERP פעילות והיסטוריות:</span>
                <span>סה״כ {customer.ordersHistory.length} הזמנות</span>
              </div>

              <div className="space-y-3">
                {customer.ordersHistory.map((o) => (
                  <div
                    key={o.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 transition hover:bg-muted/30 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-primary">
                          הזמנה #{o.id}
                        </span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {o.date.split("-").reverse().join("/")}
                        </span>
                        <span className="rounded-md bg-emerald-500/15 text-emerald-700 px-2 py-0.5 text-xs font-bold">
                          {o.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {o.itemsCount} פריטים · משקל כולל: <strong>{o.weightTons} טון</strong>
                        {o.driverName && ` · נהג: ${o.driverName}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-display text-lg font-bold text-foreground">
                        {ils(o.totalIls)}
                      </span>
                      <button
                        onClick={() => setSelectedOrder(o)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-card border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>מניפסט פריטים</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Folder Content 2: Delivery Notes */}
          {activeFolder === "notes" && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                <span>תעודות משלוח חתומות שנסרקו והוצלבו מול איתוראן וקומקס:</span>
                <span>{deliveryNotes.length} תעודות</span>
              </div>

              {deliveryNotes.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                  אין תעודות משלוח פתוחות ללקוח זה במאגר הנוכחי
                </div>
              ) : (
                <div className="space-y-3">
                  {deliveryNotes.map((n) => {
                    const audit = auditNote(n);
                    const ap = approvalsState[n.id];
                    return (
                      <div
                        key={n.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 transition hover:bg-muted/30 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-foreground">
                              ת.מ. #{n.id}
                            </span>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                              {n.date.split("-").reverse().join("/")}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                                audit.status === "ok"
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : "bg-amber-500/15 text-amber-700"
                              }`}
                            >
                              {audit.status === "ok" ? "🟢 אומת 100%" : "⚠️ חריגת איתוראן"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            הזמנת קומקס #{n.comaxOrder} · שעת חתימה: {n.signedAt} · {n.items.length}{" "}
                            שורות
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs">
                            <span className="font-display text-base font-bold text-foreground block">
                              {ils(noteTotal(n))}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {ap?.harel
                                ? "👑 אושר ע״י הראל"
                                : ap?.rami
                                  ? "✍️ נחתם ע״י ראמי"
                                  : "ממתין לבדיקה"}
                            </span>
                          </div>

                          <Link
                            to="/notes/$id"
                            params={{ id: n.id }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 transition"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>פתח תעודה</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Folder Content 3: Invoices & Price Quotes */}
          {activeFolder === "invoices" && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                <span>מסמכי הנהלת חשבונות (לינה הנה״ח) ותעודות זיכוי:</span>
                <span>{customer.invoicesHistory.length} קבצים</span>
              </div>

              <div className="space-y-3">
                {customer.invoicesHistory.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 transition hover:bg-muted/30 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <FileCheck className="h-4 w-4 text-emerald-600" />
                        <span className="font-bold text-sm text-foreground">
                          {inv.type} #{inv.invoiceNo}
                        </span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {inv.date.split("-").reverse().join("/")}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                            inv.status === "שולם"
                              ? "bg-emerald-500/15 text-emerald-700"
                              : inv.status === "זוכה"
                                ? "bg-purple-500/15 text-purple-700"
                                : "bg-amber-500/15 text-amber-700"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        הופק ע״י {inv.issuedBy} · קובץ:{" "}
                        <span className="font-mono">{inv.pdfName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-display text-base font-bold text-foreground">
                        {ils(inv.amountIls)}
                      </span>
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-card border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>צפה במסמך</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Order Manifest Dialog */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-3xl bg-card p-6 text-card-foreground shadow-2xl border border-border">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h3 className="font-display text-xl font-bold">
                  מניפסט הזמנת קומקס #{selectedOrder.id}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  תאריך: {selectedOrder.date.split("-").reverse().join("/")} · משקל:{" "}
                  {selectedOrder.weightTons} טון
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
              {selectedOrder.items.map((it, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-xs"
                >
                  <div>
                    <span className="font-mono text-[11px] text-muted-foreground block">
                      מק״ט {it.sku}
                    </span>
                    <span className="font-bold text-foreground">{it.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold">
                      {it.qty} {it.unit}
                    </span>
                    <span className="text-muted-foreground block">{ils(it.price * it.qty)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t pt-4">
              <div>
                <span className="text-xs text-muted-foreground block">סה״כ לתשלום</span>
                <span className="font-display text-2xl font-extrabold text-foreground">
                  {ils(selectedOrder.totalIls)}
                </span>
              </div>
              <button
                onClick={() => {
                  toast.success(`קובץ PDF להזמנה #${selectedOrder.id} הורד בהצלחה`);
                  setSelectedOrder(null);
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition"
              >
                <Download className="h-4 w-4" />
                <span>הורד PDF רשמי</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Viewer Dialog */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-3xl bg-card p-6 text-card-foreground shadow-2xl border border-border">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h3 className="font-display text-xl font-bold">
                  {selectedInvoice.type} #{selectedInvoice.invoiceNo}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  הופק ע״י {selectedInvoice.issuedBy} בתאריך{" "}
                  {selectedInvoice.date.split("-").reverse().join("/")}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-muted/40 p-4 text-center space-y-2 border border-border/50">
              <FileCheck className="mx-auto h-12 w-12 text-emerald-600" />
              <div className="font-display text-2xl font-extrabold text-foreground">
                {ils(selectedInvoice.amountIls)}
              </div>
              <div className="text-xs font-medium text-emerald-700 bg-emerald-500/10 rounded-full py-1 px-3 inline-block">
                סטטוס: {selectedInvoice.status}
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                קובץ שמור ב-Google Drive: <strong>{selectedInvoice.pdfName}</strong>
              </p>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="flex-1 rounded-2xl border border-border py-2.5 text-xs font-bold hover:bg-muted"
              >
                סגור
              </button>
              <button
                onClick={() => {
                  toast.success(`קובץ ${selectedInvoice.pdfName} נשלח להדפסה`);
                  setSelectedInvoice(null);
                }}
                className="flex-1 rounded-2xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
              >
                הדפס מסמך
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Deposit Credit Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-3xl bg-card p-6 text-card-foreground shadow-2xl border border-border">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h3 className="font-display text-xl font-bold">הנפקת זיכוי פקדונות מהשטח</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  העברה ישירה ללינה בהנהלת חשבונות לצורך הפקת תעודת זיכוי
                </p>
              </div>
              <button
                onClick={() => setShowCreditModal(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  כמות שקי בלה להחזרה וזיכוי (מק״ט 60002):
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={creditBales}
                  onChange={(e) => setCreditBales(Number(e.target.value))}
                  className="w-full rounded-2xl border bg-muted/40 p-3 text-sm font-bold text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  כמות משטחי עץ להחזרה וזיכוי (מק״ט 60060):
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={creditPallets}
                  onChange={(e) => setCreditPallets(Number(e.target.value))}
                  className="w-full rounded-2xl border bg-muted/40 p-3 text-sm font-bold text-foreground"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  הערות הנהג / סדרן מהשטח:
                </label>
                <textarea
                  placeholder="למשל: נאספו 4 משטחים שלמים מאתר רמת גן ע״י חכמת..."
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  className="w-full rounded-2xl border bg-muted/40 p-3 text-xs text-foreground focus:outline-none"
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowCreditModal(false)}
                className="flex-1 rounded-2xl border border-border py-3 text-xs font-bold hover:bg-muted"
              >
                ביטול
              </button>
              <button
                onClick={handleIssueDepositCredit}
                className="flex-1 rounded-2xl bg-primary py-3 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
              >
                שגר זיכוי ללינה 📋
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
