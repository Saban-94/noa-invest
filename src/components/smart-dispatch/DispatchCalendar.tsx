// src/components/smart-dispatch/DispatchCalendar.tsx
// לוח שנה חודשי לסידור עבודה: נקודות צבע לפי נהג (עלי / חכמת), מספר ביקורים, תג חריגים
// לחיצה על יום פותחת את ה-DayDashboardDrawer

import { useState } from "react";
import { ChevronRight, ChevronLeft, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { identifyDriver, calculateDayExceptions } from "@/lib/smart-dispatch/rules-engine";
import type { RawDiscRecord, RawVisitRecord } from "@/lib/smart-dispatch/apps-script-contract";

interface DispatchCalendarProps {
  visits: RawVisitRecord[];
  discs: RawDiscRecord[];
  onSelectDay: (dateStr: string) => void;
  selectedDate?: string;
}

export function DispatchCalendar({
  visits,
  discs,
  onSelectDay,
  selectedDate,
}: DispatchCalendarProps) {
  // חישוב מפת תאריכים מתוך הנתונים
  const datesSet = new Set<string>();
  visits.forEach((v) => {
    const d = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
    if (d && d.length >= 8) datesSet.add(d);
  });
  discs.forEach((d) => {
    const dt = String(d["תאריך מתוקן"] || d["תאריך דיסקית"] || "").split("T")[0];
    if (dt && dt.length >= 8) datesSet.add(dt);
  });

  // ברירת מחדל של החודש: מהתאריך האחרון בנתונים או החודש הנוכחי
  const sortedDates = Array.from(datesSet).sort();
  const latestDateStr =
    sortedDates[sortedDates.length - 1] || new Date().toISOString().split("T")[0]!;
  const [currentYear, currentMonth] = latestDateStr.split("-").map((x) => parseInt(x, 10));

  const [viewYear, setViewYear] = useState<number>(currentYear || 2026);
  const [viewMonth, setViewMonth] = useState<number>(currentMonth || 10); // 1-12

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // בניית ימי החודש
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0 = Sunday

  const monthNamesHe = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];

  const daysGrid: Array<{ dayNumber: number; dateStr: string } | null> = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysGrid.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    daysGrid.push({ dayNumber: d, dateStr });
  }

  // מיפוי נתונים לכל יום
  const daysData = new Map<
    string,
    {
      hasAli: boolean;
      hasHekmat: boolean;
      visitsCount: number;
      exceptionsCount: number;
    }
  >();

  visits.forEach((v) => {
    const rawD = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
    if (!rawD) return;
    const norm = rawD.replace(/\//g, "-");
    const entry = daysData.get(norm) || {
      hasAli: false,
      hasHekmat: false,
      visitsCount: 0,
      exceptionsCount: 0,
    };
    entry.visitsCount++;

    const iden = identifyDriver(v["נהג"], v["משאית"]);
    if (iden.driver === "ali") entry.hasAli = true;
    if (iden.driver === "hekmat") entry.hasHekmat = true;

    daysData.set(norm, entry);
  });

  // הוספת ספירת חריגות לכל יום
  datesSet.forEach((dStr) => {
    const dayVisits = visits.filter((v) => {
      const vDate = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
      return vDate === dStr;
    });
    const dayDisc = discs.find((d) => {
      const dt = String(d["תאריך מתוקן"] || d["תאריך דיסקית"] || "").split("T")[0];
      return dt === dStr;
    });

    const ex = calculateDayExceptions({ disc: dayDisc, visits: dayVisits });
    const entry = daysData.get(dStr);
    if (entry) {
      entry.exceptionsCount = ex.length;
    }
  });

  return (
    <div
      className="rounded-3xl bg-card border border-border shadow-card p-4 md:p-6 space-y-4"
      dir="rtl"
    >
      {/* סרגל עליון של לוח השנה */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          <h3 className="font-display font-extrabold text-base md:text-lg text-foreground">
            {monthNamesHe[viewMonth - 1]} {viewYear}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrevMonth}
            className="h-8 w-8 p-0 rounded-xl"
            title="חודש קודם"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleNextMonth}
            className="h-8 w-8 p-0 rounded-xl"
            title="חודש הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* מקרא נהגים */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pb-1">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-600" />
          <span>עלי (651-51-701)</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span>חכמת (615-41-002)</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span>חריגות פתוחות</span>
        </div>
      </div>

      {/* כותרות ימי השבוע */}
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-muted-foreground">
        <div>א׳</div>
        <div>ב׳</div>
        <div>ג׳</div>
        <div>ד׳</div>
        <div>ה׳</div>
        <div>ו׳</div>
        <div>ש׳</div>
      </div>

      {/* גריד הימים */}
      <div className="grid grid-cols-7 gap-1.5">
        {daysGrid.map((item, idx) => {
          if (!item) {
            return <div key={`empty-${idx}`} className="h-20 rounded-2xl bg-muted/10 opacity-30" />;
          }

          const data = daysData.get(item.dateStr);
          const isSelected = selectedDate === item.dateStr;
          const hasVisits = !!data && data.visitsCount > 0;

          return (
            <button
              key={item.dateStr}
              type="button"
              onClick={() => onSelectDay(item.dateStr)}
              className={`h-20 p-2 rounded-2xl border text-right flex flex-col justify-between transition group relative ${
                isSelected
                  ? "bg-primary/10 border-primary shadow-xs ring-2 ring-primary/30"
                  : hasVisits
                    ? "bg-card border-border hover:border-primary/50 hover:bg-muted/40"
                    : "bg-muted/20 border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-mono font-bold text-foreground">
                  {item.dayNumber}
                </span>

                {data && data.exceptionsCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white">
                    {data.exceptionsCount}
                  </span>
                )}
              </div>

              {/* נקודות נהגים ומספר ביקורים */}
              {data && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    {data.hasAli && (
                      <span className="h-2 w-2 rounded-full bg-cyan-600" title="עלי פעיל" />
                    )}
                    {data.hasHekmat && (
                      <span className="h-2 w-2 rounded-full bg-amber-500" title="חכמת פעיל" />
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-semibold">
                    {data.visitsCount} ביקורים
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
