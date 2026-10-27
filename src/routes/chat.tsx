import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import noa from "@/assets/noa.jpg";
import {
  Send,
  CheckCheck,
  Truck,
  FileText,
  Gauge,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Loader2,
} from "lucide-react";
import {
  TachographCanvasViewer,
  type TachographStopOverlay,
} from "@/components/chat/TachographCanvasViewer";
import {
  CrossReferenceInspector,
  type DiscrepancyItem,
} from "@/components/chat/CrossReferenceInspector";
import { playDispatchChime } from "@/lib/audio-alerts";
import { fetchLiveNotes } from "@/lib/api";
import { listPtoFn } from "@/lib/notes-api.functions";
import { askNoa } from "@/lib/ai.functions";
import { noteItemsCount, noteWeightTons, type DeliveryNote } from "@/lib/data";
import {
  pairPtoEvents,
  analyzePto,
  buildTruckSummaries,
  israelTime,
} from "@/lib/smart-dispatch/pto-pairing";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "נועה AI — חמ״ל לוגיסטי | ח. סבן" },
      {
        name: "description",
        content: "חמ״ל צ׳אט ובינה לוגיסטית: הצלבת תעודות משלוח מול אירועי PTO של איתוראן.",
      },
      { property: "og:title", content: "נועה AI — חמ״ל לוגיסטי" },
      {
        property: "og:description",
        content: "בקרת ראמי מסארווה, הצלבות איתוראן PTO מול תעודות משלוח.",
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
  quickActions?: { label: string; query: string }[];
};

const PTO_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

