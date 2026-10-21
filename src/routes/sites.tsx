// src/routes/sites.tsx
// טבלת כתובות לקוחות ואתרי פריקה – סעיף 5.5
// כולל: חיפוש, סינון עיר, חציון/P80/נסיעה/ביטחון, לחיצה על שורה פותחת היסטוריית ביקורים, "אין מדידה" ללא נתון

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Search,
  Building,
  Clock,
  Navigation,
  ShieldCheck,
  ChevronDown,
  History,
  ExternalLink,
  X,
} from "lucide-react";
import { SmartDispatchNav } from "@/components/smart-dispatch/SmartDispatchNav";
import { ConnectionDiagnosticCard } from "@/components/smart-dispatch/ConnectionDiagnosticCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSmartDispatchBootstrapFn } from "@/lib/smart-dispatch/server-functions";
import type { RawSiteRecord, RawVisitRecord } from "@/lib/smart-dispatch/apps-script-contract";

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "כתובות לקוחות ואתרי פריקה — סידור חכם ח. סבן" },
      {
        name: "description",
        content: "היסטוריית זמני פריקה באתר לפי כתובת ולקוח, P50, P80 ותכנון בטוח.",
      },
    ],
  }),
  component: SitesPage,
});

function SitesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedSiteKey, setSelectedSiteKey] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["smart-dispatch-bootstrap"],
    queryFn: () => getSmartDispatchBootstrapFn({ data: {} }),
    staleTime: 60000,
  });

  const sites = data?.data?.sites || [];
  const visits = data?.data?.visits || [];

  // רשימת ערים ייחודיות לסינון
  const citiesList = useMemo(() => {
    const set = new Set<string>();
    sites.forEach((s) => {
      const c = String(s["עיר"] || "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [sites]);

  // סינון אתרים לפי חיפוש ועיר
  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const city = String(s["עיר"] || "");
      const addr = String(s["כתובת"] || "");
      const cust = String(s["לקוחות"] || "");
      const key = String(s["מפתח אתר"] || "");

      const matchesCity = !selectedCity || city === selectedCity;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        city.toLowerCase().includes(q) ||
        addr.toLowerCase().includes(q) ||
        cust.toLowerCase().includes(q) ||
        key.toLowerCase().includes(q);

      return matchesCity && matchesSearch;
    });
  }, [sites, selectedCity, searchQuery]);

  // ביקורים באתר הנבחר
  const siteVisits = useMemo(() => {
    if (!selectedSiteKey) return [];
    return visits.filter((v) => {
      const k = String(v["מפתח אתר"] || "");
      const addr = String(v["כתובת"] || "");
      return k === selectedSiteKey || addr.includes(selectedSiteKey);
    });
  }, [visits, selectedSiteKey]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <SmartDispatchNav />
        <div className="max-w-6xl mx-auto p-16 text-center text-muted-foreground">
          טוען נתוני אתרי לקוחות מהגיליון...
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

      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-display font-extrabold text-foreground flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              <span>כתובות לקוחות ואתרי פריקה</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              חישובי חציון (P50), תכנון בטוח (P80) וזמני נסיעה היסטוריים להזמנות חדשות
            </p>
          </div>

          <span className="text-xs font-mono text-muted-foreground">
            {filteredSites.length} אתרים רשומים
          </span>
        </div>

        {/* סרגל חיפוש וסינון ערים */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי כתובת, שם לקוח, מפתח אתר או עיר..."
              className="w-full rounded-2xl bg-card border border-border py-2.5 pr-10 pl-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
            />
          </div>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="w-full sm:w-56 rounded-2xl bg-card border border-border px-3 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
          >
            <option value="">כל הערים ({citiesList.length})</option>
            {citiesList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* טבלת אתרים */}
        <Card className="rounded-3xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground font-bold">
                <tr>
                  <th className="py-3 px-4">כתובת</th>
                  <th className="py-3 px-3">עיר</th>
                  <th className="py-3 px-3">לקוחות באתר</th>
                  <th className="py-3 px-2 text-center">ביקורים</th>
                  <th className="py-3 px-2 text-center">באתר חציון</th>
                  <th className="py-3 px-2 text-center">P80 בטוח</th>
                  <th className="py-3 px-2 text-center">נסיעה חציון</th>
                  <th className="py-3 px-3 text-center">רמת ביטחון</th>
                  <th className="py-3 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredSites.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      לא נמצאו אתרים תואמים לחיפוש.
                    </td>
                  </tr>
                ) : (
                  filteredSites.map((s, idx) => {
                    const key = String(s["מפתח אתר"] || s["כתובת"] || idx);
                    const addr = String(s["כתובת"] || "אין נתון");
                    const city = String(s["עיר"] || "אין נתון");
                    const cust = String(s["לקוחות"] || "—");
                    const visitsCount = s["ביקורים"] || 0;
                    const medSite = s["באתר חציון (דק׳)"]
                      ? `${s["באתר חציון (דק׳)"]} דק׳`
                      : "אין מדידה";
                    const p80Site = s["באתר P80 (דק׳)"]
                      ? `${s["באתר P80 (דק׳)"]} דק׳`
                      : "אין מדידה";
                    const medDrive = s["נסיעה חציון (דק׳)"]
                      ? `${s["נסיעה חציון (דק׳)"]} דק׳`
                      : "אין מדידה";
                    const conf = String(s["ביטחון"] || "—");

                    const isSelected = selectedSiteKey === key;

                    return (
                      <tr
                        key={key}
                        onClick={() => setSelectedSiteKey(isSelected ? null : key)}
                        className={`hover:bg-muted/30 cursor-pointer transition ${
                          isSelected ? "bg-primary/5 font-semibold" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-foreground">{addr}</td>
                        <td className="py-3 px-3 text-muted-foreground">{city}</td>
                        <td
                          className="py-3 px-3 text-muted-foreground max-w-[180px] truncate"
                          title={cust}
                        >
                          {cust}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-foreground">
                          {visitsCount}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-purple-700 dark:text-purple-400">
                          {medSite}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold text-amber-700 dark:text-amber-400">
                          {p80Site}
                        </td>
                        <td className="py-3 px-2 text-center font-mono text-cyan-700 dark:text-cyan-400">
                          {medDrive}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              conf.includes("גבוה")
                                ? "bg-emerald-500/15 text-emerald-800"
                                : conf.includes("בינונ")
                                  ? "bg-amber-500/15 text-amber-800"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {conf}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-left">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg">
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${isSelected ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* היסטוריית ביקורים של האתר הנבחר */}
        {selectedSiteKey && (
          <Card className="p-5 rounded-3xl border border-primary/30 bg-card shadow-card space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h3 className="font-display font-bold text-sm text-foreground">
                  היסטוריית ביקורים באתר: {selectedSiteKey} ({siteVisits.length} ביקורים)
                </h3>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedSiteKey(null)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {siteVisits.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                לא נמצאו רשומות ביקור מפורטות באתר זה בטאב היסטוריית_ביקורים.
              </div>
            ) : (
              <div className="space-y-2">
                {siteVisits.map((v, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-muted/30 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-mono font-bold text-foreground">
                        {String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "אין תאריך")}
                      </div>
                      <div className="text-muted-foreground">
                        משאית: {String(v["משאית"] || "—")} · נהג: {String(v["נהג"] || "—")}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                      <span>
                        משך באתר:{" "}
                        {v["משך באתר לסידור (דק׳)"] || v["איתוראן: משך עצירה (דק׳)"] || "—"} דק׳
                      </span>
                      <span>PTO: {v["PTO משך (דק׳)"] || "0"} דק׳</span>
                      <span>נסיעה: {v["נסיעה מהעצירה הקודמת (דק׳)"] || "—"} דק׳</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
