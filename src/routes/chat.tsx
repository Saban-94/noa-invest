import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { PageHeader } from "@/components/AppShell";
import noa from "@/assets/noa.jpg";
import { useLiveSheetData } from "@/lib/sheet-data";
import { Send, CheckCheck, Truck, FileText, Gauge, ZoomIn, ZoomOut, RotateCw, Sun } from "lucide-react";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "נועה AI — ח. סבן לוגיסטיקה" },
      {
        name: "description",
        content: "צ׳אט לוגיסטי חכם עם נועה, סדרנית ויד ימינו של ראמי מסארווה.",
      },
      { property: "og:title", content: "נועה AI — סדרנית ח. סבן" },
      { property: "og:description", content: "בירור סטטוס הזמנות, תעודות משלוח וניתוח טכוגרף בוואטסאפ." },
    ],
  }),
  component: ChatScreen,
});

type Message = {
  id: string;
  sender: "noa" | "user";
  text: string;
  time: string;
  tachographData?: {
    driver: string;
    truck: string;
    date: string;
    kmTotal: string;
    ptoHours: string;
    imageUrl?: string;
  };
};

function ChatScreen() {
  const [input, setInput] = useState("");
  const { notes: liveNotes, orders: liveOrders, tachographs: liveTachs } = useLiveSheetData();
  
  // Canvas interactive state for disc viewer inside chat
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isInverted, setIsInverted] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m1",
      sender: "noa",
      text: "היי ראמי והראל! נועה כאן ❤️\nכל נתוני הגיליון, סריקות גליה ודיסקית הטכוגרף מסונכרנים בזמן אמת. לבקשתך, הוספתי יכולת הצגת קנבס אינטראקטיבי לניתוח הדיסקיות ישירות כאן בצ'אט. במה תרצו שנפתח?",
      time: "08:15",
    },
  ]);

  const now = () => new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const handleSend = (textToSend?: string) => {
    const text = textToSend ?? input;
    if (!text.trim()) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      time: now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput("");

    setTimeout(() => {
      let reply = "קיבלתי! הכל מתועד במערכת ובגיליון בדיקת תעודות משלוח.";
      let tachoPayload: Message["tachographData"] | undefined = undefined;
      const t = text.toLowerCase();

      if (
        t.includes("טכוגרף") ||
        t.includes("חכמת") ||
        t.includes("עלי") ||
        t.includes("קילומטר") ||
        t.includes('ק"מ') ||
        t.includes("דיסקית")
      ) {
        const tacho = liveTachs[0];
        if (tacho) {
          reply = `🚚 **דוח טכוגרף וניתוח חזותי (משאית ${tacho.truckId}):**\n• נהג: ${tacho.driverName}\n• תאריך: ${tacho.date}\n• קילומטראז': **${tacho.kmTotal} ק״מ**\n• זמן עבודת מנוף ב-PTO: **${tacho.ptoHours} שעות**\n• אימות איתוראן: **${tacho.ituranMatch}**\n\n*הצגתי למטה את קנבס הדיסקית האינטראקטיבי לבדיקת חריטות המחט.*`;
          tachoPayload = {
            driver: tacho.driverName,
            truck: tacho.truckId,
            date: tacho.date,
            kmTotal: tacho.kmTotal,
            ptoHours: tacho.ptoHours,
            imageUrl: tacho.discLink || "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600",
          };
        } else {
          reply = `🚚 **דוח טכוגרף:**\nכרגע אין דיסקיות טכוגרף פעילות בטאב "ארכיון_טכוגרף" בגיליון. ברגע שגליה תסרוק את העמוד האחרון, הנתונים יופיעו כאן מיידית.`;
        }
      } else if (t.includes("הזמנ") || t.includes("לקוח") || t.includes("הפצה")) {
        if (liveOrders.length > 0) {
          const sample = liveOrders
            .slice(0, 3)
            .map((o) => `• הזמנה ${o.id} (${o.customer}) — סטטוס: ${o.status}, ${o.yard}`)
            .join("\n");
          reply = `📦 **סטטוס הזמנות חיות מגיליון:**\nכרגע יש **${liveOrders.length} הזמנות** פעילות בגיליון:\n${sample}`;
        } else {
          reply = `📦 **סטטוס הזמנות חיות:**\nאין הזמנות פתוחות כרגע בגיליון.`;
        }
      } else if (t.includes("תעוד") || t.includes("אישור") || t.includes("הראל") || t.includes("ראמי")) {
        if (liveNotes.length > 0) {
          reply = `📄 **תמונת תעודות משלוח מגיליון סבן:**\nנקלטו **${liveNotes.length} תעודות משלוח** חי מגיליון וחתומות כנדרש!`;
        } else {
          reply = `📄 **תמונת תעודות משלוח:**\nאין תעודות משלוח בגיליון כרגע.`;
        }
      } else {
        reply = `הבנתי אותך! המערכת בודקת את הנתונים בזמן אמת מול גיליון בדיקת תעודות משלוח ומסד איתוראן.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `noa-${Date.now()}`,
          sender: "noa",
          text: reply,
          time: now(),
          tachographData: tachoPayload,
        },
      ]);
    }, 500);
  };

  return (
    <>
      <PageHeader
        title="נועה AI"
        subtitle="חדר צ׳אט לוגיסטי עם ניתוח טכוגרף וקנבס אינטראקטיבי"
        action={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-2xl bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              מחוברת לגיליון ולאיתוראן
            </span>
          </div>
        }
      />

      <div className="mx-auto max-w-4xl px-4 py-4 md:px-8">
        {/* WhatsApp Frame */}
        <div className="flex flex-col h-[80dvh] rounded-3xl border bg-card shadow-lift overflow-hidden">
          {/* WhatsApp Header */}
          <div className="flex items-center justify-between border-b bg-emerald-800 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <img
                src={noa}
                alt="נועה"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-white/30"
              />
              <div>
                <div className="font-bold text-sm">נועה ❤️</div>
                <div className="text-[11px] opacity-80">סדרנית ויד ימינו של ראמי — מחוברת ל-Apps Script</div>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#efeae2]/30 dark:bg-zinc-950">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === "user" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[80%] rounded-2xl p-3.5 text-sm shadow-sm leading-relaxed ${
                    m.sender === "user"
                      ? "rounded-tr-none bg-emerald-600 text-white"
                      : "rounded-tl-none bg-card text-card-foreground border"
                  }`}
                >
                  <div className="whitespace-pre-line">{m.text}</div>

                  {/* Tachograph Canvas Viewer Integration */}
                  {m.tachographData && (
                    <div className="mt-3 rounded-2xl border bg-muted/50 p-3 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-primary">
                        <span>🔍 קנבס דיסקית: {m.tachographData.driver} ({m.tachographData.truck})</span>
                        <span className="rounded bg-primary/10 px-2 py-0.5">{m.tachographData.date}</span>
                      </div>

                      {/* Interactive Canvas Toolbar */}
                      <div className="flex items-center justify-center gap-2 rounded-xl bg-background p-1.5 border shadow-2xs text-xs">
                        <button
                          onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                          className="p-1.5 hover:bg-muted rounded-lg transition"
                          title="הגדל זום"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setZoom((z) => Math.max(z - 0.25, 0.75))}
                          className="p-1.5 hover:bg-muted rounded-lg transition"
                          title="הקקט זום"
                        >
                          <ZoomOut className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setRotation((r) => (r + 90) % 360)}
                          className="p-1.5 hover:bg-muted rounded-lg transition"
                          title="סובב 90 מעלות"
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setIsInverted((prev) => !prev)}
                          className="p-1.5 hover:bg-muted rounded-lg transition"
                          title="החלף מצב ניגודיות (נגטיב)"
                        >
                          <Sun className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Canvas Image Container */}
                      <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-black/90 h-[260px] border">
                        <img
                          src={m.tachographData.imageUrl}
                          alt="דיסקית טכוגרף"
                          className="max-h-full w-auto object-contain transition-transform duration-150"
                          style={{
                            transform: `scale(${zoom}) rotate(${rotation}deg)`,
                            filter: `${isInverted ? "invert(1) " : ""}contrast(120%)`,
                          }}
                        />
                        <div className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-mono text-emerald-400 backdrop-blur-xs">
                          סה״כ ק״מ: {m.tachographData.kmTotal} | PTO: {m.tachographData.ptoHours}h
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                    <span>{m.time}</span>
                    <CheckCheck className="h-3 w-3" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Prompts Bar */}
          <div className="flex gap-1.5 overflow-x-auto border-t bg-muted/40 p-2 text-xs">
            <button
              onClick={() => handleSend("מה הסטטוס של דיסקית הטכוגרף של חכמת?")}
              className="flex items-center gap-1 whitespace-nowrap rounded-xl border bg-card px-2.5 py-1.5 font-medium hover:bg-muted shadow-2xs"
            >
              <Gauge className="h-3 w-3 text-amber-600" /> דוח טכוגרף חכמת
            </button>
            <button
              onClick={() => handleSend("תציגי את תמונת תעודות המשלוח של היום")}
              className="flex items-center gap-1 whitespace-nowrap rounded-xl border bg-card px-2.5 py-1.5 font-medium hover:bg-muted shadow-2xs"
            >
              <FileText className="h-3 w-3 text-primary" /> תעודות לאישור
            </button>
            <button
              onClick={() => handleSend("איזה הזמנות בהעמסה במחסן 4 החרש?")}
              className="flex items-center gap-1 whitespace-nowrap rounded-xl border bg-card px-2.5 py-1.5 font-medium hover:bg-muted shadow-2xs"
            >
              <Truck className="h-3 w-3 text-emerald-600" /> הזמנות מחסן 4
            </button>
          </div>

          {/* WhatsApp Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 border-t bg-card p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="כתוב הודעה לנועה (שאל על טכוגרף, תעודה או הזמנה)..."
              className="flex-1 rounded-2xl border bg-muted/30 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4 rotate-180" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}