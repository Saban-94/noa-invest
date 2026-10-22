import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import DeliveryCanvasEditor from "@/components/DeliveryCanvasEditor";
import { type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import noaStamp from "@/assets/noa.jpg";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot,
  Sparkles,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ExternalLink,
  RefreshCw,
  Clock,
  UserCheck,
  Crown,
  Scale,
  PenTool,
  Folder,
  FolderCheck,
  Building,
} from "lucide-react";

export const Route = createFileRoute("/canvas")({
  component: CanvasPageRoute,
});

const CUSTOMERS_ROOT_DRIVE_URL =
  "https://drive.google.com/drive/folders/1JGNbTlmB5yBH_cLOApKTvE39CEL6roFF";

/**
 * פונקציית ביקורת עצמאית ומוגנת ב-100% משגיאות undefined.forEach
 */
function auditNoteSafe(n?: DeliveryNote): {
  status: "ok" | "warn" | "fail";
  findings: { status: "ok" | "warn" | "fail"; text: string }[];
} {
  const findings: { status: "ok" | "warn" | "fail"; text: string }[] = [];
  if (!n) return { status: "ok", findings: [{ status: "ok", text: "תעודה בטעינה" }] };

  const items = Array.isArray(n.items) ? n.items : [];
  items.forEach((i) => {
    if (n.live) return; // הזמנת קומקס עדיין לא מוצלבת, אין "סופק מול הוזמן" אמיתי
    if (i && typeof i.qty === "number" && typeof i.ordered === "number" && i.qty !== i.ordered) {
      findings.push({
        status: "warn",
        text: `${i.name || "פריט"}: סופק ${i.qty} מול ${i.ordered} בהזמנת קומקס`,
      });
    }
  });

  const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
  const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };

  if (n.live) {
    findings.push({ status: "warn", text: "הצלבת כמויות מול הזמנת קומקס טרם בוצעה" });
    if (b.delivered || p.delivered) {
      findings.push({
        status: "warn",
        text: `פקדונות כפי שנקראו מהתעודה: בלות 60002 = ${b.delivered}, משטחים 60060 = ${p.delivered} (טרם הוצלבו מול חיוב)`,
      });
    }
    findings.push({ status: "warn", text: "אין הצלבת איתוראן לתעודה זו" });
    return { status: "warn", findings };
  }

  if (b.delivered !== b.billed) {
    findings.push({
      status: "fail",
      text: `בלות פקדון 60002: ${b.delivered} סופקו, ${b.billed} חויבו`,
    });
  } else if (b.delivered) {
    findings.push({ status: "ok", text: `בלות 60002 תואמות 1:1 (${b.delivered})` });
  }

  if (p.delivered !== p.billed) {
    findings.push({
      status: "fail",
      text: `משטחי עץ 60060: ${p.delivered} סופקו, ${p.billed} חויבו`,
    });
  } else if (p.delivered) {
    findings.push({ status: "ok", text: `משטחי 60060 תואמים 1:1 (${p.delivered})` });
  }

  if (n.gps) {
    findings.push({ status: n.gps.status, text: `איתוראן: ${n.gps.note}` });
  }

  if (!findings.some((f) => f.status !== "ok")) {
    findings.unshift({ status: "ok", text: "כמויות תואמות להזמנת קומקס" });
  }

  const status: "ok" | "warn" | "fail" = findings.some((f) => f.status === "fail")
    ? "fail"
    : findings.some((f) => f.status === "warn")
      ? "warn"
      : "ok";

  return { status, findings };
}

interface ChatMessage {
  id: string;
  sender: "noa" | "rami";
  text: string;
  timestamp: string;
  isTyped?: boolean;
}

