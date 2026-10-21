// src/routes/quality.tsx
// מסך איכות נתונים – סעיף 5.6
// כולל: דגלי איכות, OCR חשוד, תעודות ללא התאמת איתוראן, PTO יתומים, חלונות מנוף הפוכים
// עם פעולת תיקון שנכתבת חזרה לגיליון

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Edit3,
  FileText,
  Layers,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
} from "lucide-react";
import { SmartDispatchNav } from "@/components/smart-dispatch/SmartDispatchNav";
import { ConnectionDiagnosticCard } from "@/components/smart-dispatch/ConnectionDiagnosticCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  getSmartDispatchBootstrapFn,
  saveSmartDispatchDiscFn,
} from "@/lib/smart-dispatch/server-functions";
import {
  checkDiscOcrSuspicion,
  parseHandwrittenWindow,
  verifyCustomerSignature,
} from "@/lib/smart-dispatch/rules-engine";
import type { RawDiscRecord, RawVisitRecord } from "@/lib/smart-dispatch/apps-script-contract";

export const Route = createFileRoute("/quality")({
  head: () => ({
    meta: [
      { title: "איכות נתונים ובקרה — סידור חכם ח. סבן" },
      {
        name: "description",
        content: "דגלי איכות, זיהוי OCR חשוד, חלונות מנוף הפוכים ו-PTO יתומים.",
      },
    ],
  }),
  component: DataQualityPage,
});

