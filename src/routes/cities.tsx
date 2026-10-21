// src/routes/cities.tsx
// טבלת ערים ומרחקים – סעיף 5.5
// כולל: עיר, ביקורים, חציון באתר, בר ויזואלי, P80, נסיעה (דק׳), ק״מ חציון מתוך 'ק״מ מהעצירה הקודמת'

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, MapPin, Clock, Truck, TrendingUp } from "lucide-react";
import { SmartDispatchNav } from "@/components/smart-dispatch/SmartDispatchNav";
import { ConnectionDiagnosticCard } from "@/components/smart-dispatch/ConnectionDiagnosticCard";
import { Card } from "@/components/ui/card";
import { getSmartDispatchBootstrapFn } from "@/lib/smart-dispatch/server-functions";
import type { RawCityRecord, RawVisitRecord } from "@/lib/smart-dispatch/apps-script-contract";

export const Route = createFileRoute("/cities")({
  head: () => ({
    meta: [
      { title: "ערים ומרחקים — סידור חכם ח. סבן" },
      {
        name: "description",
        content: "ניתוח זמני שהות ומרחקי נסיעה ממוצעים וחציוניים לפי ערי אספקה.",
      },
    ],
  }),
  component: CitiesPage,
});

function CitiesPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["smart-dispatch-bootstrap"],
    queryFn: () => getSmartDispatchBootstrapFn({ data: {} }),
    staleTime: 60000,
  });

  const rawCities = data?.data?.cities || [];
  const visits = data?.data?.visits || [];

  // חישוב קילומטרים חציוניים לפי עיר מתוך ביקורים ('ק״מ מהעצירה הקודמת')
  const cityKmMap = useMemo(() => {
    const map = new Map<string, number[]>();
    visits.forEach((v) => {
      const city = String(v["עיר"] || "").trim();
      const km = parseFloat(String(v["ק״מ מהעצירה הקודמת"] || "0")) || 0;
      if (city && km > 0) {
        const arr = map.get(city) || [];
        arr.push(km);
        map.set(city, arr);
      }
    });

    const medianMap = new Map<string, number>();
    map.forEach((kms, city) => {
      kms.sort((a, b) => a - b);
      const mid = Math.floor(kms.length / 2);
      const med = kms.length % 2 !== 0 ? kms[mid]! : (kms[mid - 1]! + kms[mid]!) / 2;
      medianMap.set(city, parseFloat(med.toFixed(1)));
    });
    return medianMap;
  }, [visits]);

  // מקסימום P80 לחישוב רוחב הבר היחסי
  const maxP80 = useMemo(() => {
    let max = 1;
    rawCities.forEach((c) => {
      const v = parseFloat(String(c["באתר P80"] || "0")) || 0;
      if (v > max) max = v;
    });
    return max;
  }, [rawCities]);

  // סינון ערים לפי חיפוש
  const filteredCities = useMemo(() => {
    return rawCities.filter((c) => {
      const name = String(c["עיר"] || "");
      return !searchQuery || name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    });
  }, [rawCities, searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <SmartDispatchNav />
        <div className="max-w-6xl mx-auto p-16 text-center text-muted-foreground">
          טוען נתוני ערים מהגיליון...
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

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SmartDispatchNav />

      <main className="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-display font-extrabold text-foreground flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <span>זמן באתר ומרחקים לפי עיר אספקה</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              מדדי סידור חכם: חציון שהות באתר, תכנון P80 בטוח, נסיעה בדקות וקילומטראז׳ מאומת
            </p>
          </div>

          <span className="text-xs font-mono text-muted-foreground">
            {filteredCities.length} ערים מנותחות
          </span>
        </div>

        {/* חיפוש עיר */}
        <div className="relative max-w-md">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש עיר (למשל: תל אביב, פתח תקווה, כפר סבא)..."
            className="w-full rounded-2xl bg-card border border-border py-2.5 pr-10 pl-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
          />
        </div>

        {/* טבלת ערים */}
        <Card className="rounded-3xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground font-bold">
                <tr>
                  <th className="py-3 px-4">עיר אספקה</th>
                  <th className="py-3 px-3 text-center">ביקורים מנוטרים</th>
                  <th className="py-3 px-3 text-center">חציון באתר (P50)</th>
                  <th className="py-3 px-4 w-48 text-center">התפלגות יחסית</th>
                  <th className="py-3 px-3 text-center">תכנון בטוח (P80)</th>
                  <th className="py-3 px-3 text-center">נסיעה חציון</th>
                  <th className="py-3 px-4 text-center">ק״מ חציון</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCities.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      לא נמצאו נתונים לעיר המבוקשת.
                    </td>
                  </tr>
                ) : (
                  filteredCities.map((c, idx) => {
                    const cityName = String(c["עיר"] || "לא צוין");
                    const visitsCount = c["ביקורים"] || 0;
                    const medSite = parseFloat(String(c["באתר חציון"] || "0")) || 0;
                    const p80Site = parseFloat(String(c["באתר P80"] || "0")) || 0;
                    const medDrive = c["נסיעה חציון"] ? `${c["נסיעה חציון"]} דק׳` : "אין מדידה";
                    const kmVal = cityKmMap.get(cityName);

                    const barWidthPercent = Math.min(Math.round((p80Site / maxP80) * 100), 100);

                    return (
                      <tr key={idx} className="hover:bg-muted/30 transition">
                        <td className="py-3 px-4 font-bold text-foreground text-sm">{cityName}</td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-foreground">
                          {visitsCount}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-purple-700 dark:text-purple-400">
                          {medSite ? `${medSite} דק׳` : "אין מדידה"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${barWidthPercent}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-amber-700 dark:text-amber-400">
                          {p80Site ? `${p80Site} דק׳` : "אין מדידה"}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-cyan-700 dark:text-cyan-400">
                          {medDrive}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-foreground">
                          {kmVal !== undefined ? `${kmVal} ק״מ` : "אין מדידה"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-muted/20 border-t border-border text-[11px] text-muted-foreground text-center">
            מרחקים בק״מ וזמני נסיעה מחושבים ישירות מתוך עמודת "ק״מ מהעצירה הקודמת" בדיווחי איתוראן.
          </div>
        </Card>
      </main>
    </div>
  );
}
