/**
 * /ituran — דשבורד איתוראן v2
 * הצלבת כתובות תעודות ↔ עצירות GPS · היסטוריית חכמת / עלי · העלאת XLSX
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import {
  crossMatch,
  rowsToStops,
  SAMPLE_STOPS,
  DRIVER_FLEET,
  groupStopsByDriver,
  visitStatusLabel,
  normalizePlate,
  plateOfDriver,
  kindOfPlate,
  type GpsStop,
  type IturanVisit,
  type AuditStatus,
} from "@/lib/ituran";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Satellite,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Truck,
  Upload,
  RefreshCw,
  Search,
  Disc,
  User,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/ituran")({
  head: () => ({
    meta: [
      { title: "איתוראן GPS — נועה ח. סבן" },
      {
        name: "description",
        content: "הצלבת זמני שהייה באיתוראן מול כתובות תעודות משלוח · חכמת ועלי",
      },
    ],
  }),
  component: IturanPage,
});

type Tab = "match" | "hikmat" | "ali" | "upload";

function statusIcon(s: AuditStatus) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function IturanPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("match");
  const [search, setSearch] = useState("");
  const [customStops, setCustomStops] = useState<GpsStop[] | null>(null);
  const [serverVisits, setServerVisits] = useState<IturanVisit[] | null>(null);

  const {
    data: notes = [],
    isFetching,
    refetch,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-ituran"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
  });

  const activeStops = customStops || SAMPLE_STOPS;

  const matched = useMemo(() => {
    return notes.map((note) => {
      const plate =
        normalizePlate(String((note as any).truck || "")) ||
        plateOfDriver(note.driver) ||
        DRIVER_FLEET.hikmat.plate;
      const kind = kindOfPlate(plate);
      const result = crossMatch(
        {
          ...note,
          siteAddress: note.siteAddress,
        },
        kind,
        plate,
        activeStops,
      );
      return { note, plate, kind, ...result };
    });
  }, [notes, activeStops]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matched.filter((m) => {
      if (!q) return true;
      return (
        m.note.customer.toLowerCase().includes(q) ||
        (m.note.siteAddress || "").toLowerCase().includes(q) ||
        m.note.id.includes(q) ||
        (m.note.driver || "").toLowerCase().includes(q) ||
        m.plate.includes(q)
      );
    });
  }, [matched, search]);

  const stats = useMemo(() => {
    const total = matched.length;
    const ok = matched.filter((m) => m.status === "ok").length;
    const warn = matched.filter((m) => m.status === "warn").length;
    const fail = matched.filter((m) => m.status === "fail").length;
    return { total, ok, warn, fail };
  }, [matched]);

  const byDriver = useMemo(() => groupStopsByDriver(activeStops), [activeStops]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        if (!wsname) throw new Error("גיליון ריק");
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: "",
        });
        const stops = rowsToStops(rows);
        if (!stops.length) {
          // ניסיון: עמודות בעברית מדויקות מדוח StopReport
          const alt = rows
            .map((r) => {
              const plate = normalizePlate(
                String(r["תג זיהוי"] || r["רכב"] || r["מספר רישוי"] || ""),
              );
              const addr = String(r["כתובת"] || "");
              const arrive = String(r["זמן הודעה"] || "").match(/\d{1,2}:\d{2}/)?.[0];
              const depart = String(r["זמן סיום עצירה"] || "").match(/\d{1,2}:\d{2}/)?.[0];
              if (!plate || !depart) return null;
              return {
                plate,
                address: addr,
                arrive: arrive || "08:00",
                depart,
                driver: String(r["שם נהג"] || ""),
              } as GpsStop;
            })
            .filter(Boolean) as GpsStop[];
          if (!alt.length) throw new Error("לא נמצאו עצירות בקובץ");
          setCustomStops(alt);
          toast.success(`נטענו ${alt.length} עצירות מדוח איתוראן`);
        } else {
          setCustomStops(stops);
          toast.success(`נטענו ${stops.length} עצירות מדוח איתוראן`);
        }
        setTab("match");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "פענוח הקובץ נכשל");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
      <PageHeader
        title="איתוראן GPS · הצלבת שהיות"
        subtitle="אימות כתובות תעודות משלוח מול דוח 24 שעות · חכמת (מנוף) ועלי (פלטה)"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              רענון תעודות
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted">
              <Upload className="h-4 w-4" />
              העלאת XLSX איתוראן
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        }
      />

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "תעודות בבדיקה",
            value: stats.total,
            icon: Disc,
            color: "text-foreground",
          },
          {
            label: "אומתו באיתוראן",
            value: stats.ok,
            icon: CheckCircle2,
            color: "text-emerald-700",
          },
          {
            label: "סטיית זמן",
            value: stats.warn,
            icon: AlertTriangle,
            color: "text-amber-700",
          },
          {
            label: "לא הותאמו",
            value: stats.fail,
            icon: XCircle,
            color: "text-red-700",
          },
        ].map((k) => (
          <Card key={k.label} className="rounded-2xl border-border/70 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground">{k.label}</div>
                <div className={`mt-1 font-display text-2xl font-extrabold ${k.color}`}>
                  {k.value}
                </div>
              </div>
              <k.icon className={`h-8 w-8 opacity-40 ${k.color}`} />
            </div>
          </Card>
        ))}
      </div>

      {/* מקור נתונים */}
      <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <Satellite className="mr-1 inline h-3.5 w-3.5" />
        מקור עצירות:{" "}
        <strong className="text-foreground">
          {customStops ? `קובץ שהועלה (${customStops.length} עצירות)` : "SAMPLE / דוח אחרון מהשרת"}
        </strong>
        {" · "}
        חכמת: {byDriver.hikmat.length} עצירות · עלי: {byDriver.ali.length} עצירות
        {serverVisits ? ` · ביקורים מהגיליון: ${serverVisits.length}` : ""}
      </div>

      {/* טאבים */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["match", "הצלבת תעודות"],
            ["hikmat", DRIVER_FLEET.hikmat.label],
            ["ali", DRIVER_FLEET.ali.label],
            ["upload", "העלאה והסבר"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
              tab === id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "match" && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לקוח / כתובת / תעודה / נהג..."
              className="pr-9"
            />
          </div>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
                אין תעודות להצגה. ודא חיבור לגיליון או העלה דוח איתוראן.
              </Card>
            ) : (
              filtered.map((m) => (
                <Card
                  key={m.note.id}
                  className="rounded-2xl border-border/70 p-4 shadow-sm transition hover:bg-muted/20"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {statusIcon(m.status)}
                        <Link
                          to="/notes/$id"
                          params={{ id: m.note.id }}
                          className="font-mono text-sm font-bold text-primary hover:underline"
                        >
                          ת.מ. {m.note.id}
                        </Link>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {m.note.date}
                        </span>
                        <span className="text-xs font-semibold">{visitStatusLabel(m.status)}</span>
                      </div>
                      <div className="text-sm font-bold">{m.note.customer}</div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {m.note.siteAddress || "ללא כתובת"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {m.note.driver || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5" />
                          {m.plate} · {m.kind === "crane" ? "מנוף" : "פלטה"}
                        </span>
                      </div>
                      {m.stop && (
                        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-foreground/80">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            GPS: {m.stop.arrive}–{m.stop.depart}
                            {m.dwell != null ? ` · ${m.dwell} דק׳` : ""}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {m.stop.address}
                          </span>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">{m.label}</p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {(tab === "hikmat" || tab === "ali") && (
        <DriverHistory
          driverId={tab}
          stops={tab === "hikmat" ? byDriver.hikmat : byDriver.ali}
          notes={notes}
        />
      )}

      {tab === "upload" && (
        <Card className="space-y-4 rounded-3xl border-border p-6 text-sm leading-relaxed">
          <h3 className="font-display text-base font-bold">איך עובד הסנכרון</h3>
          <ol className="list-decimal space-y-2 pr-5 text-muted-foreground">
            <li>
              מייל יומי מ-<code className="text-foreground">call@ituran.info</code> עם דוח 24 שעות
              (XLSX) — מעובד ב-Apps Script ע״י <code className="text-foreground">pollIturan</code>.
            </li>
            <li>
              הפרסור (<code>parseIturan_</code>) מחלץ עצירות + PTO לפי לוחית 615-41-002 / 651-51-701.
            </li>
            <li>
              ההצלבה (<code>matchIturan_</code>) משווה רחוב+מספר+עיר מול{" "}
              <strong>כתובת אספקה</strong> בתעודה וכותבת לטאב{" "}
              <code className="text-foreground">ביקורים_איתוראן</code>.
            </li>
            <li>כאן בדשבורד: העלאה ידנית של אותו XLSX או נתונים מהגיליון אחרי הסנכרון.</li>
          </ol>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">
            <Upload className="h-4 w-4" />
            בחר קובץ StopReportWithMessage_….xlsx
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          </label>
          {customStops && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCustomStops(null);
                toast.info("חזרה לנתוני SAMPLE");
              }}
            >
              נקה קובץ שהועלה
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

function DriverHistory({
  driverId,
  stops,
  notes,
}: {
  driverId: "hikmat" | "ali";
  stops: GpsStop[];
  notes: DeliveryNote[];
}) {
  const fleet = DRIVER_FLEET[driverId];
  const relatedNotes = notes.filter((n) => {
    const p = plateOfDriver(n.driver) || normalizePlate(String((n as any).truck || ""));
    return p.replace(/\D/g, "") === fleet.plate.replace(/\D/g, "");
  });

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold">{fleet.label}</h3>
            <p className="text-xs text-muted-foreground">
              {stops.length} עצירות בדוח · {relatedNotes.length} תעודות משויכות לפי נהג/לוחית
            </p>
          </div>
          <Truck className="h-8 w-8 text-primary/50" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground">עצירות GPS</h4>
          {stops.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין עצירות לנהג זה בדוח הנוכחי</p>
          ) : (
            stops.map((s, i) => (
              <Card key={i} className="rounded-xl border-border/50 p-3 text-xs">
                <div className="font-bold">{s.address || "ללא כתובת"}</div>
                <div className="mt-1 flex gap-3 text-muted-foreground">
                  <span>
                    {s.arrive}–{s.depart}
                  </span>
                  <span>{fleet.plate}</span>
                </div>
              </Card>
            ))
          )}
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground">תעודות משלוח משויכות</h4>
          {relatedNotes.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין תעודות חיות עם לוחית זו</p>
          ) : (
            relatedNotes.map((n) => (
              <Card key={n.id} className="rounded-xl border-border/50 p-3 text-xs">
                <Link
                  to="/notes/$id"
                  params={{ id: n.id }}
                  className="font-mono font-bold text-primary hover:underline"
                >
                  ת.מ. {n.id}
                </Link>
                <div className="mt-0.5 font-semibold">{n.customer}</div>
                <div className="text-muted-foreground">{n.siteAddress}</div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