function noteLine(n: DeliveryNote): string {
  const b = n.deposits?.bales60002?.delivered ?? 0;
  const p = n.deposits?.pallets60060?.delivered ?? 0;
  return [
    `ת.מ. ${n.id}`,
    `לקוח: ${n.customer}`,
    n.date && `תאריך: ${n.date}`,
    n.siteAddress && `כתובת: ${n.siteAddress}`,
    n.driver && `נהג: ${n.driver}`,
    `פריטים: ${noteItemsCount(n)}`,
    `משקל: ${noteWeightTons(n).toFixed(1)} טון`,
    `בלות 60002: ${b}`,
    `משטחים 60060: ${p}`,
    n.craneTime && `מנוף: ${n.craneTime}`,
    n.signedBy && `חתם: ${n.signedBy}`,
    `סטטוס: ${n.billingStatus || "לא צוין"}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function ChatScreen() {
  const [input, setInput] = useState("");
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [activeTruck, setActiveTruck] = useState("615-41-002");
  const [isThinking, setIsThinking] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  // ---- תעודות חיות ----
  const {
    data: liveNotes,
    isFetching: isFetchingNotes,
    error: notesError,
    refetch: refetchNotes,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-chat"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
    retry: 1,
  });
  const notes = useMemo(() => liveNotes ?? [], [liveNotes]);

  // ---- אירועי PTO חיים מטאב איתוראן_PTO ----
  const {
    data: ptoData,
    isFetching: isFetchingPto,
    error: ptoError,
    refetch: refetchPto,
  } = useQuery({
    queryKey: ["live-pto-chat"],
    queryFn: () =>
      listPtoFn({ data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() } }),
    staleTime: 60_000,
    retry: 1,
  });

  const analysis = useMemo(() => {
    const sessions = pairPtoEvents(ptoData?.events ?? []);
    return analyzePto(sessions, notes);
  }, [ptoData, notes]);

  const sessions = analysis.sessions;
  const issues = useMemo(
    () => analysis.issues.filter((i) => !resolvedIds.has(i.id)),
    [analysis, resolvedIds],
  );
  const truckSummaries = useMemo(() => buildTruckSummaries(sessions), [sessions]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const now = () => new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m0",
      sender: "noa",
      text: "שלום ראמי והראל! נועה כאן בחמ״ל ❤️\nאני מחוברת חי לגיליון התעודות ולאירועי ה-PTO של איתוראן. אפשר לשאול על תעודה (לפי מספר), נהג, פקדונות או חריגות.",
      time: now(),
      statusTag: "מחוברת לגיליון",
      quickActions: [
        { label: "📄 סיכום תעודות", query: "תני סיכום של התעודות האחרונות בגיליון" },
        { label: "⚖️ מאזן פקדונות", query: "מה מצב הפקדונות בתעודות האחרונות?" },
        { label: "⚠️ בדיקת חריגות", query: "בצעי הצלבת חריגות לכלל הצי" },
        { label: "🚚 דוח חכמת", query: "מה הסטטוס של המנוף של חכמת?" },
      ],
    },
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleResolveDiscrepancy = (id: string) => {
    setResolvedIds((prev) => new Set(prev).add(id));
    if (isSoundEnabled) void playDispatchChime(0.6);
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        sender: "noa",
        text: "✓ החריגה סומנה כנבדקה ע״י ראמי מסארווה.",
        time: now(),
        statusTag: "אושר ע״י ראמי",
      },
    ]);
  };

  const pushNoa = (msg: Omit<ChatMessage, "id" | "sender" | "time">) =>
    setMessages((prev) => [
      ...prev,
      { id: `noa-${Date.now()}`, sender: "noa", time: now(), ...msg },
    ]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || isThinking) return;

    if (isSoundEnabled) void playDispatchChime(0.7);
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, sender: "user", text, time: now() };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");

    const t = text.toLowerCase();

    // 1. מספר תעודה
    const idMatch = text.match(/\d{5,}/);
    const foundNote = idMatch
      ? notes.find((n) => n.id === idMatch[0] || n.comaxOrder === idMatch[0])
      : undefined;
    if (foundNote) {
      const b = foundNote.deposits?.bales60002?.delivered ?? 0;
      const p = foundNote.deposits?.pallets60060?.delivered ?? 0;
      const pto = sessions.find((s) => s.matchedNoteId === foundNote.id);
      pushNoa({
        text:
          `📄 ת.מ. ${foundNote.id} — ${foundNote.customer}\n\n` +
          `• תאריך: ${foundNote.date || "—"}\n` +
          `• כתובת: ${foundNote.siteAddress || "—"}\n` +
          `• נהג: ${foundNote.driver || "—"}\n` +
          `• פריטים: ${noteItemsCount(foundNote)} | משקל: ${noteWeightTons(foundNote).toFixed(1)} טון\n` +
          `• בלות 60002: ${b} | משטחים 60060: ${p} (טרם הוצלבו מול חיוב)\n` +
          `• מנוף בתעודה: ${foundNote.craneTime || "לא נרשם"}\n` +
          `• PTO באיתוראן: ${
            pto
              ? `${israelTime(pto.openIso)}–${pto.closeIso ? israelTime(pto.closeIso) : "?"} (${pto.durationMin ?? "?"} דק׳)`
              : "לא נמצא אירוע תואם"
          }\n` +
          `• חתימה: ${foundNote.signedBy || "לא זוהתה"}\n` +
          `• סטטוס: ${foundNote.billingStatus || "לא צוין"}`,
        statusTag: pto ? "גיליון + איתוראן PTO" : "גיליון",
      });
      return;
    }

    // 2. דוח משאית / נהג
    const wantsHikmat = t.includes("חכמת") || t.includes("615") || t.includes("מנוף");
    const wantsAli = t.includes("עלי") || t.includes("651") || t.includes("פלטה");
    if (wantsHikmat || wantsAli) {
      const plate = wantsAli && !wantsHikmat ? "651-51-701" : "615-41-002";
      const driverKey = plate === "651-51-701" ? "עלי" : "חכמת";
      setActiveTruck(plate);
      setIsInspectorOpen(true);

      const summary = truckSummaries.find((s) => s.truck === plate);
      const driverNotes = notes.filter(
        (n) => (n.driver || "").includes(driverKey) || (n.driver || "").includes(plate),
      );
      const truckSessions = sessions
        .filter((s) => s.truck === plate && s.date === summary?.date)
        .sort((a, b) => a.openIso.localeCompare(b.openIso));

      let body = `🚚 ${driverKey} (${plate})\n\n• תעודות בגיליון: ${driverNotes.length}`;
      if (summary) {
        body += `\n• תאריך אחרון עם PTO: ${summary.date}\n• סה״כ זמן מנוף PTO: ${summary.ptoTime}\n• אירועים:`;
        body +=
          "\n" +
          truckSessions
            .map(
              (s) =>
                `  – ${israelTime(s.openIso)}–${s.closeIso ? israelTime(s.closeIso) : "?"} (${s.durationMin ?? "?"} דק׳) ${s.address || "כתובת לא ידועה"}${
                  s.matchedNoteId ? ` ← ת.מ. ${s.matchedNoteId}` : s.orphan ? " ⚠️ יתום" : " ⚠️ ללא תעודה"
                }`,
            )
            .join("\n");
      } else {
        body +=
          plate === "651-51-701"
            ? "\n• משאית פלטה — אין חיישן PTO, ולכן אין אירועי מנוף."
            : "\n• אין אירועי PTO בשבוע האחרון.";
      }
      body += "\n\nאין נתוני ק״מ ומיקום חי — חסר דוח 24 שעות/API.";

      pushNoa({
        text: body,
        statusTag: summary ? "גיליון + איתוראן PTO" : "גיליון",
        tachographCard: summary
          ? {
              driver: summary.driver,
              truck: summary.truck,
              date: summary.date,
              kmTotal: summary.kmTotal,
              ptoHours: summary.ptoTime,
              imageUrl: summary.discImage,
              stops: summary.stops,
            }
          : undefined,
      });
      return;
    }

    // 3. חריגות
    if (t.includes("חריג") || t.includes("הצלבה") || t.includes("פענוח")) {
      setIsInspectorOpen(true);
      pushNoa({
        text:
          sessions.length === 0
            ? "אין אירועי PTO בשבוע האחרון, ולכן אי אפשר לבצע הצלבה."
            : issues.length === 0
              ? `✅ ${sessions.length} אירועי PTO נבדקו מול התעודות — לא אותרו חריגות.`
              : `⚠️ אותרו ${issues.length} חריגות מתוך ${sessions.length} אירועי PTO:\n\n` +
                issues
                  .slice(0, 10)
                  .map((i, k) => `${k + 1}. ${i.title} — ${i.address} (משאית ${i.truck})`)
                  .join("\n"),
        statusTag: "הצלבת PTO מול תעודות",
        discrepancyAlerts: issues.length ? issues.slice(0, 10) : undefined,
      });
      return;
    }

    // 4. שאלה חופשית → נועה AI עם הקשר חי
    setIsThinking(true);
    try {
      const context = [
        `סה״כ תעודות בגיליון: ${notes.length}`,
        ...notes.slice(0, 40).map(noteLine),
        `אירועי PTO בשבוע האחרון: ${sessions.length}`,
        ...sessions
          .slice(0, 20)
          .map(
            (s) =>
              `PTO ${s.date} ${israelTime(s.openIso)}–${s.closeIso ? israelTime(s.closeIso) : "?"} משאית ${s.truck} ${s.address}${s.matchedNoteId ? ` תעודה ${s.matchedNoteId}` : ""}`,
          ),
        issues.length ? "חריגות: " + issues.map((d) => d.title).join("; ") : "",
        "אין נתוני מיקום חי ואין ק״מ — אל תמציאי.",
      ]
        .filter(Boolean)
        .join("\n");

      const history = [...messages, userMsg]
        .filter((m) => m.id !== "m0")
        .slice(-12)
        .map((m) => ({
          role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));

      const res = await askNoa({ data: { messages: history, context } });
      pushNoa({ text: res.text, statusTag: "נועה AI" });
    } catch (err) {
      pushNoa({
        text: `לא הצלחתי לענות כרגע: ${err instanceof Error ? err.message : String(err)}`,
        statusTag: "שגיאה",
      });
    } finally {
      setIsThinking(false);
    }
  };

  const refreshAll = () => {
    void refetchNotes();
    void refetchPto();
  };
  const isFetching = isFetchingNotes || isFetchingPto;

  return (
    <div dir="rtl" className="flex h-[calc(100dvh-65px)] min-h-0 flex-col overflow-hidden bg-[#08111b] font-sans text-slate-100 selection:bg-emerald-400/25">
      {/* Top Command Bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[#0c1722]/95 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={noa}
              alt="נועה AI"
              className="h-10 w-10 rounded-2xl object-cover ring-1 ring-emerald-300/40 shadow-[0_0_24px_rgba(52,211,153,0.12)]"
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0e1620] ${
                notesError ? "bg-red-500" : "bg-emerald-500"
              }`}
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">
                נועה AI — חמ״ל לוגיסטי
              </h1>
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                  notesError
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                }`}
              >
                {notesError ? "אין חיבור לגיליון" : `${notes.length} תעודות`}
              </span>
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                  ptoError
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-sky-500/10 border-sky-500/20 text-sky-300"
                }`}
              >
                {ptoError ? "אין חיבור ל-PTO" : `${sessions.length} אירועי PTO`}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              בקרת ראמי מסארווה · ח. סבן חומרי בניין (1994) בע״מ
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            disabled={isFetching}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 text-slate-300 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:opacity-50"
            title="רענן תעודות ו-PTO"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setIsSoundEnabled((prev) => !prev)}
            className={`rounded-xl border p-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
              isSoundEnabled
                ? "bg-[#172230] border-[#223246] text-emerald-400"
                : "bg-[#172230]/50 border-[#223246]/50 text-slate-500"
            }`}
            title={isSoundEnabled ? "השתק צלילי חמ״ל" : "הפעל צלילי חמ״ל"}
          >
            {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

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
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
        <div
          className={`flex min-h-0 flex-col overflow-hidden border-b border-white/[0.07] lg:border-b-0 ${
            isInspectorOpen ? "lg:col-span-7 xl:col-span-8" : "lg:col-span-12"
          }`}
        >
          <div className="flex-1 space-y-5 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.045),transparent_55%)] px-4 py-5 sm:px-6 sm:py-6">
            {messages.map((m) => {
              const isUser = m.sender === "user";
              return (
                <div
                  key={m.id}
                  className={`flex w-full flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`relative max-w-[96%] rounded-2xl p-4 text-sm leading-relaxed shadow-[0_12px_32px_rgba(0,0,0,0.16)] sm:max-w-[88%] lg:max-w-[82%] ${
                      isUser
                        ? "rounded-tr-md border border-emerald-300/15 bg-gradient-to-br from-emerald-700 to-emerald-800 text-white"
                        : "rounded-tl-md border border-white/[0.08] bg-[#111d29] text-slate-200"
                    }`}
                  >
                    {!isUser && (
                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-2.5 text-xs">
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

                    <div className="whitespace-pre-line text-[13px] font-normal leading-6 sm:text-sm sm:leading-7">
                      {m.text}
                    </div>

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

                    <div
                      className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${
                        isUser ? "text-emerald-100/80" : "text-slate-400"
                      }`}
                    >
                      <span className="font-mono tabular-nums">{m.time}</span>
                      <CheckCheck className="h-3 w-3 text-emerald-400" />
                    </div>
                  </div>

                  {m.quickActions && (
                    <div className="mt-3 flex max-w-[96%] flex-wrap gap-2 sm:max-w-[88%] lg:max-w-[82%]">
                      {m.quickActions.map((qa, i) => (
                        <button
                          key={i}
                          onClick={() => void handleSend(qa.query)}
                          className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs text-slate-300 shadow-sm transition hover:border-emerald-300/20 hover:bg-emerald-400/[0.08] hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 active:scale-[0.98]"
                        >
                          <span>{qa.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {isThinking && (
              <div className="flex items-end">
                <div className="rounded-2xl rounded-tl-none bg-[#131c26] border border-[#223246] px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  <span>נועה בודקת מול הגיליון...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto border-t border-white/[0.07] bg-[#0c1722] px-4 py-3 text-xs scrollbar-none sm:px-5">
            <span className="text-[11px] text-slate-400 font-semibold shrink-0">שאלות מפתח:</span>
            <button
              onClick={() => void handleSend("מה הסטטוס של המנוף של חכמת?")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-slate-300 transition hover:border-white/15 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            >
              <Gauge className="h-3 w-3 text-amber-400" />
              <span>מנוף חכמת</span>
            </button>
            <button
              onClick={() => void handleSend("תני סיכום של התעודות האחרונות בגיליון")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#172230] hover:bg-[#223246] px-2.5 py-1 text-slate-300 border border-[#223246] transition"
            >
              <FileText className="h-3 w-3 text-emerald-400" />
              <span>סיכום תעודות</span>
            </button>
            <button
              onClick={() => void handleSend("בצעי הצלבת חריגות לכלל הצי")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#172230] hover:bg-[#223246] px-2.5 py-1 text-slate-300 border border-[#223246] transition"
            >
              <AlertTriangle className="h-3 w-3 text-purple-400" />
              <span>איתור חריגות</span>
            </button>
            <button
              onClick={() => void handleSend("מה מצב המשאית של עלי?")}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#172230] hover:bg-[#223246] px-2.5 py-1 text-slate-300 border border-[#223246] transition"
            >
              <Truck className="h-3 w-3 text-sky-400" />
              <span>עלי פלטה</span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2 border-t border-white/[0.08] bg-[#0c1722] p-3 sm:px-5 sm:py-4"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל את נועה: מספר תעודה, לקוח, נהג, פקדונות, חריגות..."
              className="min-w-0 flex-1 rounded-2xl border border-white/[0.09] bg-[#08111b] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-[#04130d] shadow-[0_6px_20px_rgba(16,185,129,0.2)] transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1722] disabled:cursor-not-allowed disabled:opacity-40"
              title="שלח הודעה"
            >
              <Send className="h-4 w-4 rotate-180" />
            </button>
          </form>
        </div>

        {isInspectorOpen && (
          <div className="min-h-0 overflow-hidden border-t border-white/[0.07] lg:col-span-5 lg:border-t-0 xl:col-span-4">
            <CrossReferenceInspector
              activeTruck={activeTruck}
              onSelectTruck={(truck) => setActiveTruck(truck)}
              truckSummaries={truckSummaries}
              discrepancies={issues}
              onResolveDiscrepancy={handleResolveDiscrepancy}
              onClose={() => setIsInspectorOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}


