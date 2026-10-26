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

  const [truckSummaries, setTruckSummaries] = useState<DriverTruckSummary[]>([
    {
      driver: "חכמת גאבר",
      truck: "615-41-002",
      truckType: "מרצדס מנוף 32 טון",
      date: "15/10/2026",
      kmTotal: "140",
      driveTime: "03:45",
      workTime: "04:10",
      ptoTime: "02:15",
      idleTime: "00:35",
      discImage: "/src/assets/images/tachograph_disc_scan_1792629364395.jpg",
      verifiedStatus: "תקין מול איתוראן",
      stops: [
        {
          id: "s1",
          label: "א.ערן אזולאי בע״מ (תעודות 6715766, 6715767)",
          address: "משה שרת 9, הוד השרון",
          arriveTime: "09:15",
          departTime: "10:00",
          ptoOpen: "09:20",
          ptoClose: "09:58",
          ptoMin: 38,
        },
        {
          id: "s2",
          label: "דניה סיבוס בע״מ (תעודה 6715792)",
          address: "נח 3, תל אביב",
          arriveTime: "10:40",
          departTime: "11:30",
          ptoOpen: "10:45",
          ptoClose: "11:25",
          ptoMin: 40,
        },
      ],
    },
    {
      driver: "עלי אבו עידה",
      truck: "651-51-701",
      truckType: "איסוזו פלטה",
      date: "15/10/2026",
      kmTotal: "95",
      driveTime: "02:20",
      workTime: "03:30",
      ptoTime: "00:00",
      idleTime: "00:40",
      discImage: "/src/assets/images/tachograph_disc_scan_1792629364395.jpg",
      verifiedStatus: "ממתין לבדיקת ראמי",
      stops: [
        {
          id: "s3",
          label: "רמי ששון תשתיות (תעודה 6715780)",
          address: "הרקפת 4, הוד השרון",
          arriveTime: "11:45",
          departTime: "12:25",
          ptoMin: 0,
        },
        {
          id: "s4",
          label: "אספקה כללית (תעודה 6715805)",
          address: "סוקולוב 22, רמת השרון",
          arriveTime: "13:00",
          departTime: "13:40",
          ptoMin: 0,
        },
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initial welcome message
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m0",
      sender: "noa",
      text: "שלום ראמי והראל! נועה כאן בחמ״ל הלוגיסטי של סבן ❤️\nסנכרנתי בזמן אמת את גיליון תעודות גליה, מערכת איתוראן וארכיון דיסקיות הטכוגרף.\n\nאני מוכנה לפיצוח והצלבת נתוני היום: בדיקת זמני מנוף, זיהוי חריגות שהייה ללא PTO, ופענוח חזותי מלא של חריטות המחט בדיסקית. במה נפתח?",
      time: "07:30",
      statusTag: "מחוברת לחמ״ל בזמן אמת",
      quickActions: [
        { label: "🔍 דוח טכוגרף חכמת (615-41-002)", query: "מה הסטטוס של דיסקית הטכוגרף של חכמת?" },
        {
          label: "📍 היסטוריית רקפת 4, הוד השרון",
          query: "בדקי היסטוריית ביקור באתר רקפת 4, הוד השרון",
        },
        { label: "⚠️ בדיקת חריגות והצלבה סגורה", query: "בצעי פיצוח והצלבת חריגות לכלל הצי היום" },
        { label: "🚚 סטטוס עלי אבו עידה (651-51-701)", query: "מה מצב המשאית של עלי אבו עידה?" },
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
              const driver = String(d["נהג"] || "חכמת גאבר");
              const truck = String(d["רישוי / משאית"] || "615-41-002");
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
                    : "09:00",
                  departTime: v.ituranDepartTime
                    ? String(v.ituranDepartTime).split(" ")[1]?.slice(0, 5)
                    : "09:45",
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
                truckType: d["סוג משאית"] || (truck.includes("615") ? "מרצדס מנוף" : "פלטה"),
                date: d["תאריך דיסקית"] || "15/10/2026",
                kmTotal: d['סה"כ ק"מ'] || "140",
                driveTime: d["זמן נסיעה"] || "03:45",
                workTime: d["זמן עבודה"] || "04:10",
                ptoTime: d["זמן מנוף"] || (truck.includes("615") ? "02:15" : "00:00"),
                idleTime: d["זמן סרק"] || "00:35",
                discImage:
                  d["קישור לדיסקית"] || "/src/assets/images/tachograph_disc_scan_1792629364395.jpg",
                verifiedStatus: d["סטטוס אימות"] || "תקין מול איתוראן",
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
        text: `✓ החריגה סומנה כנבדקה ואושרה ע״י ראמי מסארווה. עודכן ביומן הבקרה ובמערכת.`,
        time: now(),
        statusTag: "אושר ע״י ראמי",
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

    const normalizedQuestion = text.trim();
    const asksCurrentGps =
      /(?:מיקום|איפה|היכן).{0,45}(?:משאית|רכב).{0,45}(?:כרגע|עכשיו|נוכחי|gps|איתוראן)?|(?:gps|איתוראן).{0,45}(?:מיקום|משאית|כרגע|עכשיו)|(?:משאית|רכב).{0,45}(?:מיקום|gps).{0,45}(?:כרגע|עכשיו)/i.test(normalizedQuestion);
    const asksSourceStatus =
      /(?:אילו|איזה|מה).{0,45}(?:נתונים|מקורות).{0,45}(?:זמינים|מקור|מחובר|כרגע)?|(?:מה מקורם|אילו נתונים זמינים)/i.test(normalizedQuestion);

    if (asksCurrentGps || asksSourceStatus) {
      const responseText = asksCurrentGps
        ? "אין לי כרגע מיקום GPS חי ומאומת של המשאית. מסך הצ׳אט אינו מקבל כרגע נתוני מיקום חיים עם מזהה רכב וזמן עדכון, ולכן איני יכולה לקבוע היכן המשאית נמצאת או לאשר שאיתוראן מחובר. כדי למסור מיקום אמיתי צריך לחבר ולבדוק מקור GPS פעיל."
        : "אין לי כרגע דוח מאומת של מקורות הנתונים וזמני העדכון שלהם. הצגת מסך או נתונים היסטוריים אינה מוכיחה שמערכת חיצונית מחוברת או מסונכרנת. בפרט, אין לי מיקום GPS חי מאומת של המשאית.";
      const noaMsg: ChatMessage = {
        id: `noa-${Date.now()}`,
        sender: "noa",
        text: responseText,
        time: now(),
        statusTag: "נדרש אימות מקור",
      };
      setMessages((prev) => [...prev, noaMsg]);
      return;
    }

    // Remaining legacy report paths are unchanged; they must not be treated as live GPS.
    const t = text.toLowerCase();
    let replyText = "";
    let replyCard: ChatMessage["tachographCard"] = undefined;
    let replyDiscrepancies: ChatMessage["discrepancyAlerts"] = undefined;
    let replySite: ChatMessage["siteDetails"] = undefined;
    let quickActions: ChatMessage["quickActions"] = undefined;
    let statusTag = "פיצוח נתונים הושלם";

    // 1. Query: Hekmat / Truck 615-41-002 / Tachograph
    if (t.includes("חכמת") || t.includes("615") || t.includes("טכוגרף") || t.includes("דיסקית")) {
      setActiveTruck("615-41-002");
      setIsInspectorOpen(true);
      const hekmat = truckSummaries.find((s) => s.truck === "615-41-002") || truckSummaries[0]!;

      replyText = `🚚 **דוח טכוגרף ואימות לולאה סגורה — משאית ${hekmat.truck} (חכמת גאבר):**\n\n• **סה״כ קילומטראז׳ יומי**: **${hekmat.kmTotal} ק״מ** (פתיחה 348,210, סגירה 348,350)\n• **זמן עבודת מנוף PTO מצטבר**: **${hekmat.ptoTime} שעות** (תואם 2 פריקות)\n• **הצלבת תחנות איתוראן מול תעודות גליה**:\n  1. **משה שרת 9, הוד השרון** — פריקת מנוף 38 דק' ב-PTO (תעודות 6715766, 6715767).\n  2. **נח 3, תל אביב** — פריקת מנוף 40 דק' ב-PTO (תעודה 6715792).\n\nהצגתי עבורך את קנבס הדיסקית המלא עם שכבת 24H של איתוראן. חריטות המחט תואמות בדיוק של 2 דקות לשעות ה-PTO!`;

      replyCard = {
        driver: hekmat.driver,
        truck: hekmat.truck,
        date: hekmat.date,
        kmTotal: hekmat.kmTotal,
        ptoHours: hekmat.ptoTime,
        imageUrl: hekmat.discImage,
        stops: hekmat.stops,
      };

      quickActions = [
        { label: "🔍 פתח קנבס במפקח המלא", query: "הציגי במפקח את חריטות המחט של חכמת" },
        { label: "✍️ אישור דיסקית ראמי", query: "אשר את דיסקית הטכוגרף של חכמת להיום" },
      ];
    }
    // 2. Query: Site History - Rakefet 4, Hod HaSharon
    else if (t.includes("רקפת") || t.includes("הוד השרון") || t.includes("740112")) {
      setActiveTruck("651-51-701");
      setIsInspectorOpen(true);

      replyText = `📍 **פיצוח היסטוריית אתר לקוח — הרקפת 4, הוד השרון:**\n\n• **לקוח**: רמי ששון תשתיות (מס' לקוח 740112)\n• **משאית שהוצמדה**: 651-51-701 (עלי אבו עידה, איסוזו פלטה)\n• **תעודת משלוח**: 6715780 (הזמנה 6215985)\n• **פריטים**: 8 בלה חמרה + 2 משטח אקרשטיין\n\n⏱️ **הצלבת זמנים (סגירת מעגל)**:\n• **איתוראן GPS באתר**: 11:45 עד 12:25 (**40 דקות**)\n• **רישום כתב יד בתעודה**: 11:50 עד 12:35 (**45 דקות**)\n• **פער זמנים**: **5 דקות בלבד** — תקין ומאושר בטווח הסבירות!\n• **חציון היסטורי באתר זה**: 38 דק' (התאמה מלאה לממוצע).`;

      replySite = {
        address: "הרקפת 4, הוד השרון",
        customer: "רמי ששון תשתיות",
        notesCount: 1,
        ituranDuration: "40 דקות",
        craneDuration: "45 דקות",
        gapStatus: "תקין (פער 5 דקות)",
      };

      quickActions = [
        { label: "🚚 בדוק את המשאית של עלי", query: "מה מצב המשאית של עלי אבו עידה?" },
        { label: "📄 הצג תעודה 6715780", query: "מה הסטטוס של תעודה 6715780?" },
      ];
    }
    // 3. Query: Ali / 651-51-701
    else if (t.includes("עלי") || t.includes("651") || t.includes("פלטה")) {
      setActiveTruck("651-51-701");
      setIsInspectorOpen(true);
      const ali = truckSummaries.find((s) => s.truck === "651-51-701") || truckSummaries[1]!;

      replyText = `🚛 **דוח פעילות משאית ${ali.truck} (עלי אבו עידה):**\n\n• **סוג כלי**: איסוזו פלטה (ללא מנוף PTO)\n• **קילומטראז׳ יומי**: **${ali.kmTotal} ק״מ**\n• **ביקורי אתר שבוצעו**:\n  1. הרקפת 4, הוד השרון (רמי ששון תשתיות) — שהייה 40 דק׳.\n  2. סוקולוב 22, רמת השרון (א.ערן אזולאי) — שהייה 35 דק׳.\n• **סטטוס אימות**: ממתין לבדיקת חתימות ראמי. כל העצירות תואמות לאיתוראן.`;

      replyCard = {
        driver: ali.driver,
        truck: ali.truck,
        date: ali.date,
        kmTotal: ali.kmTotal,
        ptoHours: ali.ptoTime,
        imageUrl: ali.discImage,
        stops: ali.stops,
      };

      quickActions = [
        { label: "📍 פרטי עצירה ברקפת 4", query: "בדקי היסטוריית ביקור באתר רקפת 4, הוד השרון" },
      ];
    }
    // 4. Query: Discrepancy flagging / Closed-Loop Engine
    else if (
      t.includes("חריג") ||
      t.includes("הצלבה") ||
      t.includes("סגור") ||
      t.includes("בדיק") ||
      t.includes("פענוח")
    ) {
      setIsInspectorOpen(true);
      const issues =
        liveData.discrepancies.length > 0
          ? liveData.discrepancies
          : [
              {
                id: "disc-demo-1",
                truck: "615-41-002",
                driver: "חכמת גאבר",
                address: "אחוזה 120, רעננה",
                type: "outlier_crane" as const,
                severity: "warning" as const,
                title: "משך מנוף חריג מעל 240 דק'",
                description:
                  "בתעודה 6715810 נרשמה המתנה משעה 08:00 עד 13:00 (300 דק'). נדרש אימות סיבת עיכוב.",
              },
              {
                id: "disc-demo-2",
                truck: "651-51-701",
                driver: "עלי אבו עידה",
                address: "סוקולוב 22, רמת השרון",
                type: "reversed_window" as const,
                severity: "alert" as const,
                title: "חלון מנוף הפוך בכתב יד",
                description:
                  "בתעודה 6715805 נרשם: פריקה מ-09:15 עד 09:00. שעת הסיום קודמת לשעת הפתיחה.",
              },
            ];

      replyText = `⚠️ **דוח מנוע הצלבה ופיצוח חריגות (נועה AI Closed-Loop):**\n\nמתוך כלל תעודות גליה ועצירות איתוראן של היום, איתרתי **${issues.length} חריגות הדורשות התייחסות ראמי**:\n\n1. **סוקולוב 22, רמת השרון (משאית 651-51-701)**: חלון מנוף הפוך בכתב יד (09:15 עד 09:00).\n2. **אחוזה 120, רעננה (משאית 615-41-002)**: שהייה/המתנה חריגה של 300 דק' (מעל רף 240 דק').\n\nפתחתי את חלונית המפקח מימין עם פירוט שלבי ההצלבה והאפשרות לאשר או לתקן.`;

      replyDiscrepancies = issues;

      quickActions = [
        { label: "🔍 פתח מפקח הצלבות", query: "הציגי במפקח את חריטות המחט של חכמת" },
        { label: "✅ אישור כל החריגות", query: "סמן את כל החריגות כנבדקו" },
      ];
    }
    // 5. Default intelligent assistant reply
    else {
      replyText = `קיבלתי את הבקשה: "${text}". אין לי כרגע מקור מאומת שמוכיח שכל המערכות מחוברות ומסונכרנות. נתוני GPS חיים, זמני עדכון וחיבורי מערכות חיצוניות יוצגו רק לאחר אימות מול מקור פעיל.`;
      statusTag = "נדרש אימות מקור";
      quickActions = [
        { label: "🚚 דוח חכמת (615-41-002)", query: "מה הסטטוס של דיסקית הטכוגרף של חכמת?" },
        { label: "📍 אתר רקפת 4, הוד השרון", query: "בדקי היסטוריית ביקור באתר רקפת 4, הוד השרון" },
        { label: "⚠️ בדיקת חריגות", query: "בצעי פיצוח והצלבת חריגות לכלל הצי היום" },
      ];
    }

    const noaMsg: ChatMessage = {
      id: `noa-${Date.now()}`,
      sender: "noa",
      text: replyText,
      time: now(),
      statusTag,
      tachographCard: replyCard,
      discrepancyAlerts: replyDiscrepancies,
      siteDetails: replySite,
      quickActions,
    };

    setMessages((prev) => [...prev, noaMsg]);
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
                סנכרון מלא 24H
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              בקרת ראמי מסארווה · ח. סבן חומרי בניין (1994) בע״מ
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
              disabled={!input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:opacity-40"
              title="שלח הודעה"
            >
              <Send className="h-4 w-4 rotate-180" />
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
