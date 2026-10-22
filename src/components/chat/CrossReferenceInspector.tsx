import { useState } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Gauge,
  MapPin,
  FileText,
  ChevronDown,
  X,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { TachographCanvasViewer, type TachographStopOverlay } from "./TachographCanvasViewer";

export interface DriverTruckSummary {
  driver: string;
  truck: string;
  truckType: string;
  date: string;
  kmTotal: string;
  driveTime: string;
  workTime: string;
  ptoTime: string;
  idleTime: string;
  discImage?: string;
  verifiedStatus: string;
  stops: TachographStopOverlay[];
}

export interface DiscrepancyItem {
  id: string;
  truck: string;
  driver: string;
  address: string;
  type: "pto_missing" | "reversed_window" | "time_gap" | "outlier_crane" | "missing_plate";
  severity: "alert" | "warning" | "nominal";
  title: string;
  description: string;
  details?: Record<string, unknown>;
  resolved?: boolean;
}

interface CrossReferenceInspectorProps {
  activeTruck: string;
  onSelectTruck: (truck: string) => void;
  truckSummaries: DriverTruckSummary[];
  discrepancies: DiscrepancyItem[];
  onResolveDiscrepancy: (id: string) => void;
  onClose?: () => void;
  isMobile?: boolean;
}