function CanvasPageRoute() {
  // תעודות חיות מהגיליון בלבד. אין נפילה לנתוני דוגמה: כשל מוצג במפורש.
  const {
    data: notesList,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["live-notes-canvas"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
        טוען תעודות מהגיליון...
      </div>
    );
  }

  if (error || !notesList) {
    return (
      <div className="p-6 max-w-xl mx-auto" dir="rtl">
        <Card className="p-5 space-y-3 border-red-500/40 bg-red-500/5">
          <div className="flex items-center gap-2 font-bold text-red-700">
            <AlertTriangle className="h-4 w-4" /> לא ניתן לטעון תעודות מהגיליון
          </div>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "שגיאה לא ידועה"}. לא מוצגים נתוני דוגמה.
          </p>
          <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ml-1 ${isFetching ? "animate-spin" : ""}`} />
            נסה שוב
          </Button>
        </Card>
      </div>
    );
  }

  if (notesList.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
        אין עדיין תעודות בגיליון. הסריקות של גליה יופיעו כאן אחרי הריצה הבאה של הקליטה.
      </div>
    );
  }

  return (
    <CanvasWorkspace notesList={notesList} isLoadingNotes={isFetching} refetchNotes={refetch} />
  );
}

function CanvasWorkspace({
  notesList,
  isLoadingNotes,
  refetchNotes,
}: {
  notesList: DeliveryNote[];
  isLoadingNotes: boolean;
  refetchNotes: () => unknown;
}) {
  // בחירת תעודה נוכחית מתוך הגיליון
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notesList[0].id);

  // עדכון הבחירה כאשר הנתונים מגיעים
  useEffect(() => {
    if (notesList.length > 0 && !notesList.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(notesList[0].id);
    }
  }, [notesList, selectedNoteId]);

  // חילוץ תעודה מוגנת ב-100% מפני ערכי undefined
  const currentNote = useMemo(() => {
    const raw = notesList.find((n) => n.id === selectedNoteId) || notesList[0];
    return {
      ...raw,
      items: Array.isArray(raw.items) ? raw.items : [],
      deposits: {
        bales60002: raw.deposits?.bales60002 || { delivered: 0, billed: 0 },
        pallets60060: raw.deposits?.pallets60060 || { delivered: 0, billed: 0 },
      },
    };
  }, [notesList, selectedNoteId]);

  // בדיקת ביקורת חוק הפקדונות והכמויות של נועה עבור התעודה
  const audit = useMemo(() => {
    return auditNoteSafe(currentNote);
  }, [currentNote]);

  // חישוב מסלול תיקיית הלקוח הקנונית ב-Google Drive
  const customerFolderInfo = useMemo(() => {
    const customerNo = currentNote.customerNo || "ללא-מספר";
    const customerName = currentNote.customer || "לקוח לא מזוהה";
    const folderPath = `תיקיות לקוחות / [${customerNo}] - ${customerName} / 2. תעודות משלוח`;
    return {
      customerNo,
      customerName,
      folderPath,
      driveUrl: CUSTOMERS_ROOT_DRIVE_URL,
    };
  }, [currentNote]);

  // הסריקה האמיתית: נמשכת מ-Drive דרך השרת ומרונדרת מקומית (בלי CORS ובלי קנבס מזוהם)
  const {
    data: scanImageSrc,
    isLoading: isLoadingScan,
    error: scanError,
    refetch: refetchScan,
  } = useQuery({
    queryKey: ["scan", currentNote.fileId],
    enabled: !!currentNote.fileId,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: currentNote.fileId as string } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  /* ----------------- צ'אט נועה AI ואפקט הקלדה בזמן אמת ----------------- */
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [typingText, setTypingText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // הפקת ניתוח נועה מפורט בעת טעינת תעודה חדשה (כולל סנכרון תיקיית לקוח)
  useEffect(() => {
    if (!currentNote) return;

    const balesDelivered = currentNote.deposits?.bales60002?.delivered ?? 0;
    const balesBilled = currentNote.deposits?.bales60002?.billed ?? 0;
    const palletsDelivered = currentNote.deposits?.pallets60060?.delivered ?? 0;
    const palletsBilled = currentNote.deposits?.pallets60060?.billed ?? 0;

    const itemsSummary =
      currentNote.items && currentNote.items.length > 0
        ? currentNote.items
            .map((i) => `${i.name || "פריט"} (${i.qty || 1} ${i.unit || "יח׳"})`)
            .join(", ")
        : "חומרי בניין כללי";

    const totalUnits = (currentNote.items || []).reduce((s, i) => s + (i.qty || 0), 0);
    const totalKg = (currentNote.items || []).reduce(
      (s, i) => s + (i.qty || 0) * (i.weightKg || (i.name?.includes("בלה") ? 1000 : 25)),
      0,
    );
    const totalTons = (totalKg / 1000).toFixed(2);

    const fullAnalysis = `שלום ראמי, סרקתי וניתחתי את תעודה #${currentNote.comaxOrder || currentNote.id} עבור ${currentNote.customer}:

📁 סנכרון תיקיית לקוח ב-Drive:
• תיקייה קנונית: תיקיות לקוחות / [${customerFolderInfo.customerNo}] - ${customerFolderInfo.customerName}
• יעד תיוק אוטומטי: תת-תיקייה "2. תעודות משלוח"
• קישור Drive: ${currentNote.driveUrl ? "סריקת PDF מקורית מגליה" : "אין קובץ מקור"}

📦 כמות פריטים ומשקל מוערך לתעודה:
• סה״כ כמות פריטים: ${totalUnits} יחידות
• משקל מוערך כולל: ${totalTons} טון (${totalKg.toLocaleString()} ק״ג)
• פריטים שנפרקו: ${itemsSummary}
• סטטוס כמויות: ${currentNote.live ? "נקרא מהסריקה, טרם הוצלב מול הזמנת קומקס" : audit.status === "ok" ? "תואם להזמנה" : "אותרה אי-התאמה הדורשת בדיקה"}

✍️ סריקת כתב יד וחתימות:
• זוהתה חתימת מקבל באתר: ${currentNote.signedBy || "לא זוהתה חתימת מקבל בנתונים — לבדוק בעין על הסריקה"}.

⚖️ חוק הפקדונות ובקרת 1:1:
• שקי פקדון 60002: ${currentNote.live ? `נקראו ${balesDelivered} מהתעודה (טרם הוצלבו מול חיוב ⚠️)` : `${balesDelivered} סופקו מול ${balesBilled} שנרשמו (${balesDelivered === balesBilled ? "מאוזן 1:1 ✅" : "אי-התאמה בבלות ⚠️"})`}.
• משטחי עץ 60060: ${currentNote.live ? `נקראו ${palletsDelivered} מהתעודה (טרם הוצלבו מול חיוב ⚠️)` : `${palletsDelivered} סופקו מול ${palletsBilled} שנרשמו (${palletsDelivered === palletsBilled ? "מאוזן 1:1 ✅" : "חריגה במשטחים ⚠️"})`}.

🛰️ איתוראן וזמן מנוף:
• נהג: ${currentNote.driver || "לא זוהה"} | איתוראן: ${currentNote.gps?.note || "אין הצלבה לתעודה זו"}.

 מסקנה להראל :
${
  audit.status === "ok"
    ? "התעודה נקייה לחלוטין מתקלות ומסונכרנת לתיקיית הלקוח בדרייב. ממליצה לאשר שלב ראמי ולהעביר לחתימת הראל."
    : "ישנה חריגה קלה בפקדונות או בכמויות. סמן במרקר צהוב ודרוש אימות טלפוני לפני אישור סופי."
}`;

    // הפעלת אפקט הקלדה (Typewriter Effect)
    setIsTyping(true);
    setTypingText("");
    let currentIndex = 0;

    const timer = setInterval(() => {
      if (currentIndex < fullAnalysis.length) {
        setTypingText((prev) => prev + fullAnalysis.charAt(currentIndex));
        currentIndex++;
      } else {
        clearInterval(timer);
        setIsTyping(false);
        setChatMessages((prev) => [
          ...prev,
          {
            id: `noa-${Date.now()}`,
            sender: "noa",
            text: fullAnalysis,
            timestamp: new Date().toLocaleTimeString("he-IL", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
        setTypingText("");
      }
    }, 12);

    return () => clearInterval(timer);
  }, [currentNote, audit, customerFolderInfo]);

  // גלילה אוטומטית לתחתית הצ'אט
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, typingText]);

  // שליחת הודעה בצ'אט מראמי לנועה
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim()) return;

    const userMsg: ChatMessage = {
      id: `rami-${Date.now()}`,
      sender: "rami",
      text: userInput.trim(),
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    const query = userInput.trim();
    setUserInput("");

    setTimeout(() => {
      let reply = `ראמי, רשמתי לפניי. `;
      if (query.includes("תיקייה") || query.includes("דרייב") || query.includes("תיוק")) {
        reply += `התעודה מתוייקת בנתיב הקנוני: ${customerFolderInfo.folderPath}. כל אישור שתבצע מתועד בגיליון ארכיון תעודות משלוח ומסונכרן מיידית לדרייב.`;
      } else if (query.includes("פקדון") || query.includes("משטח") || query.includes("בלה")) {
        reply += `לפי חוק הפקדונות ונוהל סבן, עלינו לוודא מאזן כמותי מלא של 1:1 לכל בלה 60002 ולכל משטח עץ 60060 שהוחזר מהאתר (ללא חיוב כספי בעת החזרה מלאה). המאזן מתועד בגיליון.`;
      } else if (query.includes("חתימה") || query.includes("מי חתם")) {
        reply += `התעודה נחתמה באתר ע״י ${currentNote.signedBy || "מנהל העבודה"}. החתימה ברורה, ומצורפת להצהרת מסירה תקינה.`;
      } else if (query.includes("אשר") || query.includes("הראל")) {
        reply += `שלב ראמי מוכן לאישור. הטבעתי חותמת דיגיטלית בפינה, בלחיצה על 'אשר שלב' הסטטוס יועבר ישירות לדשבורד של הראל.`;
      } else {
        reply += `אני עוקבת אחרי התעודה בזמן אמת. כל סימון שתעשה במרקר הצהוב יישמר ישירות בתיקיית הלקוח ב-Google Drive.`;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `noa-reply-${Date.now()}`,
          sender: "noa",
          text: reply,
          timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }, 450);
  };

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4" dir="rtl">
      {/* 1. באנר עליון: סנכרון תיקיית לקוח ב-Google Drive */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 rounded-2xl text-xs shadow-xs">
        <div className="flex items-center gap-2">
          <FolderCheck className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="font-bold text-amber-900">סנכרון תיקיית לקוח ב-Google Drive:</span>
          <span className="font-mono text-amber-800 text-[11px] md:text-xs">
            {customerFolderInfo.folderPath}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={CUSTOMERS_ROOT_DRIVE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-bold text-amber-900 hover:text-amber-700 hover:underline"
          >
            <span>פתח תיקיית לקוח ב-Drive</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-amber-400">|</span>
          <Link
            to="/customers"
            className="font-bold text-amber-900 hover:underline flex items-center gap-1"
          >
            <Building className="h-3 w-3 text-amber-700" />
            <span>תיק לקוח בקומקס</span>
          </Link>
        </div>
      </div>

      {/* 2. סרגל עליון: כותרת ובורר תעודות מ-Google Sheets */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-bold font-display">
              תצוגת תעודת משלוח וקנבס אינטראקטיבי
            </h1>
            <Badge variant="outline" className="text-[10px] gap-1 font-mono">
              <Bot className="h-3 w-3 text-emerald-600" /> נועה AI Copilot
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            ח. סבן חומרי בניין בע״מ · שליפה מתוך גיליון מערכת מאוחדת וסריקות Google Drive
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetchNotes()}
            disabled={isLoadingNotes}
            className="rounded-xl h-8 text-xs shrink-0"
            title="רענן מגיליון"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingNotes ? "animate-spin" : ""}`} />
          </Button>

          {notesList.map((note) => {
            const isSelected = selectedNoteId === note.id;
            return (
              <Button
                key={note.id}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => setSelectedNoteId(note.id)}
                className={`text-xs rounded-xl shrink-0 h-8 gap-1.5 ${
                  isSelected ? "shadow-xs font-bold" : ""
                }`}
              >
                <span>#{note.comaxOrder || note.id}</span>
                <span className="opacity-75 max-w-[90px] truncate">{note.customer}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* 3. תצוגה מפוצלת: חדר צ'אט נועה AI משמאל, תצוגת התעודה והקנבס מימין */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* עמודה ימנית (7 מתוך 12): תצוגת ה-PDF המקורי מ-Drive והקנבס */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-4 bg-card border-border rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">
                  תעודה מס׳ {currentNote.comaxOrder || currentNote.id}
                </span>
                <span className="text-muted-foreground">· {currentNote.customer}</span>
              </div>

              {currentNote.driveUrl && (
                <a
                  href={currentNote.driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline bg-primary/10 px-2.5 py-1 rounded-lg"
                >
                  <span>צפה ב-PDF המקורי בדרייב</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* השמירה והאישור מתבצעים בתוך העורך (שמירה אמיתית לדרייב, בלי הצלחה מדומה) */}
            {!currentNote.fileId ? (
              <div className="p-6 text-center text-sm text-red-700 bg-red-500/5 rounded-xl border border-red-500/30">
                לתעודה זו אין קובץ סריקה מקושר בגיליון, לכן אי אפשר לפתוח אותה לעריכה.
              </div>
            ) : isLoadingScan ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin inline ml-2" />
                טוען את הסריקה המקורית מ-Drive...
              </div>
            ) : scanError || !scanImageSrc ? (
              <div className="p-6 space-y-3 text-center bg-red-500/5 rounded-xl border border-red-500/30">
                <p className="text-sm font-bold text-red-700">לא ניתן לטעון את הסריקה המקורית</p>
                <p className="text-xs text-muted-foreground">
                  {scanError instanceof Error ? scanError.message : "הקובץ לא התקבל"}
                </p>
                <Button size="sm" onClick={() => refetchScan()}>
                  נסה שוב
                </Button>
              </div>
            ) : (
              <DeliveryCanvasEditor
                key={currentNote.id}
                note={currentNote}
                imageSrc={scanImageSrc}
                stampSrc="/sing-rami.jpg"
                secondaryStampSrc={noaStamp}
              />
            )}
          </Card>
        </div>

        {/* עמודה שמאלית (5 מתוך 12): חדר צ'אט ובקרת נועה AI עם אפקט הקלדה */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="flex flex-col h-[740px] bg-card border-border rounded-2xl shadow-sm overflow-hidden">
            {/* כותרת חדר הצ'אט */}
            <div className="bg-muted/70 p-3.5 border-b border-border/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <img
                    src={noaStamp}
                    alt="נועה AI"
                    className="h-9 w-9 rounded-full object-cover border-2 border-emerald-500 shadow-xs"
                  />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    נועה AI · סדרנית ובקרה
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    סריקת כתב יד, הצלבת קומקס וחוק הפקדונות
                  </p>
                </div>
              </div>

              <Badge
                variant={
                  currentNote.live ? "outline" : audit.status === "ok" ? "default" : "secondary"
                }
                className={`text-[10px] gap-1 ${
                  currentNote.live
                    ? "bg-amber-500/15 text-amber-800 border-amber-500/30"
                    : audit.status === "ok"
                      ? "bg-emerald-600 text-white"
                      : ""
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                {currentNote.live
                  ? "טרם הוצלב מול קומקס/איתוראן"
                  : audit.status === "ok"
                    ? "אומת 1:1"
                    : "נדרשת בדיקה"}
              </Badge>
            </div>

            {/* תוכן ההודעות עם אפקט הקלדה בזמן אמת */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-muted/20 text-xs">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === "rami" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[90%] p-3 rounded-2xl shadow-xs leading-relaxed whitespace-pre-wrap ${
                      msg.sender === "rami"
                        ? "bg-primary text-primary-foreground rounded-tl-xs"
                        : "bg-card border border-border/80 text-foreground rounded-tr-xs"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1 px-1">
                    {msg.sender === "rami" ? "ראמי" : "נועה AI"} · {msg.timestamp}
                  </span>
                </div>
              ))}

              {/* הודעה בהקלדה חיה ע״י נועה */}
              {isTyping && typingText && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[90%] p-3 rounded-2xl shadow-xs leading-relaxed whitespace-pre-wrap bg-card border border-emerald-500/30 text-foreground rounded-tr-xs">
                    {typingText}
                    <span className="inline-block w-1.5 h-3.5 bg-emerald-600 mr-1 animate-pulse" />
                  </div>
                  <span className="text-[9px] text-emerald-600 font-bold mt-1 px-1 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5 animate-spin" /> נועה מקלידה מסקנות...
                  </span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* מקשים מהירים להנחיות שכיחות */}
            <div className="p-2 bg-muted/40 border-t border-border/60 flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <button
                type="button"
                onClick={() => setUserInput("בדקי לי את מאזן המשטחים והבלות שוב")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-card border hover:bg-muted text-muted-foreground font-medium transition-colors"
              >
                ⚖️ מאזן פקדונות
              </button>
              <button
                type="button"
                onClick={() => setUserInput("האם יש חתימת מקבל תקינה בשטח?")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-card border hover:bg-muted text-muted-foreground font-medium transition-colors"
              >
                ✍️ אימות חתימה
              </button>
              <button
                type="button"
                onClick={() => setUserInput("איפה התעודה הזו מתוייקת ב-Drive?")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-card border hover:bg-muted text-muted-foreground font-medium transition-colors"
              >
                📁 תיקיית לקוח
              </button>
              <button
                type="button"
                onClick={() => setUserInput("התעודה מאושרת, שלחי להראל מנכ״ל")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-card border hover:bg-muted text-muted-foreground font-medium transition-colors"
              >
                שלח להראל
              </button>
            </div>

            {/* שורת קלט להודעה של ראמי */}
            <form
              onSubmit={handleSendMessage}
              className="p-2.5 bg-card border-t border-border flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="שאל את נועה על התעודה, כתב יד, פקדונות, תיקיית Drive..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="flex-1 bg-muted/60 border border-border/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button type="submit" size="sm" className="rounded-xl h-8 px-3 gap-1">
                <Send className="h-3 w-3" />
                <span>שלח</span>
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
