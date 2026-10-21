// src/routes/tachograph.tsx
// דף Tachograph · איתוראן GPS וטכוגרף – סעיף 7
// פריסה: מימין סריקת דיסקית (זום, סיבוב, נגטיב, ניגודיות), משמאל כותרת תאריך/משאית/נהג,
// כרטיסי KPI, הצלבה כרונולוגית, חריגים דטרמיניסטיים, ניתוח Gemini AI אמירתי וכפתורי אישור/תיקון

import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Disc,
  Truck,
  Calendar,
  AlertTriangle,
  Clock,
  Layers,
  Sparkles,
  CheckCircle2,
  Edit3,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Send,
  HelpCircle,
  FileText,
  MapPin,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { SmartDispatchNav } from "@/components/smart-dispatch/SmartDispatchNav";
import { TachographViewer } from "@/components/smart-dispatch/TachographViewer";
import { ConnectionDiagnosticCard } from "@/components/smart-dispatch/ConnectionDiagnosticCard";
import { DriverAvatar } from "@/components/smart-dispatch/DriverAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  getSmartDispatchBootstrapFn,
  getSmartDispatchDiscImageFn,
  saveSmartDispatchDiscFn,
  analyzeTachographAiFn,
} from "@/lib/smart-dispatch/server-functions";
import {
  identifyDriver,
  checkDiscOcrSuspicion,
  getEffectiveDiscMeta,
  calculateDayExceptions,
  verifyCustomerSignature,
  parseHandwrittenWindow,
  DRIVER_METAS,
} from "@/lib/smart-dispatch/rules-engine";
import type { TachographAiAnalysis } from "@/lib/smart-dispatch/gemini-tachograph";

export const Route = createFileRoute("/tachograph")({
  validateSearch: (search: Record<string, unknown>) => ({
    date: (search.date as string) || undefined,
    driver: (search.driver as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tachograph · איתוראן GPS — סידור חכם ח. סבן" },
      {
        name: "description",
        content: "פענוח דיסקיות טכוגרף, הצלבת PTO מול תעודות משלוח וניתוח Gemini AI.",
      },
    ],
  }),
  component: TachographPage,
});

