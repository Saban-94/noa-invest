// src/routes/hekmat.tsx
// לשונית נהג: חכמת גאבר (משאית 615-41-002 מרצדס מנוף)
// כולל: כותרת פרופיל עם תמונה, משאית, מדדי KPI, מיני-לוח שנה, היסטוריית ימים ושכבת יום

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Truck,
  MapPin,
  Clock,
  Layers,
  AlertTriangle,
  Calendar,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import { SmartDispatchNav } from "@/components/smart-dispatch/SmartDispatchNav";
import { DriverAvatar } from "@/components/smart-dispatch/DriverAvatar";
import { DayDashboardDrawer } from "@/components/smart-dispatch/DayDashboardDrawer";
import { ConnectionDiagnosticCard } from "@/components/smart-dispatch/ConnectionDiagnosticCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSmartDispatchBootstrapFn } from "@/lib/smart-dispatch/server-functions";
import {
  DRIVER_METAS,
  identifyDriver,
  calculateDayExceptions,
} from "@/lib/smart-dispatch/rules-engine";

export const Route = createFileRoute("/hekmat")({
  head: () => ({
    meta: [
      { title: "חכמת גאבר — סידור חכם ח. סבן" },
      {
        name: "description",
        content: "פרופיל נהג חכמת (משאית מרצדס מנוף 615-41-002), שעות PTO והיסטוריית ימים.",
      },
    ],
  }),
  component: HekmatDriverPage,
});

