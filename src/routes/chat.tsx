import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import noa from "@/assets/noa.jpg";
import {
  Send,
  CheckCheck,
  Truck,
  FileText,
  Gauge,
  AlertTriangle,
  RotateCw,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
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

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "נועה AI — חמ״ל לוגיסטי ודיסקיות טכוגרף | ח. סבן" },
      {
        name: "description",
        content: "חמ״ל צ׳אט ובינה לוגיסטית: הצלבת תעודות משלוח, איתוראן GPS ופענוח דיסקיות טכוגרף.",
      },
      { property: "og:title", content: "נועה AI — חמ״ל לוגיסטי ודיסקיות טכוגרף" },
      {
        property: "og:description",
        content: "בקרת ראמי מסארווה, הצלבות איתוראן מול קומקס ודיסקיות טכוגרף 24H.",
      },
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
  siteDetails?: {
    address: string;
    customer: string;
    notesCount: number;
    ituranDuration: string;
    craneDuration: string;
    gapStatus: string;
  };
  quickActions?: { label: string; query: string }[];
};

function ChatScreen() {
  const [input, setInput] = useState("");
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [activeTruck, setActiveTruck] = useState("615-41-002");
  const [isLoadingBackend, setIsLoadingBackend] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const restoredHistory = useRef(false);

  // Live state from /api/backend?action=bootstrap
  const [liveData, setLiveData] = useState<{
    deliveryNotes: Record<string, unknown>[];
    visits: Record<string, unknown>[];
    discs: Record<string, unknown>[];
    discrepancies: DiscrepancyItem[];
  }>({
    deliveryNotes: [],
    visits: [],
    discs: [],
    discrepancies: [],
  });

  const [truckSummaries, setTruckSummaries] = useState<DriverTruckSummary[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // The conversation is restored from this browser; no server-side conversation store is implied.
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m0",
      sender: "noa",
      text: "שלום, אני נועה. אוכל לעזור לנתח רק נתונים שסופקו לי ממקור זמין. כרגע אין אישור שכל מערכות GPS או הטכוגרף מחוברות. שאל שאלה או בקש בדיקת נתונים, ואציין במפורש מה חסר.",
      time: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
      statusTag: "מוכנה · מקור הנתונים טרם אומת",
      quickActions: [
        { label: "בדיקת נתונים זמינים", query: "אילו נתונים זמינים לך כרגע ומה מקורם?" },
        { label: "איתור חריגות בנתונים שהתקבלו", query: "סכמי רק חריגות שמופיעות בנתונים המחוברים." },
      ],
    },
  ]);

  const now = () => new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  // Sync data on mount
  useEffect(() => {
    async function loadBootstrap() {
      try {
        setIsLoadingBackend(true);
        const res = await fetch("/api/backend?action=bootstrap");
        const json = await res.json();
        if (json.ok && json.data) {
          setLiveData({
            deliveryNotes: json.data.deliveryNotes || [],
            visits: json.data.visits || [],
            discs: json.data.discs || [],
            discrepancies: json.data.discrepancies || [],
          });

          // Sync truck summaries if provided
          if (json.data.discs && json.data.discs.length > 0) {
            const mappedSummaries: DriverTruckSummary[] = (
              json.data.discs as Record<string, unknown>[]
            ).map((d: Record<string, unknown>) => {
              const driver = String(d["נהג"] || "נהג לא מזוהה");
              const truck = String(d["רישוי / משאית"] || "משאית לא מזוהה");
              const matchedStops: TachographStopOverlay[] = (
                (json.data.visits || []) as Record<string, unknown>[]
              )
                .filter((v: Record<string, unknown>) => v.truck === truck)
                .map((v: Record<string, unknown>, idx: number) => ({
                  id: `v-${idx}`,
                  label: `${((v.customers as string[]) || []).join(", ") || "לקוח"} (תעודות ${((v.noteIds as string[]) || []).join(", ")})`,
                  address: String(v.fullAddress || v.streetAndNum || "כתובת"),
                  arriveTime: v.ituranArriveTime
                    ? String(v.ituranArriveTime).split(" ")[1]?.slice(0, 5)
                    : "לא זמין",
                  departTime: v.ituranDepartTime
                    ? String(v.ituranDepartTime).split(" ")[1]?.slice(0, 5)
                    : "לא זמין",
                  ptoOpen: v.ptoOpenTime
                    ? String(v.ptoOpenTime).split(" ")[1]?.slice(0, 5)
                    : undefined,
                  ptoClose: v.ptoCloseTime
                    ? String(v.ptoCloseTime).split(" ")[1]?.slice(0, 5)
                    : undefined,
                  ptoMin: typeof v.ptoDurationMin === "number" ? v.ptoDurationMin : undefined,
                }));

              return {
                driver,
                truck,
                truckType: d["סוג משאית"] || "לא זמין",
                date: d["תאריך דיסקית"] || "לא זמין",
                kmTotal: d['סה"כ ק"מ'] || "140",
                driveTime: d["זמן נסיעה"] || "לא זמין",
                workTime: d["זמן עבודה"] || "לא זמין",
                ptoTime: d["זמן מנוף"] || "לא זמין",
                idleTime: d["זמן סרק"] || "לא זמין",
                discImage:
                  d["קישור לדיסקית"] || "",
                verifiedStatus: d["סטטוס אימות"] || "לא אומת",
                stops: matchedStops.length > 0 ? matchedStops : [],
              };
            });
            setTruckSummaries(mappedSummaries);
          }
        }
      } catch (err) {
        console.warn("Bootstrap fetch error:", err);
      } finally {
        setIsLoadingBackend(false);
      }
    }

    void loadBootstrap();
  }, []);

  // Restore and persist conversation locally in this browser only.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("noa-chat-history-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.every((m) => m && typeof m.text === "string" && (m.sender === "noa" || m.sender === "user"))) {
          setMessages(parsed.slice(-60));
        }
      }
    } catch {
      setChatError("לא ניתן לשחזר היסטוריה מקומית; אפשר להמשיך בשיחה חדשה.");
    } finally {
      restoredHistory.current = true;
    }
  }, []);

  useEffect(() => {
    if (!restoredHistory.current) return;
    try {
      localStorage.setItem("noa-chat-history-v1", JSON.stringify(messages.slice(-60)));
    } catch {
      setChatError("אין אפשרות לשמור היסטוריה בדפדפן זה.");
    }
  }, [messages]);

  // Auto scroll to bottom
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
        text: "החריגה הוסרה מהתצוגה המקומית בלבד. לא נשלח אישור ולא עודכנה מערכת חיצונית.",
        time: now(),
        statusTag: "שינוי מקומי בלבד · לא נשמר בשרת",
      },
    ]);
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || isSending) return;

    if (isSoundEnabled) void playDispatchChime(0.7);
    setChatError("");
    setIsSending(true);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      time: now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");

    const context = JSON.stringify({
      sourceStatus: isLoadingBackend ? "טעינת נתונים עדיין מתבצעת" : "מצב טעינה הסתיים",
      deliveryNotes: liveData.deliveryNotes,
      visits: liveData.visits,
      discs: liveData.discs,
      discrepancies: liveData.discrepancies,
      sourceCounts: {
        deliveryNotes: liveData.deliveryNotes.length,
        visits: liveData.visits.length,
        discs: liveData.discs.length,
        discrepancies: liveData.discrepancies.length,
      },
    });

    try {
      const result = await askNoa({ data: {
        messages: [...messages.slice(-18).map((m) => ({
          role: m.sender === "noa" ? "assistant" as const : "user" as const,
          content: m.text,
        })), { role: "user" as const, content: text }],
        context,
      }});
      setMessages((prev) => [...prev, {
        id: `noa-${Date.now()}`,
        sender: "noa",
        text: result.text,
        time: now(),
        statusTag: "מענה AI · יש לאמת מול מקור",
      }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "שירות הצ׳אט אינו זמין כרגע.";
      setChatError(message);
      setMessages((prev) => [...prev, {
        id: `noa-error-${Date.now()}`,
        sender: "noa",
        text: `לא הצלחתי להשלים את הבקשה: ${message}\nלא הסקתי מסקנה תפעולית ולא שיניתי נתונים במערכת.`,
        time: now(),
        statusTag: "שגיאה · לא בוצע אימות",
      }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-65px)] flex-col bg-[#0b1118] text-slate-100 overflow-hidden font-sans">
      {/* Top Command Bar */}
      <div className="flex items-center justify-between border-b border-[#223246] bg-[#0e1620] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={noa}
              alt="נועה AI"
              className="h-9 w-9 rounded-xl object-cover ring-1 ring-emerald-500/40"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0e1620]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">
                נועה AI — חמ״ל לוגיסטי
              </h1>
              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                AI · אימות מקור נדרש
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              ח. סבן חומרי בניין (1994) בע״מ · אין להסתמך על נתון ללא מקור
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            onClick={() => setIsSoundEnabled((prev) => !prev)}
            className={`p-2 rounded-xl border transition ${
              isSoundEnabled
                ? "bg-[#172230] border-[#223246] text-emerald-400"
                : "bg-[#172230]/50 border-[#223246]/50 text-slate-500"
            }`}
            title={isSoundEnabled ? "השתק צלילי חמ״ל" : "הפעל צלילי חמ״ל"}
          >
            {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* Toggle Inspector Drawer */}
          <button
            onClick={() => setIsInspectorOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              isInspectorOpen
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : "bg-[#172230] border-[#223246] text-slate-300 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isInspectorOpen ? "הסתר מפקח הצלבות" : "הצג מפקח הצלבות"}
            </span>
          </button>
        </div>
      </div>

      {/* Main Dual-Panel Viewport */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left/Main Column: WhatsApp-Style Intelligence Feed (7 or 12 cols) */}
        <div
          className={`flex flex-col h-full overflow-hidden border-b lg:border-b-0 border-[#223246] ${
            isInspectorOpen ? "lg:col-span-7 xl:col-span-8" : "lg:col-span-12"
          }`}
        >
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b1118]">
            {chatError && (
              <div role="alert" className="mx-2 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                {chatError}
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.sender === "user";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? "items-start" : "items-end"} w-full`}
                >
                  <div
                    className={`relative max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 shadow-sm text-sm leading-relaxed ${
                      isUser
                        ? "rounded-tr-none bg-emerald-700 text-white"
                        : "rounded-tl-none bg-[#131c26] text-slate-200 border border-[#223246]"
                    }`}
                  >
                    {/* Header info for Noa messages */}
                    {!isUser && (
                      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#223246]/70 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                          <img src={noa} alt="" className="h-4 w-4 rounded-full object-cover" />
                          <span>נועה AI</span>
                        </div>
                        {m.statusTag && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {m.statusTag}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Formatted Text */}
                    <div className="whitespace-pre-line text-xs sm:text-sm font-normal">
                      {m.text}
                    </div>

                    {/* Embedded Site Details Card */}
                    {m.siteDetails && (
                      <div className="mt-3 rounded-xl border border-[#223246] bg-[#172230] p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between font-bold text-white">
                          <span>📍 {m.siteDetails.address}</span>
                          <span className="text-emerald-400 text-[11px]">
                            {m.siteDetails.gapStatus}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                          <div>
                            <span className="text-slate-500 block">לקוח:</span>
                            <b className="text-white">{m.siteDetails.customer}</b>
                          </div>
                          <div>
                            <span className="text-slate-500 block">שהייה באיתוראן:</span>
                            <b className="text-sky-300 font-mono">{m.siteDetails.ituranDuration}</b>
                          </div>
                          <div>
                            <span className="text-slate-500 block">רישום כתב יד:</span>
                            <b className="text-amber-300 font-mono">
                              {m.siteDetails.craneDuration}
                            </b>
                          </div>
                          <div>
                            <span className="text-slate-500 block">מספר תעודות:</span>
                            <b className="text-white">{m.siteDetails.notesCount} תעודה חתומה</b>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Embedded Tachograph Canvas Card */}
                    {m.tachographCard && (
                      <div className="mt-3">
                        <TachographCanvasViewer
                          imageUrl={m.tachographCard.imageUrl}
                          driver={m.tachographCard.driver}
                          truck={m.tachographCard.truck}
                          date={m.tachographCard.date}
                          kmTotal={m.tachographCard.kmTotal}
                          ptoHours={m.tachographCard.ptoHours}
                          stops={m.tachographCard.stops}
                          height={260}
                          compact={false}
                        />
                      </div>
                    )}

                    {/* Embedded Discrepancy Alerts */}
                    {m.discrepancyAlerts && m.discrepancyAlerts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {m.discrepancyAlerts.map((disc) => (
                          <div
                            key={disc.id}
                            className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                              disc.severity === "alert"
                                ? "bg-red-950/40 border-red-800/50 text-red-200"
                                : "bg-amber-950/40 border-amber-800/50 text-amber-200"
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span className="flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>{disc.title}</span>
                              </span>
                              <span className="text-[10px] opacity-80 font-mono">
                                משאית {disc.truck}
                              </span>
                            </div>
                            <p className="text-[11px] opacity-90">{disc.description}</p>
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] opacity-75">{disc.address}</span>
                              <button
                                onClick={() => handleResolveDiscrepancy(disc.id)}
                                className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-semibold transition"
                              >
                                אשר ובטל חריגה
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Message Footer (Time & Checkmarks) */}
                    <div
                      className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${
                        isUser ? "text-emerald-100/80" : "text-slate-400"
                      }`}
                    >
                      <span className="font-mono tabular-nums">{m.time}</span>
                      <CheckCheck className="h-3 w-3 text-emerald-400" />
                    </div>
                  </div>

                  {/* Interactive Quick-Action Chips */}
                  {m.quickActions && (
                    <div className="mt-2 flex flex-wrap gap-1.5 max-w-[92%] sm:max-w-[85%]">
                      {m.quickActions.map((qa, i) => (
                        <button
                          key={i}
                          onClick={() => void handleSend(qa.query)}
                          className="flex items-center gap-1 text-xs rounded-xl bg-[#172230] hover:bg-[#223246] border border-[#223246] px-3 py-1.5 text-slate-300 hover:text-white transition shadow-sm active:scale-95"
                        >
                          <span>{qa.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Persistent Quick Action Bar */}
          <div className="flex items-center gap-2 overflow-x-auto border-t border-[#223246] bg-[#0e1620] px-4 py-2 text-xs scrollbar-none">
            <span className="text-[11px] text-slate-400 font-semibold shrink-0">שאלות מפתח:</span>
            <button
              onClick={() => void handleSend("מה הסטטוס של דיסקית הטכוגרף של חכמת?")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#172230] hover:bg-[#223246] px-2.5 py-1 text-slate-300 border border-[#223246] transition"
            >
              <Gauge className="h-3 w-3 text-amber-400" />
              <span>טכוגרף חכמת</span>
            </button>
            <button
              onClick={() => void handleSend("בדקי היסטוריית ביקור באתר רקפת 4, הוד השרון")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#172230] hover:bg-[#223246] px-2.5 py-1 text-slate-300 border border-[#223246] transition"
            >
              <FileText className="h-3 w-3 text-emerald-400" />
              <span>היסטוריית רקפת 4</span>
            </button>
            <button
              onClick={() => void handleSend("בצעי פיצוח והצלבת חריגות לכלל הצי היום")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#172230] hover:bg-[#223246] px-2.5 py-1 text-slate-300 border border-[#223246] transition"
            >
              <AlertTriangle className="h-3 w-3 text-purple-400" />
              <span>איתור חריגות צי</span>
            </button>
            <button
              onClick={() => void handleSend("מה מצב המשאית של עלי אבו עידה?")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#172230] hover:bg-[#223246] px-2.5 py-1 text-slate-300 border border-[#223246] transition"
            >
              <Truck className="h-3 w-3 text-sky-400" />
              <span>עלי אבו עידה</span>
            </button>
          </div>

          {/* Chat Input Field */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2 border-t border-[#223246] bg-[#131c26] p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל את נועה על נהג, משאית, כתובת אתר (לדוגמה 'רקפת 4') או בדיקת דיסקית..."
              className="flex-1 rounded-xl border border-[#223246] bg-[#0b1118] px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-40"
              title={isSending ? "נועה מעבדת את הבקשה" : "שלח הודעה"}
            >
              {isSending ? <RotateCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rotate-180" />}
            </button>
          </form>
        </div>

        {/* Right/Drawer Panel: Cross-Reference Inspector (5 or 4 cols) */}
        {isInspectorOpen && (
          <div className="h-full overflow-hidden lg:col-span-5 xl:col-span-4 border-t lg:border-t-0">
            <CrossReferenceInspector
              activeTruck={activeTruck}
              onSelectTruck={(truck) => setActiveTruck(truck)}
              truckSummaries={truckSummaries}
              discrepancies={liveData.discrepancies}
              onResolveDiscrepancy={handleResolveDiscrepancy}
              onClose={() => setIsInspectorOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
