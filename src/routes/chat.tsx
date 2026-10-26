import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import noa from "@/assets/noa.jpg";
import {
  Send,
  CheckCheck,
  AlertTriangle,
  SlidersHorizontal,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  TachographCanvasViewer,
  type TachographStopOverlay,
} from "@/components/chat/TachographCanvasViewer";
import {
  CrossReferenceInspector,
  type DriverTruckSummary,
  type DiscrepancyItem,
} from "@/components/chat/CrossReferenceInspector";
import { playDispatchChime } from "@/lib/audio-alerts";
import { askNoa } from "@/lib/ai.functions";
import {
  asksCurrentGps,
  asksSourceStatus,
  buildNoaContext,
  describeSources,
  EVIDENCE_LABEL_HE,
  evidenceFromMeta,
  formatNotesSummary,
  gpsUnavailableMessage,
  type BackendMeta,
} from "@/lib/chat-grounding";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "נועה AI — חמ״ל לוגיסטי | ח. סבן" },
      { name: "description", content: "צ׳אט תפעולי מבוסס מקור — ללא דוחות דמה." },
    ],
  }),
  component: ChatScreen,
});

type ChatMessage = {
  id: string;
  sender: "noa" | "user";
  text: string;
  time: string;
  statusTag?: string;
  tachographCard?: {
    driver: string;
    truck: string;
    date: string;
    kmTotal: string;
    ptoHours: string;
    imageUrl?: string;
    stops: TachographStopOverlay[];
  };
  discrepancyAlerts?: DiscrepancyItem[];
  quickActions?: { label: string; query: string }[];
};

function timeOf(raw: unknown): string | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const s = String(raw).trim();
  const part = s.includes(" ") ? s.split(" ").pop() : s;
  return part?.slice(0, 5) || undefined;
}