function HekmatDriverPage() {
  const [selectedDrawerDate, setSelectedDrawerDate] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["smart-dispatch-bootstrap"],
    queryFn: () => getSmartDispatchBootstrapFn({ data: {} }),
    staleTime: 60000,
  });

  const meta = DRIVER_METAS.hekmat;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <SmartDispatchNav />
        <div className="max-w-6xl mx-auto p-12 text-center text-muted-foreground">
          טוען נתוני נהג חכמת מהגיליון...
        </div>
      </div>
    );
  }

  if (data && !data.success) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <SmartDispatchNav />
        <ConnectionDiagnosticCard
          diagnostic={data.diagnostic}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      </div>
    );
  }

  const visits = data?.data?.visits || [];
  const discs = data?.data?.discs || [];

  // סינון כל הביקורים של חכמת
  const hekmatVisits = visits.filter((v) => {
    const iden = identifyDriver(v["נהג"], v["משאית"]);
    return iden.driver === "hekmat";
  });

  // קיבוץ לפי תאריכים
  const daysMap = new Map<string, typeof hekmatVisits>();
  hekmatVisits.forEach((v) => {
    const d = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
    if (!d) return;
    const arr = daysMap.get(d) || [];
    arr.push(v);
    daysMap.set(d, arr);
  });

  const sortedDays = Array.from(daysMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  // חישוב מדדי KPI לנהג
  const totalVisits = hekmatVisits.length;
  const totalKm = hekmatVisits.reduce(
    (s, v) => s + (parseFloat(String(v["ק״מ מהעצירה הקודמת"] || "0")) || 0),
    0,
  );
  const totalPtoMin = hekmatVisits.reduce(
    (s, v) => s + (parseFloat(String(v["PTO משך (דק׳)"] || "0")) || 0),
    0,
  );
  const siteTimes = hekmatVisits
    .map((v) => parseFloat(String(v["משך באתר לסידור (דק׳)"] || "0")) || 0)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const medianSiteMin = siteTimes.length > 0 ? siteTimes[Math.floor(siteTimes.length / 2)]! : 0;

  // חישוב סך החריגים
  let totalExceptionsCount = 0;
  sortedDays.forEach(([dayStr, dayVisits]) => {
    const dayDisc = discs.find((d) => {
      const dt = String(d["תאריך מתוקן"] || d["תאריך דיסקית"] || "").split("T")[0];
      return dt === dayStr;
    });
    const ex = calculateDayExceptions({ disc: dayDisc, visits: dayVisits });
    totalExceptionsCount += ex.length;
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SmartDispatchNav />

      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* כותרת פרופיל חכמת */}
        <div className="rounded-3xl bg-card border border-border shadow-card p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <DriverAvatar driver="hekmat" size="xl" showBadge />
            <div>
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                פרופיל נהג מנוף ראשי
              </div>
              <h1 className="text-2xl font-display font-extrabold text-foreground">
                {meta.nameHe}
              </h1>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span className="font-mono font-bold text-foreground">{meta.plate}</span>
                <span>·</span>
                <span>{meta.truckModel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              variant="default"
              className="gap-1.5 rounded-2xl text-xs font-bold"
            >
              <a href="/tachograph" className="flex items-center gap-1.5">
                <span>טכוגרף ו-PTO</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>

        {/* כרטיסי KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
              <MapPin className="h-3.5 w-3.5 text-primary" /> ביקורים
            </div>
            <div className="text-2xl font-display font-extrabold text-foreground">
              {totalVisits}
            </div>
          </Card>

          <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
              <Truck className="h-3.5 w-3.5 text-cyan-600" /> ק״מ נסיעה
            </div>
            <div className="text-2xl font-display font-extrabold text-cyan-700 dark:text-cyan-400">
              {totalKm.toFixed(1)}
            </div>
          </Card>

          <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
              <Layers className="h-3.5 w-3.5 text-amber-600" /> שעות PTO
            </div>
            <div className="text-2xl font-display font-extrabold text-amber-700 dark:text-amber-400">
              {(totalPtoMin / 60).toFixed(1)}h
            </div>
          </Card>

          <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
              <Clock className="h-3.5 w-3.5 text-purple-600" /> חציון באתר
            </div>
            <div className="text-2xl font-display font-extrabold text-purple-700 dark:text-purple-400">
              {medianSiteMin || "אין נתון"} {medianSiteMin ? "דק׳" : ""}
            </div>
          </Card>

          <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> חריגות
            </div>
            <div className="text-2xl font-display font-extrabold text-red-600">
              {totalExceptionsCount}
            </div>
          </Card>
        </div>

        {/* היסטוריית ימים */}
        <Card className="p-6 rounded-3xl border border-border shadow-card space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span>היסטוריית ימי פעילות של חכמת ({sortedDays.length} ימים)</span>
            </h3>
            <span className="text-xs text-muted-foreground">לחץ על יום לפתיחת דשבורד מלא</span>
          </div>

          {sortedDays.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              אין ימי פעילות רשומים לחכמת בגיליון.
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedDays.map(([dayStr, dayVisits]) => {
                const dayDisc = discs.find((d) => {
                  const dt = String(d["תאריך מתוקן"] || d["תאריך דיסקית"] || "").split("T")[0];
                  return dt === dayStr;
                });
                const ex = calculateDayExceptions({ disc: dayDisc, visits: dayVisits });
                const dayKm = dayVisits.reduce(
                  (s, v) => s + (parseFloat(String(v["ק״מ מהעצירה הקודמת"] || "0")) || 0),
                  0,
                );
                const dayPto = dayVisits.reduce(
                  (s, v) => s + (parseFloat(String(v["PTO משך (דק׳)"] || "0")) || 0),
                  0,
                );

                return (
                  <button
                    key={dayStr}
                    type="button"
                    onClick={() => setSelectedDrawerDate(dayStr)}
                    className="w-full p-4 rounded-2xl bg-muted/20 border border-border hover:border-amber-500/40 hover:bg-muted/40 transition flex items-center justify-between text-right text-xs group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center font-mono font-bold text-foreground">
                        {dayStr.slice(8, 10)}
                      </div>
                      <div>
                        <div className="font-display font-bold text-sm text-foreground group-hover:text-amber-600 transition">
                          {dayStr}
                        </div>
                        <div className="text-muted-foreground text-[11px] mt-0.5">
                          {dayVisits.length} ביקורים · {dayKm.toFixed(1)} ק״מ · PTO:{" "}
                          {(dayPto / 60).toFixed(1)} שעות
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {ex.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 font-bold text-[10px] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>{ex.length} חריגות</span>
                        </span>
                      )}
                      <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:translate-x-[-3px] transition" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </main>

      {/* שכבת יום */}
      {selectedDrawerDate && (
        <DayDashboardDrawer
          isOpen={!!selectedDrawerDate}
          onClose={() => setSelectedDrawerDate(null)}
          selectedDate={selectedDrawerDate}
          discs={discs}
          visits={visits}
          initialDriver="hekmat"
        />
      )}
    </div>
  );
}
