// src/routes/index.tsx
// דף ראשי – סידור חכם ח. סבן חומרי בניין (סעיף 5.1)
// כולל: סרגל ניווט עליון בלשוניות, סיכום חי (ביקורים היום, ק״מ, שעות PTO, חריגים פתוחים),
// לוח שנה חודשי עם נקודות צבע לנהג, מספר ביקורים ותג חריגים,
// שכבת יום (Drawer ימנית / Bottom sheet) עם מתג חכמת ועלי

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Truck,
  MapPin,
  Clock,
  Layers,
  AlertTriangle,
  Calendar,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  Crown,
  RefreshCw,
} from "lucide-react";
import { SmartDispatchNav } from "@/components/smart-dispatch/SmartDispatchNav";
import { DispatchCalendar } from "@/components/smart-dispatch/DispatchCalendar";
import { DayDashboardDrawer } from "@/components/smart-dispatch/DayDashboardDrawer";
import { ConnectionDiagnosticCard } from "@/components/smart-dispatch/ConnectionDiagnosticCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSmartDispatchBootstrapFn } from "@/lib/smart-dispatch/server-functions";
import { calculateDayExceptions } from "@/lib/smart-dispatch/rules-engine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "סידור חכם — ח. סבן חומרי בנין" },
      {
        name: "description",
        content: "מערכת סידור חכם, הצלבת איתוראן GPS מול דיסקיות טכוגרף ובקרת זמני מנוף PTO.",
      },
      { property: "og:title", content: "סידור חכם — ח. סבן חומרי בנין" },
      {
        property: "og:description",
        content: "פענוח דוחות אקסל מאיתוראן, הצלבת זמני מנוף ותכנון זמני פריקה באתרים.",
      },
    ],
  }),
  component: MainDispatchPage,
});