function ChatScreen() {
  const [input, setInput] = useState("");
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [activeTruck, setActiveTruck] = useState("");
  const [isLoadingBackend, setIsLoadingBackend] = useState(true);
  const [liveData, setLiveData] = useState<{
    deliveryNotes: Record<string, unknown>[];
    visits: Record<string, unknown>[];
    discs: Record<string, unknown>[];
    discrepancies: DiscrepancyItem[];
    meta: BackendMeta | null;
    fetchedAt: string | null;
  }>({
    deliveryNotes: [],
    visits: [],
    discs: [],
    discrepancies: [],
    meta: null,
    fetchedAt: null,
  });
  const [truckSummaries, setTruckSummaries] = useState<DriverTruckSummary[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m0",
      sender: "noa",
      text: "שלום ראמי והראל. נועה בחמ״ל הלוגיסטי של סבן.\nאענה רק על בסיס מידע שניתן לאמת מול השרת. GPS חי ודוחות דוגמה לא יוצגו כעובדות.\nהיסטוריית השיחה נשמרת בדפדפן בלבד במסך זה.",
      time: "07:30",
      statusTag: EVIDENCE_LABEL_HE.unavailable,
      quickActions: [
        { label: "אילו נתונים זמינים?", query: "אילו נתונים זמינים כרגע?" },
        { label: "סיכום תעודות מהשרת", query: "מה יש בתעודות שנטענו מהשרת?" },
        { label: "מיקום משאית כרגע", query: "איפה המשאית כרגע?" },
      ],
    },
  ]);

  const now = () =>
    new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    async function loadBootstrap() {
      try {
        setIsLoadingBackend(true);
        const res = await fetch("/api/backend?action=bootstrap");
        const json = await res.json();
        if (!json.ok || !json.data) return;

        setLiveData({
          deliveryNotes: json.data.deliveryNotes || [],
          visits: json.data.visits || [],
          discs: json.data.discs || [],
          discrepancies: json.data.discrepancies || [],
          meta: json.data.meta || null,
          fetchedAt: json.data.timestamp || new Date().toISOString(),
        });

        const discs = (json.data.discs || []) as Record<string, unknown>[];
        const visits = (json.data.visits || []) as Record<string, unknown>[];

        const mapped: DriverTruckSummary[] = discs
          .map((d) => {
            const truck = String(d["רישוי / משאית"] ?? d.truck ?? d.plate ?? "").trim();
            if (!truck) return null;
            const driver = String(d["נהג"] ?? d.driver ?? "").trim() || "נהג לא צוין במקור";
            const matchedStops: TachographStopOverlay[] = visits
              .filter((v) => String(v.truck || "") === truck)
              .map((v, idx) => {
                const customers = ((v.customers as string[]) || []).filter(Boolean);
                const noteIds = ((v.noteIds as string[]) || []).filter(Boolean);
                return {
                  id: `v-${idx}`,
                  label: [
                    customers.length ? customers.join(", ") : "לקוח לא צוין",
                    noteIds.length ? `(תעודות ${noteIds.join(", ")})` : "(ללא מזהה תעודה)",
                  ].join(" "),
                  address: String(v.fullAddress || v.streetAndNum || "כתובת לא צוינה במקור"),
                  arriveTime: timeOf(v.ituranArriveTime) || "—",
                  departTime: timeOf(v.ituranDepartTime) || "—",
                  ptoOpen: timeOf(v.ptoOpenTime),
                  ptoClose: timeOf(v.ptoCloseTime),
                  ptoMin: typeof v.ptoDurationMin === "number" ? v.ptoDurationMin : undefined,
                };
              });

            const field = (a: unknown, b?: unknown) => {
              const v = a ?? b;
              return v != null && String(v).trim() ? String(v).trim() : null;
            };

            return {
              driver,
              truck,
              truckType: field(d["סוג משאית"], d.truckType) || "סוג לא צוין במקור",
              date: field(d["תאריך דיסקית"], d.date) || "תאריך לא צוין במקור",
              kmTotal: field(d['סה"כ ק"מ'], d.kmTotal) || "—",
              driveTime: field(d["זמן נסיעה"]) || "—",
              workTime: field(d["זמן עבודה"]) || "—",
              ptoTime: field(d["זמן מנוף"]) || "—",
              idleTime: field(d["זמן סרק"]) || "—",
              discImage: field(d["קישור לדיסקית"], d.discImage) || "",
              verifiedStatus: field(d["סטטוס אימות"], d.verifiedStatus) || "לא אומת מול מקור",
              stops: matchedStops,
            } satisfies DriverTruckSummary;
          })
          .filter((s): s is DriverTruckSummary => s != null);

        setTruckSummaries(mapped);
        if (mapped[0]?.truck) setActiveTruck(mapped[0].truck);
      } catch (err) {
        console.warn("Bootstrap fetch error:", err);
      } finally {
        setIsLoadingBackend(false);
      }
    }
    void loadBootstrap();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleResolveDiscrepancy = (id: string) => {
    setLiveData((prev) => ({
      ...prev,
      discrepancies: prev.discrepancies.filter((d) => d.id !== id),
    }));
    if (isSoundEnabled) void playDispatchChime(0.6);
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        sender: "noa",
        text: "סימון מקומי במסך בלבד. לא בוצע עדכון בשרת או בגיליון — אין API מורשה לאישור חריגה מכאן.",
        time: now(),
        statusTag: "פעולה מקומית בלבד",
      },
    ]);
  };

  const handleSend = async (textToSend?: string) => {
    const text = textToSend ?? input;
    if (!text.trim()) return;
    if (isSoundEnabled) void playDispatchChime(0.7);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      time: now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");

    const q = text.trim();

    if (asksCurrentGps(q)) {
      setMessages((prev) => [
        ...prev,
        {
          id: `noa-${Date.now()}`,
          sender: "noa",
          text: gpsUnavailableMessage(),
          time: now(),
          statusTag: EVIDENCE_LABEL_HE.unavailable,
        },
      ]);
      return;
    }

    if (asksSourceStatus(q)) {
      setMessages((prev) => [
        ...prev,
        {
          id: `noa-${Date.now()}`,
          sender: "noa",
          text: describeSources(liveData.meta, liveData.fetchedAt),
          time: now(),
          statusTag: EVIDENCE_LABEL_HE[evidenceFromMeta(liveData.meta)],
        },
      ]);
      return;
    }

    if (/תעודות|מה יש ב|סיכום תעוד/.test(q) && !/חריג|הצלבה|טכוגרף/.test(q)) {
      const discCount =
        liveData.meta?.notesSource === "live" ? liveData.discrepancies.length : undefined;
      setMessages((prev) => [
        ...prev,
        {
          id: `noa-${Date.now()}`,
          sender: "noa",
          text: formatNotesSummary(
            liveData.deliveryNotes,
            liveData.meta,
            liveData.fetchedAt,
            discCount,
          ),
          time: now(),
          statusTag: EVIDENCE_LABEL_HE[evidenceFromMeta(liveData.meta)],
          quickActions:
            typeof discCount === "number" && discCount > 0
              ? [{ label: `הציגי ${discCount} חריגות`, query: "הציגי חריגות מהשרת אם קיימות" }]
              : undefined,
        },
      ]);
      return;
    }

    if (/חריג|הצלבה|פיצוח/.test(q)) {
      if (liveData.meta?.notesSource === "live" && liveData.discrepancies.length > 0) {
        const total = liveData.discrepancies.length;
        const preview = liveData.discrepancies.slice(0, 5);
        const lines = preview.map((d, i) =>
          `${i + 1}. ${d.title} · משאית ${d.truck || "—"} · ${d.address}\n   ${d.description}`,
        );
        const more =
          total > 5
            ? `\n\nמוצגות 5 מתוך ${total} חריגות. אפשר לסנן לפי כתובת או משאית בשאלה הבאה.`
            : "";
        setMessages((prev) => [
          ...prev,
          {
            id: `noa-${Date.now()}`,
            sender: "noa",
            text: `חריגות מצינור השרת (${total}):\n\n${lines.join("\n\n")}${more}\n\nמקור תעודות: ${liveData.meta?.notesSource}. איתוראן בצינור: ${liveData.meta?.ituranSource ?? "לא ידוע"}.`,
            time: now(),
            statusTag: EVIDENCE_LABEL_HE.partial,
            discrepancyAlerts: preview,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `noa-${Date.now()}`,
            sender: "noa",
            text: "אין דוח חריגות מאומת מהשרת. לא מוצגת רשימת דוגמה.",
            time: now(),
            statusTag: EVIDENCE_LABEL_HE.unavailable,
          },
        ]);
      }
      return;
    }

    try {
      const context = buildNoaContext({
        meta: liveData.meta,
        fetchedAt: liveData.fetchedAt,
        notes: liveData.deliveryNotes,
        visits: liveData.visits,
        discrepancies: liveData.discrepancies,
        question: q,
      });
      const history = messages
        .filter((m) => m.id !== "m0")
        .slice(-12)
        .map((m) => ({
          role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.text.slice(0, 2000),
        }));
      const result = await askNoa({
        data: {
          messages: [...history, { role: "user", content: q }],
          context,
        },
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `noa-${Date.now()}`,
          sender: "noa",
          text: result.text,
          time: now(),
          statusTag: EVIDENCE_LABEL_HE[evidenceFromMeta(liveData.meta)],
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `noa-${Date.now()}`,
          sender: "noa",
          text: `לא ניתן לייצר מענה מאומת כרגע.\n${msg}\nלא הוצג דוח דוגמה.`,
          time: now(),
          statusTag: EVIDENCE_LABEL_HE.unavailable,
        },
      ]);
    }
  };

  const activeSummary = truckSummaries.find((s) => s.truck === activeTruck) || truckSummaries[0];

  return (
    <div className="flex h-[calc(100vh-65px)] flex-col bg-[#0b1118] text-slate-100 overflow-hidden font-sans" dir="rtl">
      <div className="flex items-center justify-between border-b border-[#223246] bg-[#0e1620] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <img src={noa} alt="נועה AI" className="h-9 w-9 rounded-xl object-cover ring-1 ring-emerald-500/40" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white">נועה AI — חמ״ל לוגיסטי</h1>
              <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                מענה מבוסס מקור · P0
              </span>
              {isLoadingBackend && (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              מקור תעודות: {liveData.meta?.notesSource ?? "לא נטען"} · איתוראן בצינור:{" "}
              {liveData.meta?.ituranSource ?? "לא נטען"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSoundEnabled((p) => !p)}
            className="rounded-xl border border-[#223246] bg-[#172230] p-2 text-slate-300"
          >
            {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setIsInspectorOpen((p) => !p)}
            className="flex items-center gap-1.5 rounded-xl border border-[#223246] bg-[#172230] px-3 py-1.5 text-xs font-semibold text-slate-300"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            מפקח
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => {
              const isUser = m.sender === "user";
              return (
                <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[min(100%,36rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      isUser
                        ? "bg-emerald-700/80 text-white"
                        : "border border-[#223246] bg-[#121a24] text-slate-100"
                    }`}
                  >
                    {m.statusTag && (
                      <div className="mb-1 text-[10px] font-bold text-amber-300/90">{m.statusTag}</div>
                    )}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.discrepancyAlerts && m.discrepancyAlerts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {m.discrepancyAlerts.map((disc) => (
                          <div
                            key={disc.id}
                            className="space-y-1 rounded-xl border border-amber-800/50 bg-amber-950/40 p-3 text-xs text-amber-100"
                          >
                            <div className="flex items-center gap-1.5 font-bold">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {disc.title}
                            </div>
                            <p>{disc.description}</p>
                            <div className="flex justify-between pt-1 text-[10px] opacity-80">
                              <span>{disc.address}</span>
                              <button
                                type="button"
                                onClick={() => handleResolveDiscrepancy(disc.id)}
                                className="rounded-md bg-white/10 px-2 py-1 font-semibold"
                              >
                                הסר מהתצוגה (מקומי)
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                      <span className="font-mono">{m.time}</span>
                      <CheckCheck className="h-3 w-3 text-emerald-400" />
                    </div>
                    {m.quickActions && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.quickActions.map((qa) => (
                          <button
                            key={qa.query}
                            type="button"
                            onClick={() => void handleSend(qa.query)}
                            className="rounded-lg border border-[#223246] bg-[#172230] px-2 py-1 text-[11px] font-semibold text-slate-200"
                          >
                            {qa.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-[#223246] bg-[#0e1620] p-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="שאלה תפעולית — התשובה רק ממקור מאומת או הצהרת חוסר..."
                className="flex-1 rounded-xl border border-[#223246] bg-[#121a24] px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500/40"
              />
              <button
                type="submit"
                className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
              >
                <Send className="h-4 w-4" />
                שלח
              </button>
            </form>
          </div>
        </div>

        {isInspectorOpen && (
          <div className="hidden w-[380px] shrink-0 flex-col border-r border-[#223246] bg-[#0e1620] lg:flex">
            {truckSummaries.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">
                אין נתוני דיסקיות מהשרת. לוח ההצלבות יישאר ריק עד שמקור מאומת יספק discs (ללא ערכי ברירת מחדל).
              </div>
            ) : (
              <>
                <div className="flex gap-1 overflow-x-auto border-b border-[#223246] p-2">
                  {truckSummaries.map((s) => (
                    <button
                      key={s.truck}
                      type="button"
                      onClick={() => setActiveTruck(s.truck)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                        activeTruck === s.truck
                          ? "bg-emerald-600 text-white"
                          : "bg-[#172230] text-slate-300"
                      }`}
                    >
                      {s.truck}
                    </button>
                  ))}
                </div>
                {activeSummary && (
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <CrossReferenceInspector
                      truckSummaries={truckSummaries}
                      activeTruck={activeTruck || activeSummary.truck}
                      onSelectTruck={setActiveTruck}
                      discrepancies={liveData.discrepancies}
                      onResolveDiscrepancy={handleResolveDiscrepancy}
                    />
                    {activeSummary.discImage ? (
                      <div className="mt-3">
                        <TachographCanvasViewer
                          imageUrl={activeSummary.discImage}
                          driver={activeSummary.driver}
                          truck={activeSummary.truck}
                          date={activeSummary.date}
                          kmTotal={activeSummary.kmTotal}
                          ptoHours={activeSummary.ptoTime}
                          stops={activeSummary.stops}
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-slate-500">אין קישור דיסקית במקור — לא מוצגת תמונת דמה.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