function TachographPage() {
  const search = Route.useSearch();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editPlate, setEditPlate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<TachographAiAnalysis | null>(null);

  // 1. שליפת נתוני Bootstrap
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["smart-dispatch-bootstrap"],
    queryFn: () => getSmartDispatchBootstrapFn({ data: {} }),
    staleTime: 60000,
  });

  const discs = (data && data.success && data.data?.discs) || [];
  const visits = (data && data.success && data.data?.visits) || [];

  // דיסקית נוכחית
  const currentDisc = discs[selectedIndex] || discs[0];
  const ocrSuspicion = currentDisc
    ? checkDiscOcrSuspicion(currentDisc)
    : { isSuspicious: false, reasons: [] };
  const effectiveMeta = currentDisc
    ? getEffectiveDiscMeta(currentDisc)
    : { effectiveDate: "", effectiveTruck: "", isCorrected: false, isApproved: false };

  const iden = currentDisc
    ? identifyDriver(currentDisc["נהג"], effectiveMeta.effectiveTruck)
    : { driver: "other" as const, truck: "", cleanName: "" };
  const driverKey = iden.driver === "ali" ? "ali" : "hekmat";
  const driverMeta = DRIVER_METAS[driverKey];

  // 2. טעינת תמונת דיסקית לפי _link
  const discLink = currentDisc?._link || (currentDisc?.["קישור לדיסקית"] as string) || "";
  const {
    data: imageData,
    isLoading: isLoadingImage,
    error: imageError,
    refetch: refetchImage,
  } = useQuery({
    queryKey: ["disc-image", discLink],
    enabled: !!discLink,
    staleTime: Infinity,
    queryFn: () => getSmartDispatchDiscImageFn({ data: { link: discLink } }),
  });

  // 3. הצלבת ביקורים ליום ולמשאית הנבחרת
  const matchedVisits = useMemo(() => {
    if (!effectiveMeta.effectiveDate) return [];
    return visits.filter((v) => {
      const vDate = String(v["תאריך (yyyy-mm-dd)"] || v["תאריך"] || "").split("T")[0];
      const targetDate = effectiveMeta.effectiveDate.split("T")[0];
      const dateMatch =
        vDate === targetDate || vDate?.replace(/\//g, "-") === targetDate?.replace(/\//g, "-");

      const vTruck = String(v["משאית"] || "").replace(/[^0-9]/g, "");
      const targetTruck = effectiveMeta.effectiveTruck.replace(/[^0-9]/g, "");
      const truckMatch =
        !targetTruck || !vTruck || vTruck.includes(targetTruck) || targetTruck.includes(vTruck);

      return dateMatch && truckMatch;
    });
  }, [visits, effectiveMeta.effectiveDate, effectiveMeta.effectiveTruck]);

  // 4. חישוב חריגים דטרמיניסטיים לפני כל AI לפי סעיף 7.2
  const deterministicExceptions = useMemo(() => {
    return calculateDayExceptions({
      disc: currentDisc,
      visits: matchedVisits,
    });
  }, [currentDisc, matchedVisits]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <SmartDispatchNav />
        <div className="max-w-6xl mx-auto p-16 text-center text-muted-foreground space-y-2">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-sm font-bold">טוען דיסקיות וביקורים מהגיליון...</p>
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

  // 5. ניתוח Gemini AI אמיתי
  const handleRunAiAnalysis = async (force = false) => {
    setIsAnalyzingAi(true);
    try {
      const res = await analyzeTachographAiFn({
        data: {
          disc: currentDisc,
          visits: matchedVisits,
          exceptions: deterministicExceptions,
          imageBase64: imageData?.dataUrl,
          forceRefresh: force,
        },
      });
      setAiAnalysis(res);
      toast.success("ניתוח Gemini AI הושלם בהצלחה!");
    } catch (err) {
      toast.error("שגיאה בניתוח AI", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // 6. אישור דיסקית ותיקון לפי סעיף 7.4
  const handleSaveFix = async (approve = false) => {
    if (!currentDisc) return;
    setIsSaving(true);
    try {
      const res = await saveSmartDispatchDiscFn({
        data: {
          row: currentDisc._row,
          fix: {
            date: editDate.trim() || undefined,
            plate: editPlate.trim() || undefined,
            approve,
            approver: "ראמי מסארווה (סדרן ראשי)",
          },
        },
      });
      if (res.ok) {
        toast.success(approve ? "דיסקית אושרה בהצלחה בגיליון!" : "תיקון נשמר בהצלחה בגיליון!");
        setIsEditing(false);
        void refetch();
      } else {
        toast.error("שגיאה בשמירת נתוני הדיסקית");
      }
    } catch (err) {
      toast.error("כשל בשמירה", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SmartDispatchNav />

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* סרגל עליון: בחירת דיסקית וניווט */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Disc className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-display font-extrabold text-foreground">
                Tachograph · איתוראן GPS וטכוגרף
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                הצלבת דיסקיות 24H, זמני PTO באיתוראן, תעודות בכתב יד וניתוח Gemini AI
              </p>
            </div>
          </div>

          {/* דפדוף בדיסקיות */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              דיסקית {selectedIndex + 1} מתוך {discs.length || 1}
            </span>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIndex((i) => Math.max(i - 1, 0))}
              disabled={selectedIndex === 0}
              className="h-8 w-8 p-0 rounded-xl"
              title="דיסקית קודמת"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIndex((i) => Math.min(i + 1, discs.length - 1))}
              disabled={selectedIndex >= discs.length - 1}
              className="h-8 w-8 p-0 rounded-xl"
              title="דיסקית הבאה"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* פריסה דו-עמודית לפי סעיף 7: מימין סריקת הדיסקית, משמאל כותרת תאריך ונתונים */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* עמודה ימנית (5 מתוך 12): סריקת הדיסקית עם כלי תמונה אינטראקטיביים */}
          <div className="lg:col-span-5 space-y-4">
            <TachographViewer
              imageSrc={imageData?.dataUrl}
              isLoading={isLoadingImage}
              errorMessage={imageError instanceof Error ? imageError.message : undefined}
              onRetry={() => refetchImage()}
              discTitle={`דיסקית: ${effectiveMeta.effectiveDate} · ${effectiveMeta.effectiveTruck}`}
            />

            {/* באנר OCR חשוד / מתוקן */}
            {ocrSuspicion.isSuspicious && !effectiveMeta.isCorrected && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>זוהה OCR חשוד בדיסקית (אין להמציא תיקון)</span>
                </div>
                <ul className="list-disc pr-5 space-y-1 text-[11px]">
                  {ocrSuspicion.reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(true);
                      setEditDate(effectiveMeta.effectiveDate);
                      setEditPlate(effectiveMeta.effectiveTruck);
                    }}
                    className="gap-1.5 rounded-xl text-xs h-7 font-bold border-amber-600/40 text-amber-900"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>תקן תאריך / משאית באופן ידני</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* עמודה שמאלית (7 מתוך 12): כותרת, כרטיסי KPI, הצלבה, חריגות ו-AI */}
          <div className="lg:col-span-7 space-y-5">
            {/* כותרת דיסקית ופרופיל נהג */}
            <Card className="p-5 rounded-3xl border border-border shadow-card space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                <div className="flex items-center gap-3">
                  <DriverAvatar driver={driverKey} size="lg" showBadge />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-display font-extrabold text-foreground">
                        {effectiveMeta.effectiveDate || "אין תאריך"}
                      </h2>
                      {effectiveMeta.isCorrected && (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-800 text-[10px] font-bold">
                          תאריך/משאית מתוקנים
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="font-mono font-bold text-foreground">
                        {effectiveMeta.effectiveTruck || "אין רישוי"}
                      </span>
                      <span>·</span>
                      <span>{driverMeta.nameHe}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {effectiveMeta.isApproved ? (
                    <span className="px-3 py-1.5 rounded-2xl bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>אושר: {effectiveMeta.approvedBy}</span>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleSaveFix(true)}
                      disabled={isSaving}
                      className="gap-1.5 rounded-2xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>אשר דיסקית</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditing((v) => !v);
                      setEditDate(effectiveMeta.effectiveDate);
                      setEditPlate(effectiveMeta.effectiveTruck);
                    }}
                    className="gap-1.5 rounded-2xl text-xs font-bold"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>תקן פרטים</span>
                  </Button>
                </div>
              </div>

              {/* טופס תיקון ידני */}
              {isEditing && (
                <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-3">
                  <h4 className="font-bold text-xs">תיקון תאריך ומשאית (נכתב לעמודות הגיליון):</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-1">
                        תאריך מתוקן (YYYY-MM-DD):
                      </label>
                      <input
                        type="text"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        placeholder="2026-10-21"
                        className="w-full rounded-xl bg-card border border-border px-3 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-1">
                        משאית מתוקנת:
                      </label>
                      <input
                        type="text"
                        value={editPlate}
                        onChange={(e) => setEditPlate(e.target.value)}
                        placeholder="615-41-002"
                        className="w-full rounded-xl bg-card border border-border px-3 py-1.5 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleSaveFix(false)}
                      disabled={isSaving}
                      className="rounded-xl text-xs font-bold"
                    >
                      שמור תיקון בגיליון
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditing(false)}
                      className="rounded-xl text-xs"
                    >
                      ביטול
                    </Button>
                  </div>
                </div>
              )}

              {/* כרטיסי KPI מהטאב */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-3 rounded-2xl bg-muted/30 border border-border space-y-1">
                  <div className="text-[11px] text-muted-foreground font-semibold">
                    סה״כ ק״מ דיסקית
                  </div>
                  <div className="text-xl font-display font-extrabold text-foreground">
                    {currentDisc?.['סה"כ ק"מ'] || "אין נתון"}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-muted/30 border border-border space-y-1">
                  <div className="text-[11px] text-muted-foreground font-semibold">זמן נסיעה</div>
                  <div className="text-xl font-display font-extrabold text-cyan-700 dark:text-cyan-400">
                    {currentDisc?.["זמן נסיעה"] || "אין נתון"}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-muted/30 border border-border space-y-1">
                  <div className="text-[11px] text-muted-foreground font-semibold">
                    זמן מנוף דיסקית
                  </div>
                  <div className="text-xl font-display font-extrabold text-amber-700 dark:text-amber-400">
                    {currentDisc?.["זמן מנוף"] || "אין נתון"}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-muted/30 border border-border space-y-1">
                  <div className="text-[11px] text-muted-foreground font-semibold">
                    ביקורים שהוצלבו
                  </div>
                  <div className="text-xl font-display font-extrabold text-foreground">
                    {matchedVisits.length}
                  </div>
                </div>
              </div>
            </Card>

            {/* 7.3 ניתוח Gemini AI אמיתי */}
            <Card className="p-5 rounded-3xl border border-border shadow-card space-y-4 bg-gradient-to-br from-card to-emerald-500/5">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-display font-bold text-base text-foreground">
                    ניתוח Gemini AI — עובדות וחריגים
                  </h3>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRunAiAnalysis(true)}
                  disabled={isAnalyzingAi}
                  className="gap-1.5 rounded-xl text-xs font-bold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzingAi ? "animate-spin" : ""}`} />
                  <span>{aiAnalysis ? "נתח מחדש" : "הפעל ניתוח AI"}</span>
                </Button>
              </div>

              {!aiAnalysis && !isAnalyzingAi ? (
                <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                  <p>הניתוח מסתמך על הנתונים הדטרמיניסטיים ומונע הזיות עובדתיות.</p>
                  <Button
                    size="sm"
                    onClick={() => handleRunAiAnalysis()}
                    className="gap-1.5 rounded-xl text-xs font-bold"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>בצע ניתוח יום באמצעות Gemini</span>
                  </Button>
                </div>
              ) : isAnalyzingAi ? (
                <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-emerald-600" />
                  <p className="font-bold">מבצע ניתוח AI בשרת...</p>
                  <p>הצלבת שעות פריקה, חישוב סדר עדיפויות וניסוח שאלות לנהג</p>
                </div>
              ) : (
                aiAnalysis && (
                  <div className="space-y-4 text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-foreground">{aiAnalysis.title}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="px-2 py-0.5 rounded-full bg-muted font-mono">
                          מבוסס על {aiAnalysis.rowsAnalyzedCount} שורות
                        </span>
                        <span>{aiAnalysis.generatedAt}</span>
                      </div>
                    </div>

                    {aiAnalysis.isVisualAssessment && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-900 border border-amber-500/20 text-[11px] font-semibold">
                        ⚠️ תמונת הדיסקית צורפה: הפלט מהווה הערכה חזותית, לא מדידה מכנית.
                      </div>
                    )}

                    <div className="p-3.5 rounded-2xl bg-card border border-border leading-relaxed text-foreground font-medium">
                      {aiAnalysis.dailySummary}
                    </div>

                    {/* סדר עדיפות לחריגים */}
                    {aiAnalysis.prioritizedExceptions.length > 0 && (
                      <div className="space-y-2">
                        <div className="font-bold text-foreground">סדר עדיפות לחריגים:</div>
                        <div className="space-y-1.5">
                          {aiAnalysis.prioritizedExceptions.map((item, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-xl bg-muted/30 border border-border flex items-start justify-between gap-2 text-[11px]"
                            >
                              <div>
                                <span className="font-bold text-foreground">{item.title}</span>
                                <p className="text-muted-foreground mt-0.5">{item.rationale}</p>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold shrink-0 ${
                                  item.priority === "גבוהה"
                                    ? "bg-red-500/15 text-red-700"
                                    : item.priority === "בינונית"
                                      ? "bg-amber-500/15 text-amber-800"
                                      : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {item.priority}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* שאלות לבירור מול הנהג */}
                    {aiAnalysis.driverQuestions.length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                        <div className="font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                          <HelpCircle className="h-4 w-4 text-emerald-600" />
                          <span>שאלות מומלצות לבירור מול הנהג:</span>
                        </div>
                        <ul className="list-disc pr-5 space-y-1 text-emerald-900/90 dark:text-emerald-200/90 text-[11px]">
                          {aiAnalysis.driverQuestions.map((q, idx) => (
                            <li key={idx}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              )}
            </Card>

            {/* 7.1 הצלבה מול תעודת משלוח בכתב יד בסדר כרונולוגי */}
            <Card className="p-5 rounded-3xl border border-border shadow-card space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-display font-bold text-base text-foreground">
                    הצלבה כרונולוגית מול תעודות משלוח ואיתוראן ({matchedVisits.length} ביקורים)
                  </h3>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  תחילת העמסה → הגעה → PTO
                </span>
              </div>

              {matchedVisits.length === 0 ? (
                <div className="p-10 text-center text-xs text-muted-foreground bg-muted/20 rounded-2xl border border-dashed">
                  אין ביקורים להצלבה, בדוק תאריך
                </div>
              ) : (
                <div className="space-y-3">
                  {matchedVisits.map((v, idx) => {
                    const arrive = String(v["איתוראן: הגעה"] || "אין נתון");
                    const depart = String(v["איתוראן: יציאה"] || "אין נתון");
                    const ptoOpen = String(v["PTO פתיחה"] || "");
                    const ptoClose = String(v["PTO סגירה"] || "");
                    const ptoMin = parseFloat(String(v["PTO משך (דק׳)"] || "0")) || 0;
                    const hwRaw = String(v["חלון מנוף בכתב יד"] || "");
                    const hw = parseHandwrittenWindow(hwRaw);
                    const notes = String(v["תעודות"] || "");
                    const customer = String(v["לקוחות"] || "לקוח");
                    const address = String(v["כתובת"] || "");

                    // האם בוצע: אומת באיתוראן / דווח בכתב יד בלבד / לא אומת
                    const isIturanVerified =
                      ptoMin > 0 || (arrive !== "אין נתון" && depart !== "אין נתון");
                    const isHwOnly = !isIturanVerified && hw.valid;
                    const statusLabel = isIturanVerified
                      ? "אומת באיתוראן ✅"
                      : isHwOnly
                        ? "דווח בכתב יד בלבד 📝"
                        : "לא אומת ⚠️";

                    // בדיקת חתימה
                    const sig = verifyCustomerSignature(undefined, hwRaw);

                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3 text-xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                          <div>
                            <div className="font-display font-bold text-sm text-foreground">
                              {customer}
                            </div>
                            <div className="text-muted-foreground text-[11px] flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-primary shrink-0" />
                              <span>{address}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isIturanVerified
                                  ? "bg-emerald-500/15 text-emerald-800"
                                  : isHwOnly
                                    ? "bg-amber-500/15 text-amber-800"
                                    : "bg-red-500/15 text-red-700"
                              }`}
                            >
                              {statusLabel}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                sig.hasSignature
                                  ? "bg-emerald-500/10 text-emerald-800"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              חתימה: {sig.label}
                            </span>
                          </div>
                        </div>

                        {/* ציר שלבי ביקור: העמסה → הגעה/יציאה → PTO מול כתב יד */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                          <div className="p-2 rounded-xl bg-muted/40 space-y-0.5">
                            <span className="text-muted-foreground font-semibold">
                              איתוראן (הגעה ויציאה)
                            </span>
                            <div className="font-mono font-bold text-foreground">
                              {arrive} – {depart}
                            </div>
                          </div>

                          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-950 dark:text-amber-200 space-y-0.5">
                            <span className="text-amber-800/80 font-semibold">PTO איתוראן</span>
                            <div className="font-mono font-bold">
                              {ptoMin > 0
                                ? `${ptoMin} דק׳ (${ptoOpen} - ${ptoClose})`
                                : "אין הפעלת מנוף"}
                            </div>
                          </div>

                          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-950 dark:text-purple-200 space-y-0.5">
                            <span className="text-purple-800/80 font-semibold">
                              כתב יד (חלון מנוף)
                            </span>
                            <div className="font-mono font-bold">
                              {hw.valid
                                ? `${hw.durationMin} דק׳ (${hw.start} - ${hw.end})`
                                : hwRaw || "אין דיווח"}
                            </div>
                          </div>
                        </div>

                        {notes && (
                          <div className="flex items-center justify-between text-[11px] pt-1">
                            <span className="font-mono text-muted-foreground">ת.מ. #{notes}</span>
                            <a
                              href={`/notes/${notes.split(",")[0]?.trim()}`}
                              className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                            >
                              <span>צפה בתעודת משלוח</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* 7.2 חריגים דטרמיניסטיים */}
            {deterministicExceptions.length > 0 && (
              <Card className="p-5 rounded-3xl border border-red-500/30 bg-red-500/5 shadow-card space-y-3">
                <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>חריגות דטרמיניסטיות שחושבו בקוד ({deterministicExceptions.length})</span>
                </div>

                <div className="space-y-2">
                  {deterministicExceptions.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-3 rounded-2xl bg-card border border-red-500/20 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-950 dark:text-red-200">{ex.title}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 font-bold">
                          {ex.severity === "high"
                            ? "חמורה"
                            : ex.severity === "medium"
                              ? "בינונית"
                              : "נמוכה"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {ex.evidence}
                      </div>
                      <div className="text-[11px] text-foreground font-medium">
                        {ex.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
