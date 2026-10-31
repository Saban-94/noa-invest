/**
 * /noa-brain — סביבת עבודה מקצועית של נועה AI
 * שומרת על /chat ללא שינוי. משתפת askNoa, fetchLiveNotes, NotePreviewCard.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  FileText,
  RefreshCw,
  PanelRight,
  MessageSquare,
  ClipboardList,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import noa from "@/assets/noa.jpg";
import { NotePreviewCard, type NoteCardData } from "@/components/chat/NotePreviewCard";
import { fetchLiveNotes } from "@/lib/api";
import { listPtoFn } from "@/lib/notes-api.functions";
import { askNoa } from "@/lib/ai.functions";
import { noteItemsCount, noteWeightTons, type DeliveryNote } from "@/lib/data";
import {
  pairPtoEvents,
  analyzePto,
} from "@/lib/smart-dispatch/pto-pairing";
import {
  buildNoaContext,
  evidenceFromMeta,
  EVIDENCE_LABEL_HE,
  type BackendMeta,
} from "@/lib/chat-grounding";

export const Route = createFileRoute("/noa-brain")({
  validateSearch: (search: Record<string, unknown>) => ({
    customerNo:
      typeof search.customerNo === "string" && /^\d{3,10}$/.test(search.customerNo)
        ? search.customerNo
        : undefined,
    noteId:
      typeof search.noteId === "string" && search.noteId.trim()
        ? search.noteId.trim()
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "נועה Brain — סביבת עבודה | ח. סבן" },
      {
        name: "description",
        content: "סביבת עבודה מקצועית: מסמך, שיחה עם נועה ובקרת לוגיסטיקה.",
      },
    ],
  }),
  component: NoaBrainPage,
});

type QuickAction = {
  id: string;
  label: string;
  query: string;
};

type ChatMessage = {
  id: string;
  sender: "noa" | "user";
  text: string;
  time: string;
  statusTag?: string;
  noteCard?: NoteCardData;
  quickActions?: QuickAction[];
};

const PTO_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

function cleanNoaText(raw: string): string {
  return raw
    .replace(/[*_#`]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function NoaProse({ text }: { text: string }) {
  const blocks = cleanNoaText(text)
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4 text-base leading-7 text-slate-800 sm:text-[17px] sm:leading-8">
      {blocks.map((block, i) => {
        const isHeading =
          block.length < 48 && !block.includes(".") && !/^\d/.test(block);
        if (isHeading) {
          return (
            <h3 key={i} className="text-lg font-semibold text-slate-900 sm:text-xl">
              {block}
            </h3>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function NoaBrainPage() {
  const { customerNo: customerNoFromSearch, noteId: noteIdFromSearch } = Route.useSearch();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [activeCustomerNo, setActiveCustomerNo] = useState<string | undefined>(
    customerNoFromSearch,
  );
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(noteIdFromSearch);
  const [mobileTab, setMobileTab] = useState<"doc" | "chat" | "info">("chat");
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoStarted = useRef<string | null>(null);

  const {
    data: liveNotes,
    isFetching: isFetchingNotes,
    error: notesError,
    refetch: refetchNotes,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-noa-brain"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
    retry: 1,
  });
  const notes = useMemo(() => liveNotes ?? [], [liveNotes]);

  const { data: ptoData, isFetching: isFetchingPto, refetch: refetchPto } = useQuery({
    queryKey: ["live-pto-noa-brain"],
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

  const activeNote = useMemo(() => {
    if (activeNoteId) {
      const byId = notes.find((n) => n.id === activeNoteId || n.comaxOrder === activeNoteId);
      if (byId) return byId;
    }
    if (activeCustomerNo) {
      return notes.find((n) => String(n.customerNo || "").trim() === activeCustomerNo);
    }
    return notes[0];
  }, [notes, activeNoteId, activeCustomerNo]);

  const brainMeta: BackendMeta = useMemo(
    () => ({
      notesSource: notesError ? "unavailable" : "live",
      notesCount: notes.length,
      ituranSource: sessions.length > 0 ? "ituran_pto_sheet" : "none",
      matchedStops: sessions.filter((s) => s.matchedNoteId).length,
      unmatchedStops: sessions.filter((s) => !s.matchedNoteId).length,
      visitsCount: sessions.length,
      warning: notesError
        ? notesError instanceof Error
          ? notesError.message
          : String(notesError)
        : undefined,
    }),
    [notes, notesError, sessions],
  );
  const evidenceLabel = EVIDENCE_LABEL_HE[evidenceFromMeta(brainMeta)];

  const now = () =>
    new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m0",
      sender: "noa",
      time: now(),
      statusTag: "מוכנה לעבודה",
      text:
        "שלום, כאן נועה.\n\n" +
        "זו סביבת העבודה המקצועית. אפשר לבחור תעודת משלוח משמאל, לשאול עליה בשיחה, ולראות את פרטי הלקוח והמסמך בצד.\n\n" +
        "הצ׳אט הקלאסי נשאר זמין בנפרד תחת צ׳אט נועה.",
      quickActions: [
        { id: "w1", label: "סיכום תעודות אחרונות", query: "תני סיכום קצר של התעודות האחרונות בגיליון" },
        { id: "w2", label: "מקורות הנתונים", query: "אילו מקורות נתונים מחוברים כרגע?" },
      ],
    },
  ]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    if (customerNoFromSearch) setActiveCustomerNo(customerNoFromSearch);
  }, [customerNoFromSearch]);

  useEffect(() => {
    if (noteIdFromSearch) setActiveNoteId(noteIdFromSearch);
  }, [noteIdFromSearch]);

  const pushNoa = useCallback((msg: Omit<ChatMessage, "id" | "sender" | "time">) => {
    setMessages((prev) => [
      ...prev,
      { id: `noa-${Date.now()}`, sender: "noa", time: now(), ...msg },
    ]);
  }, []);

  const handleSend = useCallback(
    async (textToSend?: string, customerNoOverride?: string) => {
      const text = (textToSend ?? input).trim();
      if (!text || isThinking) return;

      const named = notes.find(
        (n) => n.customer && n.customer.length > 2 && text.includes(String(n.customer)),
      );
      const idMatch = text.match(/\b(\d{5,10})\b/);
      const noteHit = idMatch
        ? notes.find((n) => n.id === idMatch[1] || n.comaxOrder === idMatch[1])
        : undefined;
      const detectedCustomerNo =
        customerNoOverride ||
        activeCustomerNo ||
        (named?.customerNo ? String(named.customerNo).trim() : undefined) ||
        (noteHit?.customerNo ? String(noteHit.customerNo).trim() : undefined);

      if (detectedCustomerNo) setActiveCustomerNo(detectedCustomerNo);
      if (noteHit) {
        setActiveNoteId(noteHit.id);
        setMobileTab("doc");
      }

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, sender: "user", text, time: now() },
      ]);
      if (!textToSend) setInput("");
      setIsThinking(true);

      try {
        if (noteHit) {
          const card: NoteCardData = {
            noteId: noteHit.id,
            customer: noteHit.customer || "",
            address: noteHit.siteAddress,
            date: noteHit.date,
            driver: noteHit.driver,
            fileId: noteHit.fileId,
            driveUrl: noteHit.driveUrl || noteHit.signedUrl,
          };
          pushNoa({
            text:
              `מצאתי את תעודת המשלוח ${noteHit.id}.\n\n` +
              `הלקוח הוא ${noteHit.customer || "לא צוין"}. ` +
              (noteHit.siteAddress ? `כתובת האספקה: ${noteHit.siteAddress}. ` : "") +
              (noteHit.date ? `תאריך התעודה: ${noteHit.date}. ` : "") +
              (noteHit.driver ? `הנהג: ${noteHit.driver}.` : ""),
            statusTag: "תעודה מהגיליון",
            noteCard: card,
            quickActions: [
              {
                id: `n-${noteHit.id}-full`,
                label: "פירוט מלא על התעודה",
                query: `הציגי פירוט מלא על תעודת משלוח ${noteHit.id} כולל פריטים ופקדונות`,
              },
              {
                id: `n-${noteHit.id}-cust`,
                label: "תיק הלקוח",
                query: detectedCustomerNo
                  ? `הכיני סקירת לקוח ללקוח ${detectedCustomerNo} בלבד`
                  : `מה ידוע על הלקוח ${noteHit.customer}?`,
              },
            ],
          });
          setIsThinking(false);
          return;
        }

        const context = [
          buildNoaContext({
            meta: brainMeta,
            fetchedAt: new Date().toLocaleString("he-IL"),
            notes: notes as unknown as Record<string, unknown>[],
            visits: sessions.map((s) => ({
              truck: s.truck,
              driver: s.driver,
              fullAddress: s.address,
              noteIds: s.matchedNoteId ? [s.matchedNoteId] : [],
              ituranArrive: s.openIso,
              ituranDepart: s.closeIso,
            })),
            discrepancies: [],
            question: text,
          }),
          activeNote
            ? `מסמך פעיל: תעודה ${activeNote.id} לקוח ${activeNote.customer} כתובת ${activeNote.siteAddress || ""}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const history = [...messages, { id: "tmp", sender: "user" as const, text, time: now() }]
          .filter((m) => m.id !== "m0")
          .slice(-12)
          .map((m) => ({
            role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
            content: m.text,
          }));

        const res = await askNoa({
          data: {
            messages: history,
            context,
            customerNo: detectedCustomerNo,
          },
        });

        const fromAi = Array.isArray(res.suggestedQuestions) ? res.suggestedQuestions : [];
        const quickActions: QuickAction[] =
          fromAi.length > 0
            ? fromAi.map((q) => ({ id: q.id, label: q.label, query: q.query }))
            : detectedCustomerNo
              ? [
                  {
                    id: `c-${detectedCustomerNo}-notes`,
                    label: "תעודות הלקוח",
                    query: `הציגי את תעודות המשלוח של לקוח ${detectedCustomerNo} בלבד`,
                  },
                  {
                    id: `c-${detectedCustomerNo}-orders`,
                    label: "הזמנות",
                    query: `מהן ההזמנות האחרונות של לקוח ${detectedCustomerNo}?`,
                  },
                ]
              : [
                  {
                    id: "f-summary",
                    label: "סיכום תעודות",
                    query: "תני סיכום של התעודות האחרונות בגיליון",
                  },
                ];

        pushNoa({
          text: cleanNoaText(res.text),
          statusTag: detectedCustomerNo
            ? `תיק לקוח ${detectedCustomerNo}`
            : `מאומת · ${evidenceLabel}`,
          quickActions,
          noteCard: activeNote
            ? {
                noteId: activeNote.id,
                customer: activeNote.customer || "",
                address: activeNote.siteAddress,
                date: activeNote.date,
                driver: activeNote.driver,
                fileId: activeNote.fileId,
                driveUrl: activeNote.driveUrl || activeNote.signedUrl,
              }
            : undefined,
        });
      } catch (err) {
        pushNoa({
          text: `לא הצלחתי להשלים את המענה. ${err instanceof Error ? err.message : String(err)}`,
          statusTag: "שגיאה",
        });
      } finally {
        setIsThinking(false);
      }
    },
    [
      input,
      isThinking,
      notes,
      activeCustomerNo,
      activeNote,
      brainMeta,
      sessions,
      messages,
      evidenceLabel,
      pushNoa,
    ],
  );

  useEffect(() => {
    if (!customerNoFromSearch || isFetchingNotes) return;
    const key = `${customerNoFromSearch}:brain-review`;
    if (autoStarted.current === key) return;
    autoStarted.current = key;
    void handleSend(
      `הכיני סקירת לקוח מקצועית ללקוח ${customerNoFromSearch} בלבד. כתבי בעברית מלאה, בלי סימני עיצוב טכניים.`,
      customerNoFromSearch,
    );
  }, [customerNoFromSearch, isFetchingNotes, handleSend]);

  const customerNotes = useMemo(() => {
    if (!activeCustomerNo) return [];
    return notes.filter((n) => String(n.customerNo || "").trim() === activeCustomerNo);
  }, [notes, activeCustomerNo]);

  const docPanel = (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-500">מסמך פעיל</div>
          <div className="text-lg font-bold text-slate-900">
            {activeNote ? `תעודת משלוח ${activeNote.id}` : "לא נבחר מסמך"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void refetchNotes();
            void refetchPto();
          }}
          className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
          title="רענון"
        >
          <RefreshCw className={`h-4 w-4 ${isFetchingNotes || isFetchingPto ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeNote ? (
          <div className="space-y-4">
            <NotePreviewCard
              card={{
                noteId: activeNote.id,
                customer: activeNote.customer || "",
                address: activeNote.siteAddress,
                date: activeNote.date,
                driver: activeNote.driver,
                fileId: activeNote.fileId,
                driveUrl: activeNote.driveUrl || activeNote.signedUrl,
              }}
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-base font-bold text-slate-900">פרטי האספקה</h3>
              <dl className="grid grid-cols-1 gap-3 text-base text-slate-700 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-slate-500">לקוח</dt>
                  <dd className="font-semibold">{activeNote.customer || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">מספר לקוח</dt>
                  <dd className="font-semibold">{activeNote.customerNo || "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm text-slate-500">כתובת</dt>
                  <dd className="font-semibold">{activeNote.siteAddress || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">תאריך</dt>
                  <dd className="font-semibold">{activeNote.date || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">נהג</dt>
                  <dd className="font-semibold">{activeNote.driver || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">פריטים / משקל</dt>
                  <dd className="font-semibold">
                    {noteItemsCount(activeNote)} פריטים · {noteWeightTons(activeNote).toFixed(1)} טון
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void handleSend(
                      `הציגי פירוט מלא על תעודת משלוח ${activeNote.id}`,
                      activeNote.customerNo ? String(activeNote.customerNo) : undefined,
                    )
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  <MessageSquare className="h-4 w-4" />
                  שאל את נועה על התעודה
                </button>
                {(activeNote.driveUrl || activeNote.signedUrl) && (
                  <a
                    href={activeNote.driveUrl || activeNote.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    פתח ב-Drive
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-500">
            <FileText className="h-10 w-10 opacity-40" />
            <p className="text-base">בחרו תעודה מהרשימה או ציינו מספר תעודה בשיחה</p>
          </div>
        )}
      </div>

      <div className="max-h-40 overflow-y-auto border-t border-slate-200 bg-white">
        <div className="sticky top-0 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">
          תעודות ({activeCustomerNo ? customerNotes.length : notes.length})
        </div>
        {(activeCustomerNo ? customerNotes : notes).slice(0, 30).map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => {
              setActiveNoteId(n.id);
              if (n.customerNo) setActiveCustomerNo(String(n.customerNo).trim());
              setMobileTab("doc");
            }}
            className={`flex w-full items-center justify-between border-b border-slate-100 px-3 py-2.5 text-right text-sm transition hover:bg-emerald-50 ${
              activeNote?.id === n.id ? "bg-emerald-50 font-semibold text-emerald-900" : "text-slate-700"
            }`}
          >
            <span className="truncate">{n.customer || "ללא שם"}</span>
            <span className="shrink-0 font-mono text-xs text-slate-500">{n.id}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const chatPanel = (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <img src={noa} alt="" className="h-11 w-11 rounded-2xl object-cover ring-2 ring-emerald-200" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold text-slate-900">נועה Brain</div>
          <div className="text-sm text-slate-500">
            {activeCustomerNo ? `תיק לקוח ${activeCustomerNo}` : "סביבת עבודה מקצועית"}
            {" · "}
            {notesError ? "אין גיליון" : `${notes.length} תעודות`}
          </div>
        </div>
        <Link
          to="/chat"
          className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:inline"
        >
          צ׳אט קלאסי
        </Link>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-4 py-5 sm:px-6">
        {messages.map((m) => {
          const isUser = m.sender === "user";
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[min(100%,36rem)] rounded-2xl px-5 py-4 shadow-sm ${
                  isUser
                    ? "rounded-tr-md bg-emerald-700 text-white"
                    : "rounded-tl-md border border-slate-200 bg-white text-slate-800"
                }`}
              >
                {!isUser && (
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <span className="text-sm font-bold text-emerald-700">נועה AI</span>
                    {m.statusTag && (
                      <span className="text-sm text-slate-500">{m.statusTag}</span>
                    )}
                  </div>
                )}
                {isUser ? (
                  <p className="text-base leading-7 whitespace-pre-line">{m.text}</p>
                ) : (
                  <NoaProse text={m.text} />
                )}
                {m.noteCard && (
                  <div className="mt-4">
                    <NotePreviewCard card={m.noteCard} />
                  </div>
                )}
                {!isUser && m.quickActions && m.quickActions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {m.quickActions.map((qa) => (
                      <button
                        key={qa.id}
                        type="button"
                        disabled={isThinking}
                        onClick={() => void handleSend(qa.query, activeCustomerNo)}
                        className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className={`mt-2 text-sm ${isUser ? "text-emerald-100/80" : "text-slate-400"}`}>
                  {m.time}
                </div>
              </div>
            </div>
          );
        })}
        {isThinking && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              נועה מכינה מענה מקצועי…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex items-center gap-2 border-t border-slate-200 bg-white p-3 sm:p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שאלו על תעודה, לקוח או הזמנה…"
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
        <button
          type="submit"
          disabled={!input.trim() || isThinking}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-40"
        >
          <Send className="h-5 w-5 rotate-180" />
        </button>
      </form>
    </div>
  );

  const infoPanel = (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-slate-50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
        <ClipboardList className="h-4 w-4 text-emerald-600" />
        בקרת מסמך
      </h2>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-base shadow-sm">
        <div>
          <div className="text-sm text-slate-500">מקורות</div>
          <div className="font-semibold text-slate-800">{evidenceLabel}</div>
        </div>
        <div>
          <div className="text-sm text-slate-500">תעודות בגיליון</div>
          <div className="font-semibold text-slate-800">{notes.length}</div>
        </div>
        <div>
          <div className="text-sm text-slate-500">אירועי PTO (שבוע)</div>
          <div className="font-semibold text-slate-800">{sessions.length}</div>
        </div>
        {activeCustomerNo && (
          <div>
            <div className="text-sm text-slate-500">לקוח פעיל</div>
            <div className="font-semibold text-slate-800">{activeCustomerNo}</div>
            <div className="text-sm text-slate-600">
              {customerNotes.length} תעודות בטווח
            </div>
          </div>
        )}
        {activeNote && (
          <div className="border-t border-slate-100 pt-3">
            <div className="text-sm text-slate-500">מסמך נבחר</div>
            <div className="font-semibold text-slate-800">תעודה {activeNote.id}</div>
            <div className="text-sm text-slate-600">{activeNote.customer}</div>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-2">
        <Link
          to="/chat"
          className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          מעבר לצ׳אט נועה הקלאסי
        </Link>
        <Link
          to="/canvas"
          className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          קנבס עריכת תעודה
        </Link>
        <Link
          to="/notes"
          className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          רשימת תעודות
        </Link>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="flex h-[calc(100dvh-65px)] min-h-0 flex-col bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              נועה Brain
            </h1>
            <p className="text-sm text-slate-500">מסמך · שיחה · בקרה — בלי לפגוע בצ׳אט הקיים</p>
          </div>
        </div>
        {activeCustomerNo && (
          <button
            type="button"
            onClick={() => {
              setActiveCustomerNo(undefined);
              setActiveNoteId(undefined);
            }}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            לקוח {activeCustomerNo}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      <div className="flex border-b border-slate-200 bg-white lg:hidden">
        {(
          [
            { id: "doc" as const, label: "מסמך", icon: FileText },
            { id: "chat" as const, label: "שיחה", icon: MessageSquare },
            { id: "info" as const, label: "בקרה", icon: PanelRight },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobileTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-semibold ${
              mobileTab === id
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-slate-500"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        <section
          className={`min-h-0 border-slate-200 lg:col-span-4 lg:border-l ${
            mobileTab === "doc" ? "flex" : "hidden lg:flex"
          } flex-col`}
        >
          {docPanel}
        </section>
        <section
          className={`min-h-0 lg:col-span-5 ${
            mobileTab === "chat" ? "flex" : "hidden lg:flex"
          } flex-col`}
        >
          {chatPanel}
        </section>
        <section
          className={`min-h-0 border-slate-200 lg:col-span-3 lg:border-r ${
            mobileTab === "info" ? "flex" : "hidden lg:flex"
          } flex-col`}
        >
          {infoPanel}
        </section>
      </div>
    </div>
  );
}
