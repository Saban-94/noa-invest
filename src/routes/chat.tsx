import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import noa from "@/assets/noa.jpg";
import {
  Send, CheckCheck, Truck, FileText, Gauge, AlertTriangle, RefreshCw,
  SlidersHorizontal, Volume2, VolumeX, Loader2,
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
  pairPtoEvents, analyzePto, buildTruckSummaries, israelTime,
} from "@/lib/smart-dispatch/pto-pairing";
import {
  asksCurrentGps, asksSourceStatus, buildNoaContext, describeSources,
  evidenceFromMeta, EVIDENCE_LABEL_HE, formatNotesSummary, gpsUnavailableMessage,
  type BackendMeta,
} from "@/lib/chat-grounding";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "נועה AI — חמ״ל לוגיסטי | ח. סבן" },
      { name: "description", content: "חמ״ל צ׳אט ובינה לוגיסטית: הצלבת תעודות מול PTO איתוראן." },
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
    driver: string; truck: string; date: string; kmTotal: string; ptoHours: string;
    imageUrl?: string; stops: TachographStopOverlay[];
  };
  discrepancyAlerts?: DiscrepancyItem[];
  quickActions?: { label: string; query: string }[];
};

const PTO_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

function noteLine(n: DeliveryNote): string {
  const b = n.deposits?.bales60002?.delivered ?? 0;
  const p = n.deposits?.pallets60060?.delivered ?? 0;
  return [
    `ת.מ. ${n.id}`, `לקוח: ${n.customer}`, n.date && `תאריך: ${n.date}`,
    n.siteAddress && `כתובת: ${n.siteAddress}`, n.driver && `נהג: ${n.driver}`,
    `פריטים: ${noteItemsCount(n)}`, `משקל: ${noteWeightTons(n).toFixed(1)} טון`,
    `בלות 60002: ${b}`, `משטחים 60060: ${p}`,
    n.craneTime && `מנוף: ${n.craneTime}`, n.signedBy && `חתם: ${n.signedBy}`,
  ].filter(Boolean).join(" | ");
}

