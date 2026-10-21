import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/AppShell";
import noa from "@/assets/noa.jpg";
import { playDispatchChime } from "@/lib/audio-alerts";
import { fetchNotes, fetchLiveOrders, type DeliveryNote, type Order } from "@/lib/data";
import { useApprovals } from "@/lib/store";
import { Send, Sparkles, RefreshCw, Truck, Crown, Layers, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "נועה AI — חדר צ'אט סדרנית | ח. סבן" },
      {
        name: "description",
        content: "חדר צ'אט חי בסגנון וואטסאפ עם נועה AI, סדרנית ויד ימינו של ראמי מסארווה.",
      },
      { property: "og:title", content: "נועה AI — חדר צ'אט" },
      { property: "og:description", content: "בירור סטטוס הזמנות, נהגים ואישורי מנכ״ל." },
    ],
  }),
  component: NoaChatPage,
});

type Message = {
  id: string;
  sender: "noa" | "user";
  text: string;
  time: string;
  statusTag?: string;
};

function formatText(text: string) {
  // Simple bold parser for WhatsApp style **bold**
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-extrabold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function NoaChatPage() {
  const approvalsState = useApprovals();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "noa",
      text: "שלום ראמי והראל! ❤️ כאן **נועה**, הסדרנית שלכם בח. סבן חומרי בניין (1994) בע״מ. אני מחוברת בזמן אמת לגיליון הסידור, להצלבת איתוראן ולתעודות של קומקס. במה אפשר לעזור?",
      time: "07:30",
    },
    {
      id: "2",
      sender: "noa",
      text: "🚚 **עדכון בוקר מהשטח:** חכמת (מנוף 615-41-002) ועלי (פלטה 651-51-701) יצאו למסלולי חלוקה. תעודות משלוח שסרקה גליה ממתינות לבדיקה.",
      time: "07:31",
      statusTag: "🟢 פעיל",
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    const now = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: textToSend,
      time: now,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    void playDispatchChime(0.7);
    setIsTyping(true);

    try {
      // Fetch live context from Apps Script / local store
      const [liveNotes, liveOrders] = await Promise.all([fetchNotes(), fetchLiveOrders()]);
      const readyHarel = liveNotes.filter(
        (n) => approvalsState[n.id]?.rami && !approvalsState[n.id]?.harel,
      );

      setTimeout(() => {
        let reply = "";
        let tag: string | undefined = undefined;

        const q = textToSend.toLowerCase();

        if (q.includes("חכמת") || q.includes("נהג") || q.includes("משאית") || q.includes("עלי")) {
          reply = `🚚 **סטטוס נהגים ורכבים:**\n- **חכמת (משאית מנוף 615-41-002):** פריקה הושלמה ברחוב נח 3 ת״א (איתוראן: 38 דק׳ שהייה). בדרך למחסן 4 החרש 10 להעמסה הבאה.\n- **עלי (משאית פלטה 651-51-701):** פריקה בהוד השרון עבור יוסף בילר עם מלגזה באתר.`;
          tag = "🟢 משאיות בתנועה";
        } else if (
          q.includes("הראל") ||
          q.includes("מנכ״ל") ||
          q.includes("אישור") ||
          q.includes("חתימ")
        ) {
          reply = `👑 **דוח אישורי מנכ״ל (הראל אידלסון):**\nנכון לעכשיו יש **${readyHarel.length} תעודות** שנבדקו ע״י ראמי וממתינות לחתימתך.\n${
            readyHarel.length > 0
              ? readyHarel.map((n) => `• ת.מ. **${n.id}** (${n.customer})`).join("\n")
              : "כל התעודות שנבדקו כבר אושרו לחיוב! ☕"
          }`;
          tag = readyHarel.length > 0 ? "⚠️ ממתין לחתימה" : "🟢 הכל מאושר";
        } else if (
          q.includes("פקדון") ||
          q.includes("בלה") ||
          q.includes("משטח") ||
          q.includes("60002")
        ) {
          reply = `📦 **מאזן פקדונות 1:1 בשטח:**\n- **שקי בלה (מק״ט 60002):** סך 418 בלות פתוחות אצל לקוחות עוגן.\n- **משטחי עץ סבן (מק״ט 60060):** סך 276 משטחים רשומים להחזרה.\nכל התעודות היום חויבו בהתאמה מלאה של 1:1 מול הזמנת קומקס.`;
          tag = "🟢 פקדונות מאומתים";
        } else if (q.includes("סנכרון") || q.includes("גיליון") || q.includes("רענן")) {
          reply = `🔄 **סנכרון מול Google Apps Script:**\nהנתונים נמשכו בהצלחה מגיליון **״מאגר מידע נועה״**. נטענו ${liveNotes.length} תעודות ו-${liveOrders.length} הזמנות חיות.`;
          tag = "🟢 מסונכרן ענן";
        } else {
          reply = `רשמתי לפניי! 📝 העברתי את ההערה ליומן הסידור של ראמי ומערכת הבקרה. יש עוד משהו שאוכל לבדוק מול קומקס או איתוראן?`;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: "noa",
            text: reply,
            time: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
            statusTag: tag,
          },
        ]);
        setIsTyping(false);
        void playDispatchChime(0.85);
      }, 750);
    } catch {
      setIsTyping(false);
    }
  };

  return (
    <>
      <PageHeader
        title="נועה AI — חדר צ'אט סידור"
        subtitle="ממשק דו-שיח חכם מחובר לגיליון נועה, קומקס ERP ואיתוראן"
      />

      <div className="mx-auto max-w-4xl px-4 py-4 md:px-8">
        {/* WhatsApp Frame Container */}
        <div className="flex h-[calc(100dvh-170px)] min-h-[480px] flex-col overflow-hidden rounded-3xl bg-card shadow-2xl border border-border/80">
          {/* WhatsApp Header */}
          <div className="flex items-center justify-between bg-sidebar px-5 py-3.5 text-sidebar-foreground">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={noa}
                  alt="נועה AI"
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-emerald-500 shadow-sm"
                />
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
              </div>
              <div>
                <div className="font-display text-base font-bold flex items-center gap-2">
                  <span>נועה ❤️</span>
                  <span className="text-[11px] font-normal opacity-70">סדרנית ח. סבן</span>
                </div>
                <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>מחוברת ומסונכרנת ל-Apps Script</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                void handleSendMessage("סנכרן מול גיליון נועה");
                toast.success("מתבצע רענון נתונים מול Google Sheets...");
              }}
              className="flex items-center gap-1.5 rounded-xl bg-sidebar-accent px-3 py-1.5 text-xs font-semibold text-sidebar-foreground hover:bg-sidebar-accent/80 transition"
              title="רענן מול Google Apps Script"
            >
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">סנכרן גיליון</span>
            </button>
          </div>

          {/* Quick Action Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto border-b bg-muted/40 p-2.5 text-xs font-bold touch-scroll">
            <button
              onClick={() => handleSendMessage("איפה חכמת ועלי?")}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-card border px-3 py-1.5 text-foreground hover:bg-primary/10 hover:text-primary transition shadow-2xs"
            >
              <Truck className="h-3.5 w-3.5 text-blue-500" />
              <span>סטטוס משאיות חכמת ועלי</span>
            </button>

            <button
              onClick={() => handleSendMessage("איזה תעודות ממתינות לאישור הראל?")}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-card border px-3 py-1.5 text-foreground hover:bg-primary/10 hover:text-primary transition shadow-2xs"
            >
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              <span>דוח אישורי מנכ״ל להראל</span>
            </button>

            <button
              onClick={() => handleSendMessage("מה יתרת שקי בלה ומשטחים?")}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-card border px-3 py-1.5 text-foreground hover:bg-primary/10 hover:text-primary transition shadow-2xs"
            >
              <Layers className="h-3.5 w-3.5 text-emerald-500" />
              <span>בדיקת פקדונות (60002)</span>
            </button>
          </div>

          {/* WhatsApp Chat Body */}
          <div className="chat-pattern flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-start" : "items-end"}`}
              >
                <div
                  className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                    m.sender === "user"
                      ? "bg-bubble-out text-foreground rounded-br-xs border border-emerald-600/20"
                      : "bg-bubble-in text-foreground rounded-bl-xs border border-border/60"
                  }`}
                >
                  {m.statusTag && (
                    <div className="mb-1.5 inline-block rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {m.statusTag}
                    </div>
                  )}

                  <div className="whitespace-pre-line text-sm md:text-[13px]">
                    {formatText(m.text)}
                  </div>

                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <span>{m.time}</span>
                    {m.sender === "user" && <CheckCheck className="h-3 w-3 text-blue-500" />}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2 text-xs text-muted-foreground shadow-2xs w-fit">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
                <span className="font-semibold text-foreground mr-1">נועה מקלידה...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* WhatsApp Chat Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage(input);
            }}
            className="flex items-center gap-2 border-t bg-card p-3"
          >
            <input
              type="text"
              placeholder="כתוב הודעה לנועה (שאל על נהג, תעודה, הזמנה או לקוח)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 rounded-2xl bg-muted/60 px-4 py-3 text-xs font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 border border-transparent focus:border-primary/20"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md hover:opacity-90 transition active:scale-95 disabled:opacity-40"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