function DataQualityPage() {
  const [filterType, setFilterType] = useState<string>("all");
  const [fixingDiscRow, setFixingDiscRow] = useState<number | null>(null);
  const [fixDate, setFixDate] = useState("");
  const [fixPlate, setFixPlate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["smart-dispatch-bootstrap"],
    queryFn: () => getSmartDispatchBootstrapFn({ data: {} }),
    staleTime: 60000,
  });

  const discs = data?.data?.discs || [];
  const visits = data?.data?.visits || [];

  // 1. איתור דיסקיות עם OCR חשוד
  const suspiciousDiscs = useMemo(() => {
    return discs
      .map((d) => {
        const ocr = checkDiscOcrSuspicion(d);
        return { disc: d, ocr };
      })
      .filter((x) => x.ocr.isSuspicious);
  }, [discs]);

  // 2. איתור חלונות מנוף הפוכים בכתב יד
  const reversedWindows = useMemo(() => {
    return visits
      .map((v, idx) => {
        const raw = String(v["חלון מנוף בכתב יד"] || "");
        const hw = parseHandwrittenWindow(raw);
        return { visit: v, hw, raw, index: idx };
      })
      .filter((x) => x.hw.isReversed);
  }, [visits]);

  // 3. איתור ביקורים/עצירות ללא התאמת איתוראן
  const unmatchedVisits = useMemo(() => {
    return visits.filter((v) => {
      const arrive = String(v["איתוראן: הגעה"] || "");
      const depart = String(v["איתוראן: יציאה"] || "");
      return !arrive || !depart || arrive === "אין נתון" || depart === "אין נתון";
    });
  }, [visits]);

  // 4. איתור PTO ללא תעודות
  const orphanPtos = useMemo(() => {
    return visits.filter((v) => {
      const ptoMin = parseFloat(String(v["PTO משך (דק׳)"] || "0")) || 0;
      const notes = String(v["תעודות"] || "").trim();
      return ptoMin > 0 && !notes;
    });
  }, [visits]);

  const handleSaveDiscFix = async (row: number) => {
    setIsSaving(true);
    try {
      const res = await saveSmartDispatchDiscFn({
        data: {
          row,
          fix: {
            date: fixDate.trim() || undefined,
            plate: fixPlate.trim() || undefined,
            approve: false,
            approver: "ראמי מסארווה (בקרת איכות)",
          },
        },
      });
      if (res.ok) {
        toast.success(`שורה ${row} תוקנה בהצלחה בגיליון!`);
        setFixingDiscRow(null);
        void refetch();
      }
    } catch (err) {
      toast.error("שגיאה בשמירת התיקון", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <SmartDispatchNav />
        <div className="max-w-6xl mx-auto p-16 text-center text-muted-foreground">
          טוען נתוני בקרת איכות מהגיליון...
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
              <ShieldAlert className="h-6 w-6 text-primary" />
              <span>בקרת איכות נתונים ותיקון שגיאות</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              איתור OCR משובש, חלונות מנוף הפוכים, דיווחי GPS חסרים ו-PTO יתומים
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 rounded-xl text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>רענן בדיקה</span>
            </Button>
          </div>
        </div>

        {/* כרטיסי סיכום חריגות איכות */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <button
            type="button"
            onClick={() => setFilterType("ocr")}
            className={`p-4 rounded-3xl border text-right transition ${
              filterType === "ocr"
                ? "bg-amber-500/10 border-amber-500 shadow-xs ring-2 ring-amber-500/30"
                : "bg-card border-border hover:bg-muted/40"
            }`}
          >
            <div className="text-muted-foreground font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span>דיסקיות OCR חשודות</span>
            </div>
            <div className="text-2xl font-display font-extrabold text-foreground mt-1">
              {suspiciousDiscs.length}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setFilterType("reversed")}
            className={`p-4 rounded-3xl border text-right transition ${
              filterType === "reversed"
                ? "bg-red-500/10 border-red-500 shadow-xs ring-2 ring-red-500/30"
                : "bg-card border-border hover:bg-muted/40"
            }`}
          >
            <div className="text-muted-foreground font-semibold flex items-center gap-1">
              <RotateCcw className="h-3.5 w-3.5 text-red-500" />
              <span>חלונות מנוף הפוכים</span>
            </div>
            <div className="text-2xl font-display font-extrabold text-foreground mt-1">
              {reversedWindows.length}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setFilterType("unmatched")}
            className={`p-4 rounded-3xl border text-right transition ${
              filterType === "unmatched"
                ? "bg-purple-500/10 border-purple-500 shadow-xs ring-2 ring-purple-500/30"
                : "bg-card border-border hover:bg-muted/40"
            }`}
          >
            <div className="text-muted-foreground font-semibold flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-purple-500" />
              <span>ללא אימות איתוראן</span>
            </div>
            <div className="text-2xl font-display font-extrabold text-foreground mt-1">
              {unmatchedVisits.length}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setFilterType("orphan")}
            className={`p-4 rounded-3xl border text-right transition ${
              filterType === "orphan"
                ? "bg-cyan-500/10 border-cyan-500 shadow-xs ring-2 ring-cyan-500/30"
                : "bg-card border-border hover:bg-muted/40"
            }`}
          >
            <div className="text-muted-foreground font-semibold flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-cyan-500" />
              <span>PTO יתומים</span>
            </div>
            <div className="text-2xl font-display font-extrabold text-foreground mt-1">
              {orphanPtos.length}
            </div>
          </button>
        </div>

        {/* 1. רשימת דיסקיות OCR חשודות עם פעולת תיקון בגיליון */}
        {(filterType === "all" || filterType === "ocr") && suspiciousDiscs.length > 0 && (
          <Card className="p-6 rounded-3xl border border-amber-500/30 bg-card shadow-card space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-sm">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <span>דיסקיות עם פענוח OCR חשוד ({suspiciousDiscs.length})</span>
              </div>
              <span className="text-xs text-muted-foreground">
                העדפת תאריך ומשאית מתוקנים על פני OCR
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {suspiciousDiscs.map(({ disc, ocr }) => {
                const isFixing = fixingDiscRow === disc._row;
                const correctedDate = String(disc["תאריך מתוקן"] || "");
                const correctedPlate = String(disc["משאית מתוקנת"] || "");

                return (
                  <div
                    key={disc._row}
                    className="p-4 rounded-2xl bg-muted/30 border border-border space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-2">
                          <span>שורה {disc._row} בארכיון_טכוגרף</span>
                          {correctedDate && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 text-[10px]">
                              תוקן: {correctedDate} · {correctedPlate}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-[11px] mt-0.5">
                          תאריך גולמי: {disc["תאריך דיסקית"] || "ריק"} | משאית גולמית:{" "}
                          {disc["רישוי / משאית"] || "ריק"} | נהג: {disc["נהג"] || "ריק"}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFixingDiscRow(isFixing ? null : disc._row);
                          setFixDate(correctedDate || String(disc["תאריך דיסקית"] || ""));
                          setFixPlate(correctedPlate || String(disc["רישוי / משאית"] || ""));
                        }}
                        className="gap-1.5 rounded-xl text-xs font-bold shrink-0"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span>{isFixing ? "סגור עריכה" : "תקן בגיליון"}</span>
                      </Button>
                    </div>

                    <div className="text-red-700 dark:text-red-300 font-semibold text-[11px]">
                      סיבות החשד: {ocr.reasons.join(", ")}
                    </div>

                    {isFixing && (
                      <div className="p-3 rounded-xl bg-card border border-amber-500/30 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-muted-foreground">
                              תאריך מתוקן (YYYY-MM-DD):
                            </label>
                            <input
                              type="text"
                              value={fixDate}
                              onChange={(e) => setFixDate(e.target.value)}
                              placeholder="2026-10-21"
                              className="w-full rounded-lg bg-muted/40 border border-border px-2.5 py-1 font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted-foreground">
                              משאית מתוקנת:
                            </label>
                            <input
                              type="text"
                              value={fixPlate}
                              onChange={(e) => setFixPlate(e.target.value)}
                              placeholder="615-41-002"
                              className="w-full rounded-lg bg-muted/40 border border-border px-2.5 py-1 font-mono text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={() => handleSaveDiscFix(disc._row)}
                            disabled={isSaving}
                            className="rounded-lg text-xs font-bold h-7"
                          >
                            שמור תיקון
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* 2. חלונות מנוף הפוכים בכתב יד */}
        {(filterType === "all" || filterType === "reversed") && reversedWindows.length > 0 && (
          <Card className="p-6 rounded-3xl border border-red-500/30 bg-card shadow-card space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-red-950 dark:text-red-200 font-bold text-sm">
                <RotateCcw className="h-5 w-5 text-red-600" />
                <span>חלונות מנוף הפוכים בכתב יד ({reversedWindows.length})</span>
              </div>
              <span className="text-xs text-muted-foreground">
                הוחרגו אוטומטית מחישובי הסטטיסטיקה
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              {reversedWindows.map(({ visit, raw }, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-red-500/5 border border-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-bold text-foreground">
                      {visit["לקוחות"] || "לקוח לא ידוע"} · {visit["כתובת"] || "כתובת"}
                    </div>
                    <div className="text-muted-foreground text-[11px] mt-0.5">
                      תאריך: {visit["תאריך (yyyy-mm-dd)"] || visit["תאריך"]} | תעודות:{" "}
                      {visit["תעודות"] || "—"}
                    </div>
                  </div>

                  <div className="text-left font-mono text-red-700 font-bold">
                    דיווח הפוך: "{raw}"
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 3. ללא אימות איתוראן */}
        {(filterType === "all" || filterType === "unmatched") && unmatchedVisits.length > 0 && (
          <Card className="p-6 rounded-3xl border border-border bg-card shadow-card space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                <FileText className="h-5 w-5 text-purple-600" />
                <span>תעודות ללא התאמת איתוראן ({unmatchedVisits.length})</span>
              </div>
              <span className="text-xs text-muted-foreground">מציגים "אין נתון" ללא ערך מומצא</span>
            </div>

            <div className="space-y-2 text-xs">
              {unmatchedVisits.slice(0, 10).map((v, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-muted/30 border border-border flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold">{v["לקוחות"] || "לקוח"}</span>
                    <span className="text-muted-foreground mx-1">·</span>
                    <span className="text-muted-foreground">{v["כתובת"]}</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">
                    ת.מ. #{v["תעודות"] || "—"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
