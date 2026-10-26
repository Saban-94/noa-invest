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

  const currentSummary =
    truckSummaries.find((t) => t.truck === activeTruck) || truckSummaries[0] || null;

  if (!currentSummary) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground"
        dir="rtl"
      >
        אין נתוני משאית/דיסקית ממקור מאומת. לוח ההצלבה אינו מציג ערכי ברירת מחדל.
      </div>
    );
  }

  const truckIssues = discrepancies.filter((d) => d.truck === currentSummary.truck);

  return (
    <div className="flex h-full flex-col bg-[#0e1620] text-slate-100" dir="rtl">
      <div className="border-b border-[#223246] p-3 text-xs text-slate-400">
        {currentSummary.driver} · {currentSummary.truck} · {currentSummary.verifiedStatus}
      </div>
      <div className="grid grid-cols-4 gap-2 border-b border-[#223246] p-3 text-center text-[11px]">
        <div>
          <div className="text-slate-500">ק״מ</div>
          <div className="font-bold">{currentSummary.kmTotal}</div>
        </div>
        <div>
          <div className="text-slate-500">PTO</div>
          <div className="font-bold">{currentSummary.ptoTime}</div>
        </div>
        <div>
          <div className="text-slate-500">נסיעה</div>
          <div className="font-bold">{currentSummary.driveTime}</div>
        </div>
        <div>
          <div className="text-slate-500">עצירות</div>
          <div className="font-bold">{currentSummary.stops.length}</div>
        </div>
      </div>
      <div className="flex gap-1 border-b border-[#223246] p-2">
        {(
          [
            ["closed_loop", "הצלבה"],
            ["disc", "דיסקית"],
            ["stops", "עצירות"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
              activeTab === id ? "bg-emerald-600 text-white" : "bg-[#172230] text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
        {onClose && (
          <button type="button" onClick={onClose} className="mr-auto p-1 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        {activeTab === "closed_loop" && (
          <div className="space-y-2">
            <p className="text-slate-400">
              חריגות למשאית זו: {truckIssues.length} (רק מנתוני שרת שסופקו לקומפוננטה)
            </p>
            {truckIssues.length === 0 ? (
              <p className="text-slate-500">אין חריגות ברשימה שהועברה.</p>
            ) : (
              truckIssues.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-amber-800/40 bg-amber-950/30 p-2 text-amber-100"
                >
                  <div className="flex items-center gap-1 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {d.title}
                  </div>
                  <p className="mt-1 opacity-90">{d.description}</p>
                  <button
                    type="button"
                    className="mt-2 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold"
                    onClick={() => onResolveDiscrepancy(d.id)}
                  >
                    הסר מהתצוגה (מקומי)
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === "disc" && (
          <div className="space-y-2">
            <p>
              סטטוס: <b>{currentSummary.verifiedStatus}</b>
            </p>
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
              <p className="text-slate-500">אין קישור דיסקית במקור — לא מוצגת תמונת דמה.</p>
            )}
          </div>
        )}
        {activeTab === "stops" && (
          <div className="space-y-2">
            <p className="text-slate-400">עצירות עבור {currentSummary.driver}:</p>
            {currentSummary.stops.length === 0 ? (
              <p className="text-slate-500">אין עצירות במקור.</p>
            ) : (
              currentSummary.stops.map((stop) => (
                <div key={stop.id} className="rounded-xl border border-[#223246] bg-[#121a24] p-2">
                  <div className="font-bold">{stop.label}</div>
                  <div className="text-slate-400">{stop.address}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500">
                    {stop.arriveTime || "—"} → {stop.departTime || "—"}
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
