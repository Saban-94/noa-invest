import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchLiveNotes } from "@/lib/api";
import { crossMatch, SAMPLE_STOPS } from "@/lib/ituran";
import {
  MapPin,
  Truck,
  AlertTriangle,
  Clock,
  RefreshCw,
  Search,
  CheckCircle2,
  Navigation,
} from "lucide-react";

export const Route = createFileRoute("/ituran")({
  component: IturanDashboardRoute,
});

const DRIVERS_PLATE_MAP: Record<string, string> = {
  חכמת: "615-41-002", // מרצדס מנוף
  עלי: "651-51-701",  // איסוזו פלאטבֶד
};

function IturanDashboardRoute() {
  const [selectedDriver, setSelectedDriver] = useState<"all" | "חכמת" | "עלי">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // שליפת תעודות משלוח חיות מהגיליון לצורך אימות כתובות
  const { data: notesList, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["live-notes-ituran"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
  });

  // ניתוח העצירות מול רשומות האיתוראן
  const verificationResults = useMemo(() => {
    if (!notesList) return [];
    return notesList.map((note) => {
      const driverName = note.driver || "לא ידוע";
      const plate =
        driverName.includes("חכמת")
          ? DRIVERS_PLATE_MAP["חכמת"]
          : driverName.includes("עלי")
            ? DRIVERS_PLATE_MAP["עלי"]
            : "615-41-002";

      const kind = driverName.includes("חכמת") ? "crane" : "flatbed";
      const match = crossMatch(note, kind, plate, SAMPLE_STOPS);

      return {
        noteId: note.id,
        customer: note.customer,
        address: note.site || note["כתובת אתר"] || "כתובת לא צוינה",
        driver: driverName,
        plate,
        matchStatus: match.status,
        dwell: match.dwell,
        label: match.label,
        stopAddress: match.stop?.address || "לא אותר ב-GPS",
        arrive: match.stop?.arrive || "--:--",
        depart: match.stop?.depart || "--:--",
      };
    });
  }, [notesList]);

  // סינון לפי נהג או חיפוש טקסטואלי
  const filteredResults = useMemo(() => {
    return verificationResults.filter((item) => {
      const matchDriver =
        selectedDriver === "all" || item.driver.includes(selectedDriver);
      const matchSearch =
        !searchQuery ||
        item.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.noteId.includes(searchQuery) ||
        item.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDriver && matchSearch;
    });
  }, [verificationResults, selectedDriver, searchQuery]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8" dir="rtl">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <PageHeader
            title="דשבורד בקרה חכם · איתוראן ואימות כתובות GPS"
            subtitle="הצלבה בזמן אמת של תעודות משלוח מול דוחות איתוראן יומיים (עלי וחכמת)"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2 rounded-xl"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span>רענן נתוני GPS</span>
          </Button>
        </div>

        {/* פילטרים וחיפוש */}
        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={selectedDriver === "all" ? "default" : "outline"}
              onClick={() => setSelectedDriver("all")}
              className="rounded-xl font-bold"
            >
              כל הנהגים
            </Button>
            <Button
              size="sm"
              variant={selectedDriver === "חכמת" ? "default" : "outline"}
              onClick={() => setSelectedDriver("חכמת")}
              className="rounded-xl font-bold gap-1.5"
            >
              <Truck className="h-4 w-4" /> חכמת (מרצדס מנוף)
            </Button>
            <Button
              size="sm"
              variant={selectedDriver === "עלי" ? "default" : "outline"}
              onClick={() => setSelectedDriver("עלי")}
              className="rounded-xl font-bold gap-1.5"
            >
              <Truck className="h-4 w-4" /> עלי (איסוזו פלאטבֶד)
            </Button>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="חיפוש לפי לקוח, תעודה או כתובת..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-9 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* תצוגת הרשומות וההצלבות */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">טוען נתונים מהגיליון...</div>
      ) : filteredResults.length === 0 ? (
        <div className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          לא נמצאו תעודות העונות על תנאי הסינון.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredResults.map((item) => {
            const isOk = item.matchStatus === "ok";
            return (
              <Card key={item.noteId} className="relative space-y-3 rounded-3xl p-5 shadow-sm border-border">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-primary">
                    ת.מ. #{item.noteId}
                  </span>
                  <Badge
                    variant={isOk ? "default" : "secondary"}
                    className={`text-[10px] gap-1 font-bold ${
                      isOk
                        ? "bg-emerald-600 text-white"
                        : "bg-amber-500/15 text-amber-800 border-amber-500/30"
                    }`}
                  >
                    {isOk ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {item.label}
                  </Badge>
                </div>

                <div>
                  <h3 className="font-display text-base font-extrabold">{item.customer}</h3>
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span><strong>כתובת בתעודה:</strong> {item.address}</span>
                  </p>
                </div>

                <div className="rounded-2xl bg-muted/40 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold">נהג משוייך:</span>
                    <span className="font-bold">{item.driver} ({item.plate})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold">מיקום איתוראן GPS:</span>
                    <span className="font-medium truncate max-w-[180px]">{item.stopAddress}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/60">
                    <span className="text-muted-foreground font-semibold flex items-center gap-1">
                      <Clock className="h-3 w-3" /> זמני שהייה:
                    </span>
                    <span className="font-mono font-bold">
                      {item.arrive} ➔ {item.depart} ({item.dwell !== null ? `${item.dwell} דק׳` : "לא זמין"})
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}