export function CrossReferenceInspector({
  activeTruck,
  onSelectTruck,
  truckSummaries,
  discrepancies,
  onResolveDiscrepancy,
  onClose,
  isMobile = false,
}: CrossReferenceInspectorProps) {
  const [activeTab, setActiveTab] = useState<"disc" | "closed_loop" | "stops">("closed_loop");

  const currentSummary = truckSummaries.find((t) => t.truck === activeTruck) ||
    truckSummaries[0] || {
      driver: "חכמת גאבר",
      truck: "615-41-002",
      truckType: "מרצדס מנוף 32 טון",
      date: "15/10/2026",
      kmTotal: "140",
      driveTime: "03:45",
      workTime: "04:10",
      ptoTime: "02:15",
      idleTime: "00:35",
      verifiedStatus: "תקין מול איתוראן",
      stops: [],
    };

  const truckIssues = discrepancies.filter((d) => d.truck === currentSummary.truck);

  return (
    <div className="flex h-full flex-col bg-[#131c26] text-slate-100 overflow-hidden border-r border-[#223246] lg:border-r-0 lg:border-l lg:border-[#223246]">
      {/* Inspector Top Bar */}
      <div className="flex items-center justify-between border-b border-[#223246] px-4 py-3 bg-[#0e1620]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Gauge className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span>מפקח הצלבות ודיסקיות</span>
              {truckIssues.length > 0 && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300 tabular-nums">
                  {truckIssues.length} חריגות
                </span>
              )}
            </h2>
            <div className="text-[11px] text-slate-400 font-medium">
              הצלבה סגורה: תעודת גליה ⟷ איתוראן GPS ⟷ דיסקית
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Driver Switcher */}
          <div className="relative">
            <select
              value={currentSummary.truck}
              onChange={(e) => onSelectTruck(e.target.value)}
              className="appearance-none bg-[#172230] text-xs font-semibold text-slate-200 border border-[#223246] rounded-xl px-2.5 py-1.5 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {truckSummaries.map((s) => (
                <option key={s.truck} value={s.truck}>
                  {s.driver} · {s.truck}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#223246] transition"
              title="סגור חלונית פיקוח"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-4 gap-2 p-3 border-b border-[#223246] bg-[#0b1118]/60 text-xs">
        <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-2 text-center">
          <span className="text-[10px] text-slate-400 block mb-0.5">סה״כ ק״מ</span>
          <b className="text-sm font-extrabold text-white font-mono tabular-nums">
            {currentSummary.kmTotal}
          </b>
        </div>
        <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-2 text-center">
          <span className="text-[10px] text-slate-400 block mb-0.5">זמן מנוף PTO</span>
          <b className="text-sm font-extrabold text-amber-400 font-mono tabular-nums">
            {currentSummary.ptoTime}
          </b>
        </div>
        <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-2 text-center">
          <span className="text-[10px] text-slate-400 block mb-0.5">זמן נסיעה</span>
          <b className="text-sm font-extrabold text-sky-400 font-mono tabular-nums">
            {currentSummary.driveTime}
          </b>
        </div>
        <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-2 text-center">
          <span className="text-[10px] text-slate-400 block mb-0.5">ביקורים</span>
          <b className="text-sm font-extrabold text-emerald-400 font-mono tabular-nums">
            {currentSummary.stops.length || 2}
          </b>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#223246] px-3 bg-[#0e1620] text-xs">
        <button
          onClick={() => setActiveTab("closed_loop")}
          className={`px-3 py-2.5 font-bold transition-colors border-b-2 ${
            activeTab === "closed_loop"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          אימות לולאה סגורה (4 שלבים)
        </button>
        <button
          onClick={() => setActiveTab("disc")}
          className={`px-3 py-2.5 font-bold transition-colors border-b-2 ${
            activeTab === "disc"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          קנבס דיסקית חזותי
        </button>
        <button
          onClick={() => setActiveTab("stops")}
          className={`px-3 py-2.5 font-bold transition-colors border-b-2 ${
            activeTab === "stops"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          תחנות איתוראן וביקורים
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "closed_loop" && (
          <div className="space-y-3.5">
            {/* Step A: Comax Delivery Note */}
            <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs">
                    A
                  </span>
                  <h3 className="text-xs font-bold text-white">תעודת גליה / קומקס (כתב יד)</h3>
                </div>
                <span className="text-[10px] text-emerald-400 font-medium">נחתם ע״י לקוח ✓</span>
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <p>• חלון מנוף מחולץ: "פריקת מנוף 09:20 עד 10:00 (40 דק׳)"</p>
                <p className="text-slate-400">• תעודות מצורפות: 6715766, 6715767</p>
                <p className="text-slate-400">• לקוח: א. ערן אזולאי בע״מ · משה שרת 9, הוד השרון</p>
              </div>
            </div>

            {/* Step B: Ituran GPS */}
            <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-500/20 text-sky-400 font-mono font-bold text-xs">
                    B
                  </span>
                  <h3 className="text-xs font-bold text-white">איתוראן GPS וחיישן PTO</h3>
                </div>
                <span className="text-[10px] text-sky-400 font-medium font-mono tabular-nums">
                  09:15 - 10:00 (45 דק׳)
                </span>
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <p>• זמן הגעה: 09:15 | זמן יציאה: 10:00 (סה״כ 45 דק׳ באתר)</p>
                <p>• אירוע PTO פתיחה: 09:20 | PTO סגירה: 09:58 (38 דק׳ עבודת מנוף)</p>
                <p className="text-emerald-400">• פער מול כתב יד: 2 דק׳ בלבד (תקין בטווח שגיאה)</p>
              </div>
            </div>

            {/* Step C: Tachograph Disc Vision */}
            <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/20 text-amber-400 font-mono font-bold text-xs">
                    C
                  </span>
                  <h3 className="text-xs font-bold text-white">אימות חזותי בדיסקית טכוגרף</h3>
                </div>
                <button
                  onClick={() => setActiveTab("disc")}
                  className="text-[11px] text-amber-400 hover:underline font-semibold"
                >
                  פתח בקנבס מלא ↗
                </button>
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <p>• התאמת חריטות מחט: נראית בליטה מעגלית רציפה בין 09:20 ל-10:00</p>
                <p>• מהירות בעת הפריקה: 0 קמ״ש (אימות מנוף סטטי)</p>
                <p className="text-slate-400">
                  • סה״כ קילומטראז׳ יומי מצטבר: {currentSummary.kmTotal} ק״מ
                </p>
              </div>

              {/* Inline compact preview of canvas */}
              <div className="mt-3">
                <TachographCanvasViewer
                  imageUrl={currentSummary.discImage}
                  driver={currentSummary.driver}
                  truck={currentSummary.truck}
                  date={currentSummary.date}
                  kmTotal={currentSummary.kmTotal}
                  ptoHours={currentSummary.ptoTime}
                  stops={currentSummary.stops}
                  height={220}
                  compact={true}
                />
              </div>
            </div>

            {/* Step D: Discrepancy Flagging Engine */}
            <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-purple-500/20 text-purple-400 font-mono font-bold text-xs">
                    D
                  </span>
                  <h3 className="text-xs font-bold text-white">
                    מנוע גילוי חריגות ואימות אוטונומי
                  </h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">נועה AI</span>
              </div>

              {truckIssues.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>כל הצלבות היום תואמות במלואן ללא חריגות PTO או פערי זמנים!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {truckIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                        issue.severity === "alert"
                          ? "bg-red-950/30 border-red-800/40 text-red-200"
                          : "bg-amber-950/30 border-amber-800/40 text-amber-200"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>{issue.title}</span>
                        </span>
                        <span className="text-[10px] opacity-80">{issue.address}</span>
                      </div>
                      <p className="text-[11px] opacity-90">{issue.description}</p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => onResolveDiscrepancy(issue.id)}
                          className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-semibold transition"
                        >
                          סמן כנבדק ע״י ראמי
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "disc" && (
          <div className="space-y-3">
            <TachographCanvasViewer
              imageUrl={currentSummary.discImage}
              driver={currentSummary.driver}
              truck={currentSummary.truck}
              date={currentSummary.date}
              kmTotal={currentSummary.kmTotal}
              ptoHours={currentSummary.ptoTime}
              stops={currentSummary.stops}
              height={380}
            />

            <div className="rounded-xl border border-[#223246] bg-[#172230]/70 p-3 text-xs space-y-1.5 text-slate-300">
              <div className="font-bold text-white flex items-center justify-between">
                <span>בקרת אימות דיסקית — ראמי מסארווה</span>
                <span className="text-emerald-400 font-mono text-[11px]">
                  {currentSummary.verifiedStatus}
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                במצב נגטיב וחדות מוגברת, ניתן להבחין ברטט המהירות בזמן נסיעה (0-80 קמ״ש) לעומת קו
                האפס הרציף בעת פריקת מנוף.
              </p>
            </div>
          </div>
        )}

        {activeTab === "stops" && (
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-slate-300 mb-1">
              תחנות איתוראן ורצף ביקורים עבור {currentSummary.driver}:
            </div>

            {currentSummary.stops.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-6">
                אין תחנות איתוראן מתועדות לתאריך זה.
              </div>
            ) : (
              currentSummary.stops.map((stop, index) => (
                <div
                  key={stop.id}
                  className="rounded-xl border border-[#223246] bg-[#172230]/80 p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px]">
                        {index + 1}
                      </span>
                      <span>{stop.address}</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {stop.arriveTime} - {stop.departTime}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-[#223246]/60">
                    <span>{stop.label}</span>
                    {stop.ptoMin ? (
                      <span className="text-amber-400 font-semibold font-mono">
                        PTO: {stop.ptoMin} דק׳ ({stop.ptoOpen} - {stop.ptoClose})
                      </span>
                    ) : (
                      <span className="text-slate-500">ללא הפעלת PTO</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
