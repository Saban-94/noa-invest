/**
 * /ituran — דשבורד איתוראן v2.1
 *
 * מקורות:
 *  תעודות  → fetchLiveNotes → ארכיון_תעודות_גליה (getNotes)
 *  עצירות  → getIturanStops / getIturanVisits (ביקורים_איתוראן)
 *           → XLSX שהועלה → SAMPLE רק כגיבוי
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  formatNoteDate,
  visitsToStops,
  type GpsStop,
  type IturanVisit,
  type AuditStatus,
} from "@/lib/ituran";
import { listIturanVisitsFn, listIturanStopsFn } from "@/lib/ituran-api.functions";
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
        content: "הצלבת זמני שהייה באיתוראן מול כתובות תעודות · ביקורים_איתוראן + ארכיון",
      },
    ],
  }),
  component: IturanPage,
});

type Tab = "match" | "hikmat" | "ali" | "upload";
type StopsSource = "sheet-stops" | "sheet-visits" | "upload" | "sample";

function statusIcon(s: AuditStatus) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function IturanPage() {
  const [tab, setTab] = useState<Tab>("match");
  const [search, setSearch] = useState("");
  const [uploadedStops, setUploadedStops] = useState<GpsStop[] | null>(null);

  const notesQuery = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-ituran"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
  });

  const visitsQuery = useQuery({
    queryKey: ["ituran-visits"],
    queryFn: () => listIturanVisitsFn(),
    staleTime: 60_000,
    retry: 1,
  });

  const stopsQuery = useQuery({
    queryKey: ["ituran-stops"],
    queryFn: () => listIturanStopsFn(),
    staleTime: 60_000,
    retry: 1,
  });

  const notes = notesQuery.data || [];
  const sheetVisits: IturanVisit[] = visitsQuery.data?.visits || [];

  const { activeStops, stopsSource } = useMemo(() => {
    if (uploadedStops?.length) {
      return { activeStops: uploadedStops, stopsSource: "upload" as StopsSource };
    }
    const fromProps = stopsQuery.data?.stops || [];
    if (fromProps.length) {
      return { activeStops: fromProps, stopsSource: "sheet-stops" as StopsSource };
    }
    const fromVisits = visitsToStops(sheetVisits);
    if (fromVisits.length) {
      return { activeStops: fromVisits, stopsSource: "sheet-visits" as StopsSource };
    }
    return { activeStops: SAMPLE_STOPS, stopsSource: "sample" as StopsSource };
  }, [uploadedStops, stopsQuery.data, sheetVisits]);

  const matched = useMemo(() => {
    return notes.map((note) => {
      const pre = sheetVisits.find((v) => String(v.docNumber) === String(note.id));
      if (pre && pre.itArrive) {
        return {
          note,
          plate: normalizePlate(pre.truck) || plateOfDriver(note.driver),
          kind: kindOfPlate(pre.truck || plateOfDriver(note.driver)),
          status: pre.status,
          dwell: pre.itStop || null,
          label: visitStatusLabel(pre.status),
          stop: {
            plate: pre.truck,
            address: pre.itAddr || pre.address,
            arrive: pre.itArrive,
            depart: pre.itDepart,
            driver: pre.driver,
            durationMin: pre.itStop,
          } as GpsStop,
          fromSheet: true,
        };
      }

      const plate =
        normalizePlate(String((note as { truck?: string }).truck || "")) ||
        plateOfDriver(note.driver) ||
        DRIVER_FLEET.hikmat.plate;
      const kind = kindOfPlate(plate);
      const result = crossMatch(
        { ...note, siteAddress: note.siteAddress, date: note.date },
        kind,
        plate,
        activeStops,
      );
      return { note, plate, kind, ...result, fromSheet: false };
    });
  }, [notes, activeStops, sheetVisits]);

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
    return {
      total: matched.length,
      ok: matched.filter((m) => m.status === "ok").length,
      warn: matched.filter((m) => m.status === "warn").length,
      fail: matched.filter((m) => m.status === "fail").length,
    };
  }, [matched]);

  const byDriver = useMemo(() => groupStopsByDriver(activeStops), [activeStops]);

  const sourceLabel: Record<StopsSource, string> = {
    "sheet-stops": `גיליון · דוח אחרון (${activeStops.length} עצירות)`,
    "sheet-visits": `גיליון · ביקורים_איתוראן (${activeStops.length})`,
    upload: `קובץ שהועלה (${activeStops.length} עצירות)`,
    sample: `SAMPLE בלבד (${activeStops.length}) — אין נתוני גיליון`,
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const wsname = wb.SheetNames[0];
        if (!wsname) throw new Error("גיליון ריק");
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wsname]!, {
          defval: "",
        });
        const stops = rowsToStops(rows);
        if (!stops.length) throw new Error("לא נמצאו עצירות בקובץ");
        setUploadedStops(stops);
        toast.success(`נטענו ${stops.length} עצירות מדוח איתוראן`);
        setTab("match");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "פענוח הקובץ נכשל");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const refetchAll = () => {
    void notesQuery.refetch();
    void visitsQuery.refetch();
    void stopsQuery.refetch();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
      <PageHeader
        title="איתוראן GPS · הצלבת שהיות"
        subtitle="ארכיון_תעודות_גליה × ביקורים_איתוראן · חכמת / עלי"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={refetchAll}
              disabled={notesQuery.isFetching || visitsQuery.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${notesQuery.isFetching ? "animate-spin" : ""}`}
              />
              רענון מהגיליון
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted">
              <Upload className="h-4 w-4" />
              העלאת XLSX
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "תעודות בבדיקה", value: stats.total, icon: Disc, color: "text-foreground" },
          { label: "אומתו", value: stats.ok, icon: CheckCircle2, color: "text-emerald-700" },
          { label: "סטיית זמן", value: stats.warn, icon: AlertTriangle, color: "text-amber-700" },
          { label: "לא הותאמו", value: stats.fail, icon: XCircle, color: "text-red-700" },
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

      <div
        className={`rounded-2xl border px-4 py-3 text-xs ${
          stopsSource === "sample"
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-border/60 bg-muted/30 text-muted-foreground"
        }`}
      >
        <Satellite className="ml-1 inline h-3.5 w-3.5" />
        מקור עצירות: <strong className="text-foreground">{sourceLabel[stopsSource]}</strong>
        {" · "}
        תעודות: <strong className="text-foreground">ארכיון_תעודות_גליה</strong>
        {" · "}
        חכמת: {byDriver.hikmat.length} · עלי: {byDriver.ali.length}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["match", "הצלבת תעודות"],
            ["hikmat", DRIVER_FLEET.hikmat.label],
            ["ali", DRIVER_FLEET.ali.label],
            ["upload", "מקורות והעלאה"],
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
              placeholder="חיפוש לקוח / כתובת / תעודה..."
              className="pr-9"
            />
          </div>
          <div className="space-y-3">
            {notesQuery.isLoading ? (
              <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
                טוען תעודות מארכיון_תעודות_גליה...
              </Card>
            ) : filtered.length === 0 ? (
              <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
                אין תעודות להצגה
              </Card>
            ) : (
              filtered.map((m) => (
                <Card
                  key={m.note.id}
                  className="rounded-2xl border-border/70 p-4 shadow-sm hover:bg-muted/20"
                >
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
                        {formatNoteDate(m.note.date)}
                      </span>
                      <span className="text-xs font-semibold">
                        {visitStatusLabel(m.status)}
                      </span>
                      {m.fromSheet && (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          מהגיליון
                        </span>
                      )}
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
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
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
        <Card className="space-y-4 rounded-3xl border-border p-6 text-sm">
          <h3 className="font-display text-base font-bold">מקורות נתונים</h3>
          <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">
            <li>
              <strong className="text-foreground">תעודות</strong> — ארכיון_תעודות_גליה (getNotes)
            </li>
            <li>
              <strong className="text-foreground">עצירות 1</strong> — getIturanStops (Properties אחרי
              pollIturan)
            </li>
            <li>
              <strong className="text-foreground">עצירות 2</strong> — ביקורים_איתוראן (getIturanVisits)
            </li>
            <li>
              <strong className="text-foreground">עצירות 3</strong> — העלאת XLSX
            </li>
            <li>
              <strong className="text-foreground">גיבוי</strong> — SAMPLE_STOPS
            </li>
          </ul>
          <p className="text-xs">
            מצב: <strong>{sourceLabel[stopsSource]}</strong>
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">
            <Upload className="h-4 w-4" />
            בחר StopReportWithMessage_….xlsx
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          </label>
          {uploadedStops && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUploadedStops(null);
                toast.info("חזרה למקור גיליון");
              }}
            >
              נקה קובץ
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
    const p =
      plateOfDriver(n.driver) ||
      normalizePlate(String((n as { truck?: string }).truck || ""));
    return p.replace(/\D/g, "") === fleet.plate.replace(/\D/g, "");
  });

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold">{fleet.label}</h3>
            <p className="text-xs text-muted-foreground">
              {stops.length} עצירות · {relatedNotes.length} תעודות
            </p>
          </div>
          <Truck className="h-8 w-8 text-primary/50" />
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground">עצירות GPS</h4>
          {stops.map((s, i) => (
            <Card key={i} className="rounded-xl p-3 text-xs">
              <div className="font-bold">{s.address || "—"}</div>
              <div className="text-muted-foreground">
                {s.arrive}–{s.depart} · {fleet.plate}
              </div>
            </Card>
          ))}
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground">תעודות</h4>
          {relatedNotes.map((n) => (
            <Card key={n.id} className="rounded-xl p-3 text-xs">
              <Link
                to="/notes/$id"
                params={{ id: n.id }}
                className="font-mono font-bold text-primary"
              >
                ת.מ. {n.id}
              </Link>
              <div className="font-semibold">{n.customer}</div>
              <div className="text-muted-foreground">
                {n.siteAddress} · {formatNoteDate(n.date)}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
