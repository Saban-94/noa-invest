import { useState } from "react";
import { AlertTriangle, Gauge, X } from "lucide-react";
import { TachographCanvasViewer } from "./TachographCanvasViewer";

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
  stops: import("./TachographCanvasViewer").TachographStopOverlay[];
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

type InspectorTab = "summary" | "disc" | "stops";

function displayValue(value: string | null | undefined): string {
  return value?.trim() ? value : "לא צוין במקור";
}

export function CrossReferenceInspector({
  activeTruck,
  onSelectTruck,
  truckSummaries,
  discrepancies,
  onResolveDiscrepancy,
  onClose,
}: CrossReferenceInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("summary");
  const currentSummary =
    truckSummaries.find((item) => item.truck === activeTruck) ?? truckSummaries[0] ?? null;

  if (!currentSummary) {
    return (
      <div
        className="rounded-2xl border border-dashed border-[#223246] p-6 text-center text-xs text-slate-400"
        dir="rtl"
      >
        אין נתונים ממקור מאומת. לוח ההצלבות נשאר ריק ולא יוצגו ערכי ברירת מחדל.
      </div>
    );
  }

  const truckIssues = discrepancies.filter((item) => item.truck === currentSummary.truck);

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#223246] bg-[#0e1620] text-slate-100"
      dir="rtl"
      aria-label="מפקח הצלבות"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#223246] p-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Gauge className="h-4 w-4 text-emerald-400" />
            מפקח הצלבות ודיסקיות
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            משאית: {displayValue(currentSummary.truck)} · נהג: {displayValue(currentSummary.driver)}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#223246] hover:text-white"
            aria-label="סגור מפקח"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {truckSummaries.length > 1 && (
        <div className="border-b border-[#223246] p-3">
          <label className="mb-1 block text-[11px] text-slate-400" htmlFor="inspector-truck-select">
            בחירת משאית ממקור הנתונים
          </label>
          <select
            id="inspector-truck-select"
            value={currentSummary.truck}
            onChange={(event) => onSelectTruck(event.target.value)}
            className="w-full rounded-lg border border-[#223246] bg-[#172230] p-2 text-xs text-slate-100"
          >
            {truckSummaries.map((item) => (
              <option key={item.truck} value={item.truck}>
                {displayValue(item.driver)} · {displayValue(item.truck)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 border-b border-[#223246] p-3 text-center text-[11px]">
        <div>
          <div className="text-slate-500">ק״מ</div>
          <div className="font-bold">{displayValue(currentSummary.kmTotal)}</div>
        </div>
        <div>
          <div className="text-slate-500">PTO</div>
          <div className="font-bold">{displayValue(currentSummary.ptoTime)}</div>
        </div>
        <div>
          <div className="text-slate-500">נסיעה</div>
          <div className="font-bold">{displayValue(currentSummary.driveTime)}</div>
        </div>
        <div>
          <div className="text-slate-500">עצירות</div>
          <div className="font-bold">{currentSummary.stops.length}</div>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-[#223246] p-2" aria-label="תצוגת מפקח">
        {([
          ["summary", "חריגות"],
          ["disc", "דיסקית"],
          ["stops", "עצירות"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
              activeTab === id ? "bg-emerald-600 text-white" : "bg-[#172230] text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        {activeTab === "summary" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-[#223246] p-3">
              <div className="font-semibold">סטטוס מקור</div>
              <p className="mt-1 text-slate-400">{displayValue(currentSummary.verifiedStatus)}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                היעדר חריגות ברשימה אינו הוכחה שכל ההצלבות תקינות.
              </p>
            </div>
            {truckIssues.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#223246] p-4 text-slate-400">
                לא סופקו חריגות למשאית זו במידע שהועבר למסך. לא ניתן להסיק מכך שהנתונים תואמים.
              </p>
            ) : (
              truckIssues.map((issue) => (
                <article
                  key={issue.id}
                  className="rounded-xl border border-amber-800/40 bg-amber-950/30 p-3 text-amber-100"
                >
                  <div className="flex items-start gap-2 font-bold">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{issue.title}</span>
                  </div>
                  <p className="mt-1">{issue.description}</p>
                  <p className="mt-1 text-[11px] opacity-75">
                    {displayValue(issue.address)} · {displayValue(issue.driver)}
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold"
                    onClick={() => onResolveDiscrepancy(issue.id)}
                  >
                    הסר מהתצוגה (מקומי)
                  </button>
                </article>
              ))
            )}
          </div>
        )}

        {activeTab === "disc" && (
          <div className="space-y-2">
            <div className="rounded-lg border border-[#223246] p-3">
              <p>תאריך: {displayValue(currentSummary.date)}</p>
              <p className="mt-1">סוג משאית: {displayValue(currentSummary.truckType)}</p>
              <p className="mt-1">זמן עבודה: {displayValue(currentSummary.workTime)}</p>
              <p className="mt-1">זמן סרק: {displayValue(currentSummary.idleTime)}</p>
            </div>
            {currentSummary.discImage ? (
              <TachographCanvasViewer
                imageUrl={currentSummary.discImage}
                driver={currentSummary.driver}
                truck={currentSummary.truck}
                date={currentSummary.date}
                kmTotal={currentSummary.kmTotal}
                ptoHours={currentSummary.ptoTime}
                stops={currentSummary.stops}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-[#223246] p-4 text-slate-400">
                אין קישור דיסקית במקור — לא מוצגת תמונת דמה ולא נטען פענוח חזותי.
              </p>
            )}
          </div>
        )}

        {activeTab === "stops" && (
          <div className="space-y-2">
            {currentSummary.stops.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#223246] p-4 text-slate-400">
                אין עצירות במקור הנתונים שסופק.
              </p>
            ) : (
              currentSummary.stops.map((stop) => (
                <article key={stop.id} className="rounded-xl border border-[#223246] bg-[#121a24] p-3">
                  <div className="font-bold">{displayValue(stop.label)}</div>
                  <div className="mt-1 text-slate-400">{displayValue(stop.address)}</div>
                  <div className="mt-1 font-mono text-[11px] text-slate-500">
                    {displayValue(stop.arriveTime)} → {displayValue(stop.departTime)}
                  </div>
                  {typeof stop.ptoMin === "number" && (
                    <div className="mt-1 text-amber-300">PTO: {stop.ptoMin} דקות</div>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
