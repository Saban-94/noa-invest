// src/components/smart-dispatch/DayDashboardDrawer.tsx
// שכבת דשבורד יומי (Drawer ימנית בדסקטופ, Sheet במובייל) עם מעבר חלק בין עלי לחכמת
// כולל: ציר זמן יום, רשימת ביקורים, הצלבת תעודות, כרטיסי KPI, חריגים וכפתור פתח בטכוגרף

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  X,
  Truck,
  Clock,
  MapPin,
  FileText,
  AlertTriangle,
  Layers,
  ArrowRight,
  ExternalLink,
  Satellite,
  Gauge,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriverAvatar } from "./DriverAvatar";
import {
  DRIVER_METAS,
  identifyDriver,
  calculateDayExceptions,
  verifyCustomerSignature,
  type DriverIdentity,
} from "@/lib/smart-dispatch/rules-engine";
import type { RawDiscRecord, RawVisitRecord } from "@/lib/smart-dispatch/apps-script-contract";

interface DayDashboardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string; // YYYY-MM-DD or DD/MM/YYYY
  discs: RawDiscRecord[];
  visits: RawVisitRecord[];
  initialDriver?: DriverIdentity;
}

export function DayDashboardDrawer({
  isOpen,
  onClose,
  selectedDate,
  discs,
  visits,
  initialDriver = "hekmat",
}: DayDashboardDrawerProps) {
  const [activeDriver, setActiveDriver] = useState<DriverIdentity>(initialDriver);

  if (!isOpen) return null;

  // סינון ביקורים ליום ולנהג הנבחר
  const driverVisits = visits.filter((v) => {
    const vDate = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "");
    const dateMatch =
      vDate === selectedDate ||
      vDate.split("T")[0] === selectedDate ||
      vDate.replace(/\//g, "-") === selectedDate.replace(/\//g, "-");

    const iden = identifyDriver(v["נהג"], v["משאית"]);
    return dateMatch && iden.driver === activeDriver;
  });

  // דיסקית מתאימה ליום ולמשאית
  const driverMeta = DRIVER_METAS[activeDriver === "ali" ? "ali" : "hekmat"];
  const driverDisc = discs.find((d) => {
    const dDate = String(d["תאריך מתוקן"] || d["תאריך דיסקית"] || "");
    const dateMatch =
      dDate === selectedDate || dDate.replace(/\//g, "-") === selectedDate.replace(/\//g, "-");
    const dPlate = String(d["משאית מתוקנת"] || d["רישוי / משאית"] || "").replace(/[^0-9]/g, "");
    return dateMatch && dPlate.includes(driverMeta.plate.replace(/[^0-9]/g, ""));
  });

  const dayExceptions = calculateDayExceptions({
    disc: driverDisc,
    visits: driverVisits,
  });

  // חישוב מדדי KPI ליום זה
  const totalVisits = driverVisits.length;
  const totalKm = driverVisits.reduce(
    (sum, v) => sum + (parseFloat(String(v["ק״מ מהעצירה הקודמת"] || "0")) || 0),
    0,
  );
  const totalPtoMin = driverVisits.reduce(
    (sum, v) => sum + (parseFloat(String(v["PTO משך (דק׳)"] || "0")) || 0),
    0,
  );
  const totalSiteMin = driverVisits.reduce(
    (sum, v) => sum + (parseFloat(String(v["משך באתר לסידור (דק׳)"] || "0")) || 0),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity"
      dir="rtl"
    >
      {/* רקע שקוף לסגירה בלחיצה */}
      <div className="flex-1 cursor-pointer" onClick={onClose} />

      {/* חלונית ה-Drawer */}
      <div className="w-full max-w-xl h-full bg-card border-r border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* כותרת עליונה עם תאריך וסגירה */}
        <div className="p-4 md:p-5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              דשבורד יומי מפורט
            </div>
            <h2 className="text-xl font-display font-extrabold text-foreground">{selectedDate}</h2>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* מתג בחירה בין חכמת לעלי */}
        <div className="p-3 bg-muted/60 border-b border-border grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveDriver("hekmat")}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-2xl text-xs font-bold transition ${
              activeDriver === "hekmat"
                ? "bg-card text-foreground shadow-sm ring-2 ring-amber-500/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <DriverAvatar driver="hekmat" size="sm" />
            <div className="text-right">
              <div>חכמת גאבר</div>
              <div className="text-[10px] text-muted-foreground font-mono">615-41-002 · מנוף</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveDriver("ali")}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-2xl text-xs font-bold transition ${
              activeDriver === "ali"
                ? "bg-card text-foreground shadow-sm ring-2 ring-cyan-500/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <DriverAvatar driver="ali" size="sm" />
            <div className="text-right">
              <div>עלי אבו עידה</div>
              <div className="text-[10px] text-muted-foreground font-mono">651-51-701 · איסוזו</div>
            </div>
          </button>
        </div>

        {/* תוכן נגלל */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 text-xs">
          {/* כרטיס פרופיל נהג ורכב */}
          <div className="flex items-center justify-between rounded-3xl bg-muted/30 p-4 border border-border">
            <div className="flex items-center gap-3">
              <DriverAvatar driver={activeDriver} size="lg" showBadge />
              <div>
                <h3 className="font-display text-base font-extrabold text-foreground">
                  {driverMeta.nameHe}
                </h3>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="font-mono font-bold text-foreground">{driverMeta.plate}</span>
                  <span>·</span>
                  <span>{driverMeta.truckModel}</span>
                </div>
              </div>
            </div>

            <Button
              asChild
              size="sm"
              variant="default"
              className="gap-1.5 rounded-2xl text-xs font-bold"
            >
              <Link to="/tachograph" search={{ date: selectedDate, driver: activeDriver }}>
                <span>פתח ב-Tachograph</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {/* כרטיסי KPI ליום */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-2xl bg-card p-3 border border-border space-y-1">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
                <MapPin className="h-3 w-3 text-primary" /> ביקורים
              </div>
              <div className="text-lg font-display font-extrabold text-foreground">
                {totalVisits}
              </div>
            </div>

            <div className="rounded-2xl bg-card p-3 border border-border space-y-1">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
                <Truck className="h-3 w-3 text-cyan-600" /> ק״מ נסיעה
              </div>
              <div className="text-lg font-display font-extrabold text-cyan-700 dark:text-cyan-400">
                {totalKm.toFixed(1)}
              </div>
            </div>

            <div className="rounded-2xl bg-card p-3 border border-border space-y-1">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
                <Layers className="h-3 w-3 text-amber-600" /> שעות PTO
              </div>
              <div className="text-lg font-display font-extrabold text-amber-700 dark:text-amber-400">
                {(totalPtoMin / 60).toFixed(1)}h
              </div>
            </div>

            <div className="rounded-2xl bg-card p-3 border border-border space-y-1">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
                <Clock className="h-3 w-3 text-purple-600" /> שהות באתר
              </div>
              <div className="text-lg font-display font-extrabold text-purple-700 dark:text-purple-400">
                {(totalSiteMin / 60).toFixed(1)}h
              </div>
            </div>
          </div>

          {/* חריגות שזוהו ביום זה */}
          {dayExceptions.length > 0 && (
            <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>חריגות שזוהו ביום זה ({dayExceptions.length})</span>
              </div>
              <div className="space-y-2">
                {dayExceptions.map((ex) => (
                  <div
                    key={ex.id}
                    className="p-2.5 rounded-xl bg-card border border-red-500/20 text-xs space-y-1"
                  >
                    <div className="font-bold text-red-950 dark:text-red-200 flex items-center justify-between">
                      <span>{ex.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-700 font-bold">
                        {ex.severity === "high"
                          ? "חמורה"
                          : ex.severity === "medium"
                            ? "בינונית"
                            : "נמוכה"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{ex.evidence}</div>
                    <div className="text-[11px] text-foreground font-medium">{ex.explanation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ציר זמן ורשימת הביקורים ליום */}
          <div className="space-y-3">
            <h4 className="font-display text-sm font-bold text-foreground flex items-center justify-between">
              <span>מסלול היום וביקורים ({driverVisits.length})</span>
              <span className="text-xs text-muted-foreground font-normal">לפי סדר כרונולוגי</span>
            </h4>

            {driverVisits.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed">
                אין ביקורים רשומים לתאריך ולנהג זה בגיליון.
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:right-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
                {driverVisits.map((v, idx) => {
                  const arrive = String(v["איתוראן: הגעה"] || "אין נתון");
                  const depart = String(v["איתוראן: יציאה"] || "אין נתון");
                  const pto = String(v["PTO משך (דק׳)"] || "");
                  const customer = String(v["לקוחות"] || "לקוח לא ידוע");
                  const address = String(v["כתובת"] || "כתובת לא צוינה");
                  const notes = String(v["תעודות"] || "");
                  const hw = String(v["חלון מנוף בכתב יד"] || "");
                  const sig = verifyCustomerSignature(undefined, hw);

                  return (
                    <div
                      key={idx}
                      className="relative pr-8 pl-3 py-3 rounded-2xl bg-card border border-border shadow-xs space-y-2 hover:border-primary/40 transition"
                    >
                      {/* עיגול על ציר הזמן */}
                      <span className="absolute right-2.5 top-5 h-3 w-3 rounded-full bg-primary ring-4 ring-card" />

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-display font-bold text-sm text-foreground">
                            {customer}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 text-primary shrink-0" />
                            <span>{address}</span>
                          </div>
                        </div>

                        <div className="text-left font-mono text-[11px] text-muted-foreground shrink-0">
                          <div>
                            {arrive} - {depart}
                          </div>
                        </div>
                      </div>

                      {/* תגיות ביקור */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                        {notes && (
                          <span className="px-2 py-0.5 rounded-md bg-muted text-foreground font-mono font-bold">
                            ת.מ. #{notes}
                          </span>
                        )}

                        {pto && pto !== "0" && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 font-bold">
                            מנוף PTO: {pto} דק׳
                          </span>
                        )}

                        {hw && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-800 font-bold">
                            כתב יד: {hw}
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-md font-bold ${
                            sig.hasSignature
                              ? "bg-emerald-500/15 text-emerald-800"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          חתימה: {sig.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
