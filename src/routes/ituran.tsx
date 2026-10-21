import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { DRIVERS, type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import { crossMatch, rowsToStops, SAMPLE_STOPS, type GpsStop } from "@/lib/ituran";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  ExternalLink,
  SlidersHorizontal,
  FileCheck,
  Disc,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/ituran")({
  head: () => ({
    meta: [
      { title: "איתוראן GPS וטכוגרף — נועה ח. סבן" },
      {
        name: "description",
        content: "בקרת איתוראן GPS והצלבת זמני שהייה באתר מול תעודות משלוח ודיסקיות טכוגרף.",
      },
      { property: "og:title", content: "איתוראן GPS — ח. סבן" },
      {
        property: "og:description",
        content: "הצלבת מיקומי משאיות, זמני פריקה ואימות חתימות דיגיטלי.",
      },
    ],
  }),
  component: IturanPage,
});

function IturanPage() {
  const [activeTab, setActiveTab] = useState<"gps" | "tachograph">("gps");
  const [selectedPlate, setSelectedPlate] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [customStops, setCustomStops] = useState<GpsStop[] | null>(null);

  const {
    data: notes = [],
    isFetching,
    refetch,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-ituran"],
    queryFn: fetchLiveNotes,
    staleTime: 30000,
  });

  const activeStops = customStops || SAMPLE_STOPS;

  // Cross-match notes against GPS stops
  const matchedNotes = useMemo(() => {
    return notes.map((note) => {
      const driver = DRIVERS.find((d) => d.name === note.driver);
      const plate = driver?.truck || "615-41-002";
      const kind = (driver?.kind as "crane" | "flatbed") || "crane";
      const result = crossMatch(note, kind, plate, activeStops);
      return {
        note,
        driver,
        plate,
        kind,
        ...result,
      };
    });
  }, [notes, activeStops]);

  const filteredMatches = useMemo(() => {
    return matchedNotes.filter((item) => {
      if (selectedPlate !== "all" && !item.plate.includes(selectedPlate)) {
        return false;
      }
      if (!searchFilter.trim()) return true;
      const term = searchFilter.toLowerCase();
      return (
        item.note.customer.toLowerCase().includes(term) ||
        item.note.site.toLowerCase().includes(term) ||
        item.note.id.toLowerCase().includes(term) ||
        (item.note.driver && item.note.driver.toLowerCase().includes(term))
      );
    });
  }, [matchedNotes, selectedPlate, searchFilter]);

  const stats = useMemo(() => {
    const total = matchedNotes.length;
    const ok = matchedNotes.filter((m) => m.status === "ok").length;
    const warn = matchedNotes.filter((m) => m.status === "warn").length;
    const fail = matchedNotes.filter((m) => m.status === "fail").length;
    return { total, ok, warn, fail };
  }, [matchedNotes]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        if (!ws) throw new Error("גיליון ריק");
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        const stops = rowsToStops(data);
        if (stops.length > 0) {
          setCustomStops(stops);
          toast.success(`נטענו ${stops.length} נקודות ציון מקובץ האיתוראן בהצלחה! 🛰️`);
        } else {
          toast.warning("לא אותרו עמודות רכב/זמנים מוכרות בקובץ. אנא ודא כותרות מתאימות.");
        }
      } catch (err) {
        toast.error("שגיאה בקריאת קובץ האקסל של איתוראן");
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <>
      <PageHeader
        title="איתוראן GPS וטכוגרף"
        subtitle="הצלבה אוטונומית של זמני שהייה באתר, נתוני פריקת מנוף PTO ודיסקיות טכוגרף"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void refetch();
                toast.info("מרענן נתוני תעודות ואיתוראן...");
              }}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-primary ${isFetching ? "animate-spin" : ""}`}
              />
              <span>סנכרן</span>
            </button>
            <a
              href="/tachograph.html"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition active:scale-95 shadow-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>SPARK Vision מלא</span>
            </a>
          </div>
        }
      />

      {/* Mode Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3 mb-6">
        <button
          onClick={() => setActiveTab("gps")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === "gps"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Satellite className="h-4 w-4" />
          <span>הצלבת איתוראן GPS ותעודות</span>
          <Badge variant="outline" className="text-xs bg-background/40 font-mono">
            {stats.ok}/{stats.total} מאומת
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab("tachograph")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === "tachograph"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Disc className="h-4 w-4" />
          <span>דיסקית טכוגרף 24H (SPARK Vision)</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 font-mono">
            AI Core 3.5
          </span>
        </button>
      </div>

      {activeTab === "gps" ? (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Card className="p-4 border border-border/80 bg-card shadow-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>סה״כ תעודות להצלבה</span>
                <FileCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-black mt-2 font-mono text-foreground">
                {stats.total}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">מערך משאיות פעיל היום</div>
            </Card>

            <Card className="p-4 border border-emerald-500/20 bg-emerald-500/5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                <span>אומתו ב-100% באיתוראן</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black mt-2 font-mono text-emerald-600">{stats.ok}</div>
              <div className="text-[11px] text-emerald-600/80 mt-1">חתימה בטווח כניסה ויציאה</div>
            </Card>

            <Card className="p-4 border border-amber-500/20 bg-amber-500/5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-amber-700 font-medium">
                <span>סטיית שהייה חריגה</span>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black mt-2 font-mono text-amber-600">{stats.warn}</div>
              <div className="text-[11px] text-amber-600/80 mt-1">
                חריגה מכללי פריקה (מנוף/פלטה)
              </div>
            </Card>

            <Card className="p-4 border border-destructive/20 bg-destructive/5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-destructive font-medium">
                <span>ללא דיווח מיקום</span>
                <XCircle className="h-4 w-4 text-destructive" />
              </div>
              <div className="text-2xl font-black mt-2 font-mono text-destructive">
                {stats.fail}
              </div>
              <div className="text-[11px] text-destructive/80 mt-1">הרכב לא אותר בכתובת האתר</div>
            </Card>
          </div>

          {/* Controls Bar: Search & Plate Filters & Upload */}
          <Card className="p-4 border border-border bg-card shadow-sm">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="חיפוש לפי לקוח, כתובת אתר או נהג..."
                    className="pr-9 h-9 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    onClick={() => setSelectedPlate("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      selectedPlate === "all"
                        ? "bg-secondary text-secondary-foreground font-bold"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    כל הרכבים
                  </button>
                  <button
                    onClick={() => setSelectedPlate("615-41-002")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      selectedPlate === "615-41-002"
                        ? "bg-secondary text-secondary-foreground font-bold"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Truck className="h-3 w-3" />
                    <span>615-41-002 (חכמת מנוף)</span>
                  </button>
                  <button
                    onClick={() => setSelectedPlate("651-51-701")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                      selectedPlate === "651-51-701"
                        ? "bg-secondary text-secondary-foreground font-bold"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Truck className="h-3 w-3" />
                    <span>651-51-701 (עלי פלטה)</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-border hover:border-primary text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition">
                  <Upload className="h-3.5 w-3.5 text-primary" />
                  <span>ייבוא דוח איתוראן (Excel)</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
                {customStops && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => {
                      setCustomStops(null);
                      toast.info("חזרת לנתוני איתוראן לדוגמה");
                    }}
                  >
                    איפוס
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Matched Notes List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMatches.map((item) => (
              <Card
                key={item.note.id}
                className={`p-4 border transition-all shadow-sm ${
                  item.status === "ok"
                    ? "border-emerald-500/30 hover:border-emerald-500/60"
                    : item.status === "warn"
                      ? "border-amber-500/30 hover:border-amber-500/60"
                      : "border-destructive/30 hover:border-destructive/60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-foreground">
                        ת.מ. {item.note.id}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          item.status === "ok"
                            ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 font-medium"
                            : item.status === "warn"
                              ? "bg-amber-500/10 text-amber-700 border-amber-500/30 font-medium"
                              : "bg-destructive/10 text-destructive border-destructive/30 font-medium"
                        }`}
                      >
                        {item.label}
                      </Badge>
                    </div>
                    <div className="font-bold text-foreground text-sm mt-1">
                      {item.note.customer}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span>{item.note.site}</span>
                    </div>
                  </div>

                  <div className="text-left font-mono text-xs">
                    <div className="font-bold text-foreground flex items-center justify-end gap-1">
                      <Truck className="h-3 w-3 text-muted-foreground" />
                      <span>{item.plate}</span>
                    </div>
                    <div className="text-muted-foreground text-[11px] mt-0.5">
                      נהג: {item.note.driver || "לא שויך"}
                    </div>
                    <Badge variant="secondary" className="text-[10px] mt-1 font-sans">
                      {item.kind === "crane" ? "משאית מנוף" : "משאית פלטה"}
                    </Badge>
                  </div>
                </div>

                {/* GPS Telemetry Breakdown */}
                <div className="mt-3 pt-3 border-t border-border/80 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-muted/40 rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground">שעת חתימה</div>
                    <div className="font-mono font-bold text-foreground mt-0.5">
                      {item.note.signedAt || "08:15"}
                    </div>
                  </div>

                  <div className="bg-muted/40 rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground">שהייה בפועל</div>
                    <div className="font-mono font-bold text-foreground mt-0.5">
                      {item.dwell !== null ? `${item.dwell} דק׳` : "—"}
                    </div>
                  </div>

                  <div className="bg-muted/40 rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground">חלון איתוראן</div>
                    <div className="font-mono font-bold text-foreground mt-0.5">
                      {item.stop ? `${item.stop.arrive} - ${item.stop.depart}` : "לא אותר"}
                    </div>
                  </div>
                </div>

                {/* Match Details & Evidence */}
                {item.stop && (
                  <div className="mt-2.5 text-[11px] text-muted-foreground bg-secondary/30 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                    <span className="truncate">כתובת באיתוראן: {item.stop.address}</span>
                    <span className="font-semibold text-emerald-600 flex-shrink-0">מיקום אומת</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : (
        /* Tachograph SPARK Vision Viewport */
        <div className="space-y-4">
          <Card className="p-3 border border-border bg-card flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold text-foreground">
                noaBrain SPARK Vision — מנתח דיסקיות טכוגרף מעגליות בזמן אמת
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/tachograph.html"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>פתח בחלון מלא</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </Card>

          <div className="w-full rounded-2xl overflow-hidden border border-border shadow-lg bg-gray-950">
            <iframe
              src="/tachograph.html"
              title="noaBrain SPARK Vision"
              className="w-full h-[880px] border-0"
            />
          </div>
        </div>
      )}
    </>
  );
}
