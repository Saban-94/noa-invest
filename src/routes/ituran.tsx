/**
 * /ituran — מרכז מודיעין לוגיסטי
 * מקורות: תעודות, ביקורים_איתוראן, עצירות, PTO, אתרי_לקוחות
 * אין SAMPLE במסך הראשי. אין שינוי GAS.
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
  DRIVER_FLEET,
  groupStopsByDriver,
  visitStatusLabel,
  normalizePlate,
  plateOfDriver,
  kindOfPlate,
  visitsToStops,
  type GpsStop,
  type IturanVisit,
  type AuditStatus,
} from "@/lib/ituran";
import { listIturanVisitsFn, listIturanStopsFn } from "@/lib/ituran-api.functions";
import { listPtoFn } from "@/lib/notes-api.functions";
import { getSiteAtlasFn } from "@/lib/customer-history.functions";
import { pairPtoEvents, analyzePto, israelTime } from "@/lib/smart-dispatch/pto-pairing";
import {
  YARDS,
  MATCH_TIER_HE,
  tierFromAudit,
  formatKm,
  formatMinutes,
  distanceToYardKm,
  type MatchTier,
} from "@/lib/logistics-intelligence";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Satellite,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Truck,
  Upload,
  RefreshCw,
  Search,
  User,
  Gauge,
  Building2,
  Filter,
  ExternalLink,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ituran")({
  head: () => ({ meta: [{ title: "מודיעין איתוראן — נועה | ח. סבן" }] }),
  component: IturanIntelligencePage,
});

type MainTab = "overview" | "match" | "pto" | "sites" | "fleet" | "sources";
type StopsSource = "sheet-stops" | "sheet-visits" | "upload" | "none";
const PTO_LOOKBACK_MS = 14 * 24 * 3600 * 1000;

function statusIcon(s: AuditStatus) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function tierBadge(tier: MatchTier) {
  const styles: Record<MatchTier, string> = {
    verified: "bg-emerald-100 text-emerald-800 border-emerald-200",
    high: "bg-sky-100 text-sky-800 border-sky-200",
    review: "bg-amber-100 text-amber-900 border-amber-200",
    unmatched: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("rounded-lg border px-2 py-0.5 text-[11px] font-bold", styles[tier])}>
      {MATCH_TIER_HE[tier]}
    </span>
  );
}

function osmEmbed(lat: number, lng: number) {
  const d = 0.03;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

function IturanIntelligencePage() {
  const [tab, setTab] = useState<MainTab>("overview");
  const [search, setSearch] = useState("");
  const [filterTruck, setFilterTruck] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterTier, setFilterTier] = useState<MatchTier | "">("");
  const [uploadedStops, setUploadedStops] = useState<GpsStop[] | null>(null);
  const [selectedSiteKey, setSelectedSiteKey] = useState("");

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
  const ptoQuery = useQuery({
    queryKey: ["ituran-pto-intel"],
    queryFn: () =>
      listPtoFn({ data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() } }),
    staleTime: 60_000,
    retry: 1,
  });
  const sitesQuery = useQuery({
    queryKey: ["site-atlas-ituran"],
    queryFn: () => getSiteAtlasFn(),
    staleTime: 60_000,
    retry: 1,
  });

  const notes = notesQuery.data || [];
  const sheetVisits: IturanVisit[] = visitsQuery.data?.visits || [];
  const sites = sitesQuery.data?.sites || [];

  const { activeStops, stopsSource } = useMemo(() => {
    if (uploadedStops?.length)
      return { activeStops: uploadedStops, stopsSource: "upload" as StopsSource };
    const fromProps = stopsQuery.data?.stops || [];
    if (fromProps.length)
      return { activeStops: fromProps, stopsSource: "sheet-stops" as StopsSource };
    const fromVisits = visitsToStops(sheetVisits);
    if (fromVisits.length)
      return { activeStops: fromVisits, stopsSource: "sheet-visits" as StopsSource };
    return { activeStops: [] as GpsStop[], stopsSource: "none" as StopsSource };
  }, [uploadedStops, stopsQuery.data, sheetVisits]);

  const ptoSessions = useMemo(() => {
    const paired = pairPtoEvents(ptoQuery.data?.events ?? []);
    return analyzePto(paired, notes).sessions;
  }, [ptoQuery.data, notes]);

  const matched = useMemo(
    () =>
      notes.map((note) => {
        const pre = sheetVisits.find((v) => String(v.docNumber) === String(note.id));
        if (pre && pre.itArrive) {
          const status = (pre.status || "ok") as AuditStatus;
          const ptoNum =
            pre.ptoMin != null && pre.ptoMin !== "" ? Number(pre.ptoMin) : null;
          return {
            note,
            plate: normalizePlate(pre.truck) || plateOfDriver(note.driver),
            kind: kindOfPlate(pre.truck || plateOfDriver(note.driver)),
            status,
            dwell: pre.itStop ?? null,
            label: visitStatusLabel(status),
            stop: {
              plate: pre.truck,
              address: pre.itAddr || pre.address,
              arrive: pre.itArrive,
              depart: pre.itDepart,
              driver: pre.driver,
              durationMin: pre.itStop,
            } as GpsStop,
            fromSheet: true,
            tier: tierFromAudit(status, true),
            ptoMin: ptoNum != null && Number.isFinite(ptoNum) ? ptoNum : null,
          };
        }
        const plate =
          normalizePlate(String((note as { truck?: string }).truck || "")) ||
          plateOfDriver(note.driver) ||
          "";
        const kind = kindOfPlate(plate);
        const result = crossMatch(
          { ...note, siteAddress: note.siteAddress, date: note.date },
          kind,
          plate,
          activeStops,
        );
        return {
          note,
          plate,
          kind,
          ...result,
          fromSheet: false,
          tier: tierFromAudit(result.status, false),
          ptoMin: null as number | null,
        };
      }),
    [notes, activeStops, sheetVisits],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matched.filter((m) => {
      if (filterTier && m.tier !== filterTier) return false;
      if (filterTruck && !String(m.plate || "").includes(filterTruck)) return false;
      if (filterDriver && !(m.note.driver || "").includes(filterDriver)) return false;
      if (filterCustomer) {
        const c = filterCustomer.toLowerCase();
        if (
          !(
            String(m.note.customerNo || "").includes(filterCustomer) ||
            (m.note.customer || "").toLowerCase().includes(c)
          )
        )
          return false;
      }
      if (!q) return true;
      return [
        m.note.id,
        m.note.customer,
        m.note.customerNo,
        m.note.siteAddress,
        m.note.driver,
        m.plate,
        m.stop?.address,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [matched, search, filterTruck, filterDriver, filterCustomer, filterTier]);

  const stats = useMemo(() => {
    const tiers = { verified: 0, high: 0, review: 0, unmatched: 0 };
    for (const m of matched) tiers[m.tier]++;
    return {
      notes: notes.length,
      stops: activeStops.length,
      visits: sheetVisits.length,
      pto: ptoSessions.length,
      sites: sites.length,
      mappedSites: sites.filter((s) => s.latitude != null && s.longitude != null).length,
      ...tiers,
    };
  }, [matched, notes, activeStops, sheetVisits, ptoSessions, sites]);

  const byDriver = useMemo(() => groupStopsByDriver(activeStops), [activeStops]);
  const selectedSite =
    sites.find((s) => (s.siteKey || `${s.city}|${s.address}`) === selectedSiteKey) || sites[0];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const stops = rowsToStops(rows);
      if (!stops.length) {
        toast.error("לא נמצאו עצירות בקובץ");
        return;
      }
      setUploadedStops(stops);
      toast.success(`נטענו ${stops.length} עצירות מהקובץ`);
    } catch {
      toast.error("שגיאה בקריאת הקובץ");
    }
  };

  const refreshAll = () => {
    void notesQuery.refetch();
    void visitsQuery.refetch();
    void stopsQuery.refetch();
    void ptoQuery.refetch();
    void sitesQuery.refetch();
  };

  const sourceLabel: Record<StopsSource, string> = {
    "sheet-stops": "getIturanStops",
    "sheet-visits": "ביקורים_איתוראן",
    upload: "קובץ שהועלה",
    none: "אין מקור עצירות חי",
  };

  return (
    <>
      <PageHeader
        title="מודיעין איתוראן"
        subtitle="GPS · PTO · אתרי לקוחות · הצלבת תעודות — מקורות גיליון בלבד"
        action={
          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted"
          >
            <RefreshCw className={cn("h-4 w-4", notesQuery.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "תעודות", value: stats.notes, color: "text-slate-800" },
            { label: "ביקורי גיליון", value: stats.visits, color: "text-sky-700" },
            { label: "עצירות GPS", value: stats.stops, color: "text-indigo-700" },
            { label: "PTO", value: stats.pto, color: "text-violet-700" },
            { label: "מאומת", value: stats.verified, color: "text-emerald-700" },
            { label: "לא משויך", value: stats.unmatched, color: "text-red-700" },
          ].map((k) => (
            <Card key={k.label} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-muted-foreground">{k.label}</div>
              <div className={cn("mt-1 font-display text-2xl font-extrabold", k.color)}>
                {k.value}
              </div>
            </Card>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {Object.values(YARDS).map((y) => (
            <Card key={y.id} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold">{y.name}</div>
                  <div className="text-sm text-muted-foreground">{y.address}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    נקודת ייחוס למרחק אווירי · לא מסלול GPS חי
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-xs",
            stopsSource === "none"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-border/60 bg-muted/30 text-muted-foreground",
          )}
        >
          <Satellite className="ml-1 inline h-3.5 w-3.5" />
          מקור עצירות: <strong className="text-foreground">{sourceLabel[stopsSource]}</strong>
          {" · "}אתרים עם קואורדינטות:{" "}
          <strong className="text-foreground">
            {stats.mappedSites}/{stats.sites}
          </strong>
          {" · "}PTO: <strong className="text-foreground">{stats.pto}</strong>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {(
            [
              ["overview", "סקירה"],
              ["match", "הצלבת תעודות"],
              ["pto", "PTO ומנוף"],
              ["sites", "אתרי לקוחות"],
              ["fleet", "צי ונהגים"],
              ["sources", "מקורות"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-bold transition",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {(tab === "match" || tab === "overview") && (
          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/60 bg-card p-3">
            <Filter className="mb-2 h-4 w-4 text-muted-foreground" />
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש תעודה, לקוח, כתובת…"
                className="pr-9"
              />
            </div>
            <Input
              value={filterTruck}
              onChange={(e) => setFilterTruck(e.target.value)}
              placeholder="רכב"
              className="w-28"
            />
            <Input
              value={filterDriver}
              onChange={(e) => setFilterDriver(e.target.value)}
              placeholder="נהג"
              className="w-28"
            />
            <Input
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              placeholder="לקוח"
              className="w-28"
            />
            <select
              value={filterTier}
              onChange={(e) => setFilterTier((e.target.value || "") as MatchTier | "")}
              className="h-10 rounded-md border border-input bg-background px-2 text-xs font-semibold"
            >
              <option value="">כל הסיווגים</option>
              {(Object.keys(MATCH_TIER_HE) as MatchTier[]).map((t) => (
                <option key={t} value={t}>
                  {MATCH_TIER_HE[t]}
                </option>
              ))}
            </select>
          </div>
        )}

        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm lg:col-span-3">
              <h3 className="font-display text-base font-bold">הצלבות אחרונות</h3>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {filtered.slice(0, 40).map((m) => (
                  <div
                    key={m.note.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-bold">
                        ת.מ. {m.note.id}
                        {m.note.customerNo ? (
                          <Link
                            to="/customers/$id"
                            params={{ id: String(m.note.customerNo) }}
                            className="mr-2 text-xs font-semibold text-sky-700 hover:underline"
                          >
                            לקוח {m.note.customerNo}
                          </Link>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.note.customer} · {m.note.siteAddress || "ללא כתובת"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {tierBadge(m.tier)}
                      <span className="text-xs text-muted-foreground">
                        שהייה: {formatMinutes(m.dwell)}
                      </span>
                    </div>
                  </div>
                ))}
                {!filtered.length && (
                  <p className="text-sm text-muted-foreground">אין רשומות בסינון הנוכחי.</p>
                )}
              </div>
            </Card>
            <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm lg:col-span-2">
              <h3 className="font-display text-base font-bold">PTO אחרונים</h3>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {ptoSessions.slice(0, 25).map((s, i) => (
                  <div
                    key={`${s.truck}-${s.openIso}-${i}`}
                    className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 font-bold">
                      <Gauge className="h-3.5 w-3.5 text-violet-600" />
                      {s.truck || "—"}
                      {s.matchedNoteId ? (
                        <span className="text-xs font-semibold text-emerald-700">
                          ת.מ. {s.matchedNoteId}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700">ללא תעודה</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {s.openIso ? israelTime(s.openIso) : "אין נתון"} –{" "}
                      {s.closeIso ? israelTime(s.closeIso) : "פתוח / אין נתון"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.address || "כתובת לא ידועה"}
                    </div>
                  </div>
                ))}
                {!ptoSessions.length && (
                  <p className="text-sm text-muted-foreground">אין אירועי PTO בטווח.</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === "match" && (
          <div className="space-y-3">
            {filtered.map((m) => (
              <Card key={m.note.id} className="rounded-2xl border-border/70 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusIcon(m.status)}
                      <span className="font-display text-base font-extrabold">
                        תעודה {m.note.id}
                      </span>
                      {tierBadge(m.tier)}
                      {m.fromSheet && (
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                          מביקורים_איתוראן
                        </span>
                      )}
                    </div>
                    <div className="text-sm">
                      {m.note.customer}
                      {m.note.customerNo ? ` · ${m.note.customerNo}` : ""}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {m.note.siteAddress || "אין כתובת"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {m.note.driver || "אין נהג"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3 w-3" />
                        {m.plate || "אין רישוי"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        שהייה: {formatMinutes(m.dwell)}
                      </span>
                      <span>PTO: {formatMinutes(m.ptoMin)}</span>
                    </div>
                    {m.stop && (
                      <div className="mt-1 text-xs text-sky-800">
                        GPS: {m.stop.arrive || "—"}–{m.stop.depart || "—"} ·{" "}
                        {m.stop.address || "—"}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">{m.label}</p>
                  </div>
                  {m.note.customerNo && (
                    <Link
                      to="/customers/$id"
                      params={{ id: String(m.note.customerNo) }}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-bold hover:bg-muted"
                    >
                      תיק לקוח <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </Card>
            ))}
            {!filtered.length && (
              <p className="text-center text-sm text-muted-foreground">אין תוצאות להצגה.</p>
            )}
          </div>
        )}

        {tab === "pto" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              מקור: איתוראן_PTO · משך PTO נפרד מזמן שהייה. חסר = «אין נתון».
            </p>
            {ptoSessions.map((s, i) => (
              <Card key={`${s.openIso}-${i}`} className="rounded-2xl border-border p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold">
                    {s.truck || "רכב לא ידוע"} · {s.driver || "נהג לא ידוע"}
                  </div>
                  {s.matchedNoteId ? (
                    <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                      משויך לת.מ. {s.matchedNoteId}
                    </span>
                  ) : (
                    <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                      ביקור לא משויך לתעודה
                    </span>
                  )}
                </div>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div>פתיחה: {s.openIso ? israelTime(s.openIso) : "אין נתון"}</div>
                  <div>סגירה: {s.closeIso ? israelTime(s.closeIso) : "אין נתון"}</div>
                  <div className="sm:col-span-2 text-muted-foreground">
                    {s.address || "מיקום לא ידוע"}
                  </div>
                </div>
              </Card>
            ))}
            {!ptoSessions.length && (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                אין אירועי PTO בטווח של 14 הימים האחרונים.
              </Card>
            )}
          </div>
        )}

        {tab === "sites" && (
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="max-h-[32rem] overflow-y-auto rounded-2xl border-border p-3 lg:col-span-2">
              <h3 className="mb-2 px-1 font-bold">אתרי לקוחות ({sites.length})</h3>
              {sites.slice(0, 80).map((s) => {
                const key = s.siteKey || `${s.city}|${s.address}`;
                const active =
                  selectedSite &&
                  ((selectedSite.siteKey || "") === (s.siteKey || "") ||
                    selectedSite.address === s.address);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedSiteKey(key)}
                    className={cn(
                      "mb-1 w-full rounded-xl px-3 py-2 text-right text-sm transition",
                      active ? "bg-sky-100 font-bold text-sky-900" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="truncate">{s.address || s.city || key}</div>
                    <div className="text-[11px] font-normal text-muted-foreground">
                      {s.customerName || s.customerNo || "—"} · ביקורים: {s.visits ?? "—"}
                    </div>
                  </button>
                );
              })}
            </Card>
            <Card className="rounded-2xl border-border p-4 shadow-sm lg:col-span-3">
              {selectedSite ? (
                <div className="space-y-3">
                  <h3 className="font-display text-lg font-extrabold">
                    {selectedSite.address || "אתר"}
                  </h3>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>לקוח: {selectedSite.customerName || "אין נתון"}</div>
                    <div>מספר: {selectedSite.customerNo || "אין נתון"}</div>
                    <div>עיר: {selectedSite.city || "אין נתון"}</div>
                    <div>ביקורים: {selectedSite.visits ?? "אין נתון"}</div>
                    <div>שהייה חציון: {formatMinutes(selectedSite.medianMin)}</div>
                    <div>
                      מרחק ממחסן החרש:{" "}
                      {formatKm(
                        distanceToYardKm(
                          selectedSite.latitude != null && selectedSite.longitude != null
                            ? { lat: selectedSite.latitude, lng: selectedSite.longitude }
                            : null,
                          "harash",
                        ),
                      )}
                    </div>
                    <div>
                      מרחק ממחסן התלמיד:{" "}
                      {formatKm(
                        distanceToYardKm(
                          selectedSite.latitude != null && selectedSite.longitude != null
                            ? { lat: selectedSite.latitude, lng: selectedSite.longitude }
                            : null,
                          "talmid",
                        ),
                      )}
                    </div>
                  </div>
                  {selectedSite.latitude != null && selectedSite.longitude != null ? (
                    <iframe
                      title="מפת אתר"
                      className="h-64 w-full rounded-xl border border-border"
                      src={osmEmbed(selectedSite.latitude, selectedSite.longitude)}
                    />
                  ) : (
                    <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
                      אין קואורדינטות בגיליון לאתר זה.
                    </p>
                  )}
                  {selectedSite.customerNo && (
                    <Link
                      to="/customers/$id"
                      params={{ id: String(selectedSite.customerNo) }}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                    >
                      פתח תיק לקוח
                    </Link>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">אין אתרים לטעינה.</p>
              )}
            </Card>
          </div>
        )}

        {tab === "fleet" && (
          <div className="grid gap-4 md:grid-cols-2">
            {(["hikmat", "ali"] as const).map((id) => (
              <Card key={id} className="rounded-2xl border-border p-4 shadow-sm">
                <h3 className="font-display text-base font-bold">{DRIVER_FLEET[id].label}</h3>
                <p className="text-xs text-muted-foreground">
                  רישוי: {DRIVER_FLEET[id].plate} · עצירות: {byDriver[id]?.length || 0}
                </p>
                <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                  {(byDriver[id] || []).slice(0, 20).map((s, i) => (
                    <div key={i} className="rounded-lg bg-muted/30 px-2 py-1.5 text-xs">
                      {s.arrive}–{s.depart} · {s.address || "—"}
                      {s.durationMin != null ? ` · ${s.durationMin} דק׳` : ""}
                    </div>
                  ))}
                  {!(byDriver[id] || []).length && (
                    <p className="text-xs text-muted-foreground">
                      אין עצירות לנהג זה במקור הפעיל.
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "sources" && (
          <Card className="space-y-4 rounded-3xl border-border p-6 text-sm">
            <h3 className="font-display text-base font-bold">מקורות נתונים</h3>
            <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">תעודות</strong> — ארכיון_תעודות_גליה
              </li>
              <li>
                <strong className="text-foreground">ביקורים</strong> — ביקורים_איתוראן
              </li>
              <li>
                <strong className="text-foreground">עצירות</strong> — getIturanStops
              </li>
              <li>
                <strong className="text-foreground">PTO</strong> — איתוראן_PTO
              </li>
              <li>
                <strong className="text-foreground">אתרים</strong> — אתרי_לקוחות
              </li>
            </ul>
            <p className="text-xs">
              מצב עצירות פעיל: <strong>{sourceLabel[stopsSource]}</strong>
            </p>
            <p className="text-xs text-amber-800">SAMPLE אינו מוצג במסך המודיעין.</p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">
              <Upload className="h-4 w-4" /> העלאת StopReport XLSX
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
      </main>
    </>
  );
}
