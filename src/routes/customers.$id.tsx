/**
 * /customers/$id — תיק לקוח חי: תעודות + הזמנות + קישורי Drive מ-GAS
 * מפתח: מספר לקוח (customerNo)
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers/$id")({
  head: ({ params }) => ({
    meta: [{ title: `תיק לקוח ${params.id} — ח. סבן` }],
  }),
  component: CustomerDetailView,
});

function CustomerDetailView() {
  const { id } = Route.useParams();

  const q = useQuery({
    queryKey: ["customer-bundle", id],
    queryFn: () => getCustomerBundleFn({ data: { customerNo: id } }),
    staleTime: 30_000,
  });

  const customer = q.data?.customer;
  const notes = (q.data?.notes || []) as Record<string, unknown>[];
  const orders = (q.data?.orders || []) as Record<string, unknown>[];
  const documents = (q.data?.documents || []) as Record<string, unknown>[];

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
        <Link to="/customers" className="mt-4 inline-flex gap-2 text-primary font-bold">
          <ArrowRight className="h-4 w-4" /> חזרה
        </Link>
      </div>
    );
  }

  const name = customer?.name || `לקוח ${id}`;
  const address = customer?.address || "";
  const phone = customer?.phone || "";
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  const wa = phoneDigits ? `972${phoneDigits.slice(-9)}` : "";

  return (
    <>
      <PageHeader
        title={`תיק לקוח: ${name}`}
        subtitle={`מספר לקוח ${id} · מקור: גיליון GAS`}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} />
              רענון
            </button>
            <Link
              to="/customers"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold"
            >
              <ArrowRight className="h-4 w-4" />
              כל הלקוחות
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
        {/* פרופיל */}
        <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-card">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <span className="font-mono text-xs font-bold text-muted-foreground">
                קומקס #{id}
              </span>
              <h1 className="font-display text-2xl font-extrabold md:text-3xl">{name}</h1>
              {address && (
                <p className="mt-1 text-sm text-muted-foreground">{address}</p>
              )}
              {customer?.preferredDriver && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs">
                  <Truck className="h-3.5 w-3.5 text-primary" />
                  נהג אחרון: <strong>{customer.preferredDriver}</strong>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <CustomerDocumentUpload customerNo={id} customerName={name} />
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-2 rounded-2xl bg-muted/80 px-4 py-3 text-xs font-bold"
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
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-700"
                >
                  <MessageSquare className="h-4 w-4" />
                  וואטסאפ
                </a>
              )}
              {address && (
                <a
                  href={`https://waze.com/ul?q=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-xs font-bold text-blue-700"
                >
                  <Navigation className="h-4 w-4" />
                  Waze
                </a>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/50 pt-4 sm:grid-cols-3">
            <Stat label="תעודות" value={String(notes.length)} />
            <Stat label="הזמנות" value={String(orders.length)} />
            <Stat
              label="תעודה אחרונה"
              value={customer?.lastNoteId || "—"}
              mono
            />
          </div>
        </section>

        {/* מסמכים שהועלו לתיק הלקוח */}
        <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-6 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-bold">
                מסמכים בתיק הלקוח ({documents.length})
              </h2>
            </div>
            <span className="text-[11px] text-muted-foreground">מתעדכן לאחר העלאה</span>
          </div>
          {documents.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              עדיין לא הועלו מסמכים דרך נועה
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc, index) => (
                <div
                  key={String(doc.fileId || (String(doc.fileName || "מסמך") + "-" + index))}
                  className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{String(doc.originalFileName || doc.fileName || "מסמך")}</span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {String(doc.docTypeLabel || "מסמך")}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {doc.uploadedAt ? new Date(String(doc.uploadedAt)).toLocaleString("he-IL") : ""}
                      {doc.status ? " · " + String(doc.status) : ""}
                    </p>
                  </div>
                  {doc.driveUrl ? (
                    <a
                      href={String(doc.driveUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      פתיחת מסמך
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* תעודות משלוח חיות */}
        <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-6 shadow-card">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-500" />
            <h2 className="font-display text-xl font-bold">
              תעודות משלוח ({notes.length})
            </h2>
          </div>
          {notes.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              אין תעודות עם מספר לקוח {id} בגיליון
            </p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => {
                const noteId = String(n.id || n.docNumber || "");
                const driveUrl = String(n.driveUrl || n.signedUrl || "");
                const fileId = String(n.fileId || "");
                return (
                  <div
                    key={noteId}
                    className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold">ת.מ. {noteId}</span>
                        {n.date ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                            {String(n.date)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {n.comaxOrder ? `הזמנה ${String(n.comaxOrder)} · ` : ""}
                        {n.driver ? `נהג: ${String(n.driver)}` : ""}
                        {n.craneNotes || n.craneTime
                          ? ` · מנוף: ${String(n.craneNotes || n.craneTime)}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to="/notes/$id"
                        params={{ id: noteId }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        פתח תעודה
                      </Link>
                      {(driveUrl || fileId) && (
                        <a
                          href={
                            driveUrl ||
                            `https://drive.google.com/file/d/${fileId}/view`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Drive
                        </a>
                      )}
                      <Link
                        to="/inquiry"
                        search={{ task: noteId }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-800"
                      >
                        בירור
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* הזמנות */}
        <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-6 shadow-card">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-500" />
            <h2 className="font-display text-xl font-bold">
              הזמנות ({orders.length})
            </h2>
          </div>
          {orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              אין הזמנות משויכות (בדקו עמודת מס׳ לקוח בטאב ההזמנות)
            </p>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <div
                  key={String(o.id)}
                  className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/20 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <span className="font-mono text-sm font-bold text-primary">
                      הזמנה #{String(o.id)}
                    </span>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {o.date ? String(o.date) : ""}
                      {o.status ? ` · ${String(o.status)}` : ""}
                      {o.driver ? ` · ${String(o.driver)}` : ""}
                    </div>
                    {o.address ? (
                      <div className="text-xs text-muted-foreground">
                        {String(o.address)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-muted/40 p-3 text-center">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-lg font-extrabold",
          mono && "font-mono text-sm",
        )}
      >
        {value}
      </div>
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
          className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
          {error ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : !busy ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : null}
          {message}
        </p>
      )}
    </div>
  );
}