function MainDispatchPage() {
  const [selectedDrawerDate, setSelectedDrawerDate] = useState<string | null>(null);

  // 1. שליפת נתוני Bootstrap מהשרת דרך החוזה החסין
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["smart-dispatch-bootstrap"],
    queryFn: () => getSmartDispatchBootstrapFn({ data: {} }),
    staleTime: 60000,
  });

  const discs = data?.data?.discs || [];
  const visits = data?.data?.visits || [];

  // זיהוי התאריך האחרון בנתונים כ"היום"
  const todayStr = useMemo(() => {
    if (visits.length === 0) return new Date().toISOString().split("T")[0]!;
    const dates = visits
      .map((v) => String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0])
      .filter((d): d is string => !!d && d.length >= 8)
      .sort();
    return dates[dates.length - 1] || new Date().toISOString().split("T")[0]!;
  }, [visits]);

  // ביקורים ביום האחרון/הנוכחי
  const todayVisits = useMemo(() => {
    return visits.filter((v) => {
      const d = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
      return d === todayStr;
    });
  }, [visits, todayStr]);

  // חישוב מדדי סיכום חי (ביקורים היום, ק״מ, שעות PTO, חריגים פתוחים)
  const todayKm = useMemo(() => {
    return todayVisits.reduce(
      (s, v) => s + (parseFloat(String(v["ק״מ מהעצירה הקודמת"] || "0")) || 0),
      0,
    );
  }, [todayVisits]);

  const todayPtoHours = useMemo(() => {
    const mins = todayVisits.reduce(
      (s, v) => s + (parseFloat(String(v["PTO משך (דק׳)"] || "0")) || 0),
      0,
    );
    return mins / 60;
  }, [todayVisits]);

  // חישוב חריגים פתוחים לכלל הימים
  const openExceptionsCount = useMemo(() => {
    let count = 0;
    const dates = new Set<string>();
    visits.forEach((v) => {
      const d = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
      if (d) dates.add(d);
    });
    dates.forEach((dStr) => {
      const dayVisits = visits.filter((v) => {
        const d = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
        return d === dStr;
      });
      const dayDisc = discs.find((dc) => {
        const dt = String(dc["תאריך מתוקן"] || dc["תאריך דיסקית"] || "").split("T")[0];
        return dt === dStr;
      });
      count += calculateDayExceptions({ disc: dayDisc, visits: dayVisits }).length;
    });
    return count;
  }, [visits, discs]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <SmartDispatchNav />
        <div className="max-w-6xl mx-auto p-16 text-center text-muted-foreground space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-base font-bold text-foreground">טוען סידור עבודה מהגיליון...</p>
          <p className="text-xs text-muted-foreground">
            מתחבר ל-Google Apps Script ללא שום נתוני דמה
          </p>
        </div>
      </div>
    );
  }

  // במקרה של שגיאת HTML או כשל חיבור – הצגת מסך אבחון מפורט לפי סעיף 2.4
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
      {/* סרגל ניווט עליון בלשוניות */}
      <SmartDispatchNav />

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* כותרת ראשית וסנכרון ענן */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                סנכרון פעיל מול איתוראן וגיליון סבן
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold text-foreground mt-1">
              סידור חכם – ח. סבן חומרי בניין
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              הצלבת נתוני GPS, זמני פריקת מנוף PTO והיסטוריית זמנים לאתרי לקוחות
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 rounded-2xl text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>רענן נתונים</span>
            </Button>

            <Button
              asChild
              size="sm"
              variant="default"
              className="gap-1.5 rounded-2xl text-xs font-bold"
            >
              <a href="/tachograph">
                <span>טכוגרף ואיתוראן</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>

        {/* 5.1 סיכום חי: 4 כרטיסי KPI ראשיים */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Card className="p-4 md:p-5 rounded-3xl border border-border shadow-card space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                ביקורים היום ({todayStr})
              </span>
            </div>
            <div className="text-3xl font-display font-extrabold text-foreground">
              {todayVisits.length}
            </div>
            <div className="text-[11px] text-muted-foreground">בכלל המשאיות של ח. סבן</div>
          </Card>

          <Card className="p-4 md:p-5 rounded-3xl border border-border shadow-card space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span className="flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-cyan-600" />
                ק״מ נסיעה היום
              </span>
            </div>
            <div className="text-3xl font-display font-extrabold text-cyan-700 dark:text-cyan-400">
              {todayKm.toFixed(1)} <span className="text-base font-normal">ק״מ</span>
            </div>
            <div className="text-[11px] text-muted-foreground">מחושב מתוך דיווחי איתוראן</div>
          </Card>

          <Card className="p-4 md:p-5 rounded-3xl border border-border shadow-card space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-amber-600" />
                שעות PTO מנוף
              </span>
            </div>
            <div className="text-3xl font-display font-extrabold text-amber-700 dark:text-amber-400">
              {todayPtoHours.toFixed(1)} <span className="text-base font-normal">שעות</span>
            </div>
            <div className="text-[11px] text-muted-foreground">פריקה פעילה במרצדס מנוף</div>
          </Card>

          <Card className="p-4 md:p-5 rounded-3xl border border-border shadow-card space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                חריגים פתוחים לבדיקה
              </span>
            </div>
            <div className="text-3xl font-display font-extrabold text-red-600">
              {openExceptionsCount}
            </div>
            <div className="text-[11px] text-muted-foreground">מנוף ללא תעודה / שהיות חריגות</div>
          </Card>
        </div>

        {/* 5.1 לוח שנה חודשי אינטראקטיבי */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-extrabold text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span>לוח סידור חודשי ובקרת נהגים</span>
            </h2>
            <span className="text-xs text-muted-foreground">
              לחץ על יום לפתיחת דשבורד מפורט (Drawer)
            </span>
          </div>

          <DispatchCalendar
            visits={visits}
            discs={discs}
            onSelectDay={(dayStr) => setSelectedDrawerDate(dayStr)}
            selectedDate={selectedDrawerDate || undefined}
          />
        </div>
      </main>

      {/* 5.1 & 5.2 שכבת יום (Drawer ימנית בדסקטופ, Bottom sheet במובייל) */}
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