function ChatScreen() {
  const [input, setInput] = useState("");
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [activeTruck, setActiveTruck] = useState("615-41-002");
  const [isThinking, setIsThinking] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const { data: liveNotes, isFetching: isFetchingNotes, error: notesError, refetch: refetchNotes } =
    useQuery<DeliveryNote[]>({ queryKey: ["live-notes-chat"], queryFn: fetchLiveNotes, staleTime: 30_000, retry: 1 });
  const notes = useMemo(() => liveNotes ?? [], [liveNotes]);

  const { data: ptoData, isFetching: isFetchingPto, error: ptoError, refetch: refetchPto } = useQuery({
    queryKey: ["live-pto-chat"],
    queryFn: () => listPtoFn({ data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() } }),
    staleTime: 60_000, retry: 1,
  });

  const analysis = useMemo(() => analyzePto(pairPtoEvents(ptoData?.events ?? []), notes), [ptoData, notes]);
  const sessions = analysis.sessions;
  const issues = useMemo(() => analysis.issues.filter((i) => !resolvedIds.has(i.id)), [analysis, resolvedIds]);
  const truckSummaries = useMemo(() => buildTruckSummaries(sessions), [sessions]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const now = () => new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const brainMeta: BackendMeta = useMemo(() => ({
    notesSource: notesError ? "unavailable" : "live",
    notesCount: notes.length,
    ituranSource: ptoError ? "none" : sessions.length > 0 ? "ituran_pto_sheet" : "none",
    matchedStops: sessions.filter((s) => s.matchedNoteId).length,
    unmatchedStops: sessions.filter((s) => !s.matchedNoteId).length,
    visitsCount: sessions.length,
    warning: notesError ? (notesError instanceof Error ? notesError.message : String(notesError))
      : ptoError ? (ptoError instanceof Error ? ptoError.message : String(ptoError)) : undefined,
  }), [notes, notesError, ptoError, sessions]);

  const evidence = evidenceFromMeta(brainMeta);
  const evidenceLabel = EVIDENCE_LABEL_HE[evidence];
  const fetchedAtLabel = useMemo(
    () => new Date().toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }),
    [notes.length, sessions.length, notesError, ptoError],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "m0", sender: "noa", time: now(), statusTag: "מוח חי · grounding",
    text: "שלום ראמי והראל! נועה כאן בחמ״ל ❤️\nמחוברת לגיליון התעודות ולמאגר PTO של איתוראן.\nשאלי לפי מספר תעודה, נהג, פקדונות או חריגות — אענה רק לפי נתונים מאומתים.",
    quickActions: [
      { label: "📄 סיכום תעודות", query: "תני סיכום של התעודות האחרונות בגיליון" },
      { label: "⚖️ מאזן פקדונות", query: "מה מצב הפקדונות בתעודות האחרונות?" },
      { label: "⚠️ בדיקת חריגות", query: "בצעי הצלבת חריגות לכלל הצי" },
      { label: "🔌 מקורות נתונים", query: "אילו מקורות נתונים מחוברים כרגע?" },
      { label: "🚚 דוח חכמת", query: "מה הסטטוס של המנוף של חכמת?" },
    ],
  }]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isThinking]);

  const handleResolveDiscrepancy = (id: string) => {
    setResolvedIds((prev) => new Set(prev).add(id));
    if (isSoundEnabled) void playDispatchChime(0.6);
    setMessages((prev) => [...prev, {
      id: `sys-${Date.now()}`, sender: "noa", time: now(), statusTag: "אושר ע״י ראמי",
      text: "✓ החריגה סומנה כנבדקה ע״י ראמי מסארווה.",
    }]);
  };

  const pushNoa = (msg: Omit<ChatMessage, "id" | "sender" | "time">) =>
    setMessages((prev) => [...prev, { id: `noa-${Date.now()}`, sender: "noa", time: now(), ...msg }]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || isThinking) return;
    if (isSoundEnabled) void playDispatchChime(0.7);
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, sender: "user", text, time: now() };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");
    const t = text.toLowerCase();

    const idMatch = text.match(/\d{5,}/);
    const foundNote = idMatch ? notes.find((n) => n.id === idMatch[0] || n.comaxOrder === idMatch[0]) : undefined;
    if (foundNote) {
      const b = foundNote.deposits?.bales60002?.delivered ?? 0;
      const p = foundNote.deposits?.pallets60060?.delivered ?? 0;
      const pto = sessions.find((s) => s.matchedNoteId === foundNote.id);
      pushNoa({
        text:
          `📄 ת.מ. ${foundNote.id} — ${foundNote.customer}\n\n` +
          `• תאריך: ${foundNote.date || "—"}\n• כתובת: ${foundNote.siteAddress || "—"}\n` +
          `• נהג: ${foundNote.driver || "—"}\n• פריטים: ${noteItemsCount(foundNote)} | משקל: ${noteWeightTons(foundNote).toFixed(1)} טון\n` +
          `• בלות 60002: ${b} | משטחים 60060: ${p}\n` +
          `• מנוף: ${foundNote.craneTime || "לא נרשם"}\n` +
          `• PTO: ${pto ? `${israelTime(pto.openIso)}–${pto.closeIso ? israelTime(pto.closeIso) : "?"} (${pto.durationMin ?? "?"} דק׳)` : "לא נמצא"}\n` +
          `• חתימה: ${foundNote.signedBy || "לא זוהתה"}`,
        statusTag: pto ? "גיליון + PTO" : "גיליון",
      });
      return;
    }

    const wantsHikmat = t.includes("חכמת") || t.includes("615") || t.includes("מנוף");
    const wantsAli = t.includes("עלי") || t.includes("651") || t.includes("פלטה");
    if (wantsHikmat || wantsAli) {
      const plate = wantsAli && !wantsHikmat ? "651-51-701" : "615-41-002";
      const driverKey = plate === "651-51-701" ? "עלי" : "חכמת";
      setActiveTruck(plate);
      setIsInspectorOpen(true);
      const summary = truckSummaries.find((s) => s.truck === plate);
      const driverNotes = notes.filter((n) => (n.driver || "").includes(driverKey) || (n.driver || "").includes(plate));
      const truckSessions = sessions.filter((s) => s.truck === plate && s.date === summary?.date)
        .sort((a, b) => a.openIso.localeCompare(b.openIso));
      let body = `🚚 ${driverKey} (${plate})\n\n• תעודות בגיליון: ${driverNotes.length}`;
      if (summary) {
        body += `\n• תאריך PTO: ${summary.date}\n• זמן מנוף: ${summary.ptoTime}\n• אירועים:\n` +
          truckSessions.map((s) =>
            `  – ${israelTime(s.openIso)}–${s.closeIso ? israelTime(s.closeIso) : "?"} (${s.durationMin ?? "?"} דק׳) ${s.address || ""}${s.matchedNoteId ? ` ← ת.מ. ${s.matchedNoteId}` : " ⚠️ ללא תעודה"}`
          ).join("\n");
      } else {
        body += plate === "651-51-701" ? "\n• אין חיישן PTO." : "\n• אין אירועי PTO בשבוע האחרון.";
      }
      body += "\n\nאין מיקום GPS חי במסך זה.";
      pushNoa({
        text: body, statusTag: summary ? "גיליון + PTO" : "גיליון",
        tachographCard: summary ? {
          driver: summary.driver, truck: summary.truck, date: summary.date,
          kmTotal: summary.kmTotal, ptoHours: summary.ptoTime, imageUrl: summary.discImage, stops: summary.stops,
        } : undefined,
      });
      return;
    }

    if (t.includes("חריג") || t.includes("הצלבה") || t.includes("פענוח")) {
      setIsInspectorOpen(true);
      pushNoa({
        text: sessions.length === 0 ? "אין אירועי PTO — אי אפשר להצליב."
          : issues.length === 0 ? `✅ ${sessions.length} אירועי PTO — ללא חריגות.`
          : `⚠️ ${issues.length} חריגות מתוך ${sessions.length}:\n\n` +
            issues.slice(0, 10).map((i, k) => `${k + 1}. ${i.title} — ${i.address} (${i.truck})`).join("\n"),
        statusTag: "הצלבת PTO",
        discrepancyAlerts: issues.length ? issues.slice(0, 10) : undefined,
      });
      return;
    }

    if (asksSourceStatus(text)) {
      pushNoa({ text: describeSources(brainMeta, fetchedAtLabel), statusTag: evidenceLabel });
      return;
    }
    if (asksCurrentGps(text)) {
      pushNoa({ text: gpsUnavailableMessage(), statusTag: "אין GPS חי" });
      return;
    }
    if (t.includes("סיכום") && (t.includes("תעוד") || t.includes("גיליון") || t.includes("אחרונ"))) {
      pushNoa({
        text: formatNotesSummary(notes as unknown as Record<string, unknown>[], brainMeta, fetchedAtLabel),
        statusTag: evidenceLabel,
      });
      return;
    }
    if (t.includes("פקדון") || t.includes("פקדונות") || t.includes("בלות") || t.includes("משטח")) {
      if (!notes.length) {
        pushNoa({ text: "אין תעודות חיות למאזן פקדונות.", statusTag: evidenceLabel });
        return;
      }
      const sumB = notes.reduce((s, n) => s + (n.deposits?.bales60002?.delivered ?? 0), 0);
      const sumP = notes.reduce((s, n) => s + (n.deposits?.pallets60060?.delivered ?? 0), 0);
      const lines = notes.slice(0, 25).map((n) =>
        `• ת.מ. ${n.id} · ${n.customer || "—"} · בלות ${n.deposits?.bales60002?.delivered ?? 0} · משטחים ${n.deposits?.pallets60060?.delivered ?? 0}`
      );
      pushNoa({
        text: `⚖️ מאזן פקדונות (מהתעודות, טרם הוצלב מול חיוב):\nסה״כ בלות 60002: ${sumB} | משטחים 60060: ${sumP}\n\n` + lines.join("\n"),
        statusTag: evidenceLabel,
      });
      return;
    }

    setIsThinking(true);
    try {
      const context = [
        buildNoaContext({
          meta: brainMeta, fetchedAt: fetchedAtLabel,
          notes: notes as unknown as Record<string, unknown>[],
          visits: sessions.map((s) => ({
            truck: s.truck, driver: s.driver, fullAddress: s.address,
            noteIds: s.matchedNoteId ? [s.matchedNoteId] : [],
            ituranArrive: s.openIso, ituranDepart: s.closeIso,
          })),
          discrepancies: issues, question: text,
        }),
        "--- noteLines ---",
        ...notes.slice(0, 30).map(noteLine),
        "--- ptoSessions ---",
        ...sessions.slice(0, 20).map((s) =>
          `PTO ${s.date} ${israelTime(s.openIso)}–${s.closeIso ? israelTime(s.closeIso) : "?"} truck=${s.truck} addr=${s.address || ""} note=${s.matchedNoteId || "none"}`
        ),
      ].join("\n");
      const history = [...messages, userMsg].filter((m) => m.id !== "m0").slice(-12).map((m) => ({
        role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));
      const res = await askNoa({ data: { messages: history, context } });
      pushNoa({ text: res.text, statusTag: `מוח · ${evidenceLabel}` });
    } catch (err) {
      pushNoa({
        text: `לא הצלחתי לענות מהמוח: ${err instanceof Error ? err.message : String(err)}`,
        statusTag: "שגיאה",
      });
    } finally {
      setIsThinking(false);
    }
  };

  const refreshAll = () => { void refetchNotes(); void refetchPto(); };
  const isFetching = isFetchingNotes || isFetchingPto;

  return (
    <div dir="rtl" className="flex h-[calc(100dvh-65px)] min-h-0 flex-col overflow-hidden bg-[#08111b] font-sans text-slate-100 selection:bg-emerald-400/25">
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[#0c1722]/95 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={noa} alt="נועה AI" className="h-10 w-10 rounded-2xl object-cover ring-1 ring-emerald-300/40" />
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#0e1620] ${notesError ? "bg-red-500" : "bg-emerald-500"}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-bold text-white sm:text-base">נועה AI — חמ״ל לוגיסטי</h1>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${notesError ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
                {notesError ? "אין גיליון" : `${notes.length} תעודות`}
              </span>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${ptoError ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-sky-500/20 bg-sky-500/10 text-sky-300"}`}>
                {ptoError ? "אין PTO" : `${sessions.length} PTO`}
              </span>
              <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                מוח · {evidenceLabel}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">בקרת ראמי · grounding מאומת · ח. סבן (1994)</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} disabled={isFetching} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 text-slate-300 hover:bg-white/[0.08] disabled:opacity-50" title="רענן">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setIsSoundEnabled((p) => !p)} className={`rounded-xl border p-2.5 ${isSoundEnabled ? "border-[#223246] bg-[#172230] text-emerald-400" : "border-[#223246]/50 text-slate-500"}`}>
            {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button onClick={() => setIsInspectorOpen((p) => !p)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${isInspectorOpen ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-[#223246] bg-[#172230] text-slate-300"}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isInspectorOpen ? "הסתר מפקח" : "מפקח הצלבות"}</span>
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
        <div className={`flex min-h-0 flex-col overflow-hidden border-b border-white/[0.07] lg:border-b-0 ${isInspectorOpen ? "lg:col-span-7 xl:col-span-8" : "lg:col-span-12"}`}>
          <div className="flex-1 space-y-5 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.045),transparent_55%)] px-4 py-5 sm:px-6">
            {messages.map((m) => {
              const isUser = m.sender === "user";
              return (
                <div key={m.id} className={`flex w-full flex-col ${isUser ? "items-start" : "items-end"}`}>
                  <div className={`relative max-w-[96%] rounded-2xl p-4 text-sm leading-relaxed shadow-[0_12px_32px_rgba(0,0,0,0.16)] sm:max-w-[88%] ${
                    isUser ? "rounded-tr-md border border-emerald-300/15 bg-gradient-to-br from-emerald-700 to-emerald-800 text-white"
                      : "rounded-tl-md border border-white/[0.08] bg-[#111d29] text-slate-200"
                  }`}>
                    {!isUser && (
                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/[0.08] pb-2.5 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                          <img src={noa} alt="" className="h-4 w-4 rounded-full object-cover" />
                          <span>נועה AI</span>
                        </div>
                        {m.statusTag && <span className="font-mono text-[10px] text-slate-400">{m.statusTag}</span>}
                      </div>
                    )}
                    <div className="whitespace-pre-line text-[13px] leading-6 sm:text-sm sm:leading-7">{m.text}</div>
                    {m.tachographCard && (
                      <div className="mt-3">
                        <TachographCanvasViewer
                          imageUrl={m.tachographCard.imageUrl} driver={m.tachographCard.driver}
                          truck={m.tachographCard.truck} date={m.tachographCard.date}
                          kmTotal={m.tachographCard.kmTotal} ptoHours={m.tachographCard.ptoHours}
                          stops={m.tachographCard.stops} height={260} compact={false}
                        />
                      </div>
                    )}
                    {m.discrepancyAlerts && m.discrepancyAlerts.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {m.discrepancyAlerts.map((disc) => (
                          <div key={disc.id} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs">
                            <div className="font-semibold text-amber-200">{disc.title}</div>
                            <div className="text-amber-100/70">{disc.address} · {disc.truck}</div>
                            <button type="button" onClick={() => handleResolveDiscrepancy(disc.id)} className="mt-1 text-[11px] font-bold text-emerald-400 hover:underline">
                              סמן כנבדק
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {m.quickActions && m.quickActions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.quickActions.map((qa) => (
                          <button key={qa.query} type="button" onClick={() => void handleSend(qa.query)}
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10">
                            {qa.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className={`mt-2 flex items-center gap-1 text-[10px] ${isUser ? "text-emerald-100/70" : "text-slate-500"}`}>
                      <span>{m.time}</span>
                      {isUser && <CheckCheck className="h-3 w-3" />}
                    </div>
                  </div>
                </div>
              );
            })}
            {isThinking && (
              <div className="flex w-full flex-col items-end">
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-[#111d29] px-4 py-3 text-xs text-emerald-200/90">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  <span>נועה חושבת עם מוח Gemini · מאומת מול גיליון ו-PTO…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto border-t border-white/[0.07] bg-[#0c1722] px-4 py-3 text-xs sm:px-5">
            <span className="shrink-0 text-[11px] font-semibold text-slate-400">שאלות מפתח:</span>
            {[
              ["מנוף חכמת", "מה הסטטוס של המנוף של חכמת?", "amber"],
              ["סיכום תעודות", "תני סיכום של התעודות האחרונות בגיליון", "emerald"],
              ["חריגות", "בצעי הצלבת חריגות לכלל הצי", "purple"],
              ["עלי פלטה", "מה מצב המשאית של עלי?", "sky"],
              ["מקורות", "אילו מקורות נתונים מחוברים כרגע?", "violet"],
              ["פקדונות", "מה מצב הפקדונות בתעודות האחרונות?", "amber"],
            ].map(([label, q]) => (
              <button key={label} type="button" onClick={() => void handleSend(q)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#223246] bg-[#172230] px-2.5 py-1 text-slate-300 transition hover:bg-[#223246]">
                <span>{label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void handleSend(); }}
            className="flex items-center gap-2 border-t border-white/[0.08] bg-[#0c1722] p-3 sm:px-5 sm:py-4">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="שאל את נועה: מספר תעודה, לקוח, נהג, פקדונות, חריגות..."
              className="min-w-0 flex-1 rounded-2xl border border-white/[0.09] bg-[#08111b] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15" />
            <button type="submit" disabled={!input.trim() || isThinking}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-[#04130d] shadow-[0_6px_20px_rgba(16,185,129,0.2)] transition hover:bg-emerald-400 disabled:opacity-40"
              title="שלח">
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
