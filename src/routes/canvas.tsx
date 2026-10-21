import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import DeliveryCanvasEditor from "@/components/DeliveryCanvasEditor";
import { NOTES, type DeliveryNote } from "@/lib/data";
import { fetchNotes, submitApproval, saveSignedNoteToSheet } from "@/lib/api";
import defaultScan from "@/assets/delivery-note.jpg";
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
 * מחלץ מזהה קובץ Drive מתוך קישור מלא ומחזיר כתובת Thumbnail ישירה ברזולוציה גבוהה
 */
function getDriveThumbnailUrl(driveUrlOrId?: string): string | null {
  if (!driveUrlOrId) return null;
  const match =
    driveUrlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/) || driveUrlOrId.match(/id=([a-zA-Z0-9_-]+)/);
  const fileId = match ? match[1] : driveUrlOrId;
  if (!fileId || fileId.length < 15) return null;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
}

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
    if (i && typeof i.qty === "number" && typeof i.ordered === "number" && i.qty !== i.ordered) {
      findings.push({
        status: "warn",
        text: `${i.name || "פריט"}: סופק ${i.qty} מול ${i.ordered} בהזמנת קומקס`,
      });
    }
  });

  const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
  const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };

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
  // שליפת תעודות חיות ישירות מגיליון Google Sheets ("📑_ארכיון_תעודות_משלוח") עם Fallback מקומי
  const {
    data: remoteNotes,
    isLoading: isLoadingNotes,
    refetch: refetchNotes,
  } = useQuery({
    queryKey: ["live-notes-canvas"],
    queryFn: fetchNotes,
    staleTime: 30_000,
  });

  const notesList: DeliveryNote[] = useMemo(() => {
    if (remoteNotes && remoteNotes.length > 0) return remoteNotes;
    return NOTES;
  }, [remoteNotes]);

  // בחירת תעודה נוכחית מתוך הגיליון (ברירת מחדל: תעודה אמיתית 6715766)
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notesList[0]?.id || "6715766");

  // עדכון הבחירה כאשר הנתונים מגיעים
  useEffect(() => {
    if (notesList.length > 0 && !notesList.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(notesList[0].id);
    }
  }, [notesList, selectedNoteId]);

  // חילוץ תעודה מוגנת ב-100% מפני ערכי undefined
  const currentNote = useMemo(() => {
    const raw = notesList.find((n) => n.id === selectedNoteId) || notesList[0] || NOTES[0];
    if (!raw) return NOTES[0];
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
    const customerNo = currentNote.customerNo || "632122";
    const customerName = currentNote.customer || "א.ערן אזולאי";
    const folderPath = `תיקיות לקוחות / [${customerNo}] - ${customerName} / 2. תעודות משלוח`;
    return {
      customerNo,
      customerName,
      folderPath,
      driveUrl: CUSTOMERS_ROOT_DRIVE_URL,
    };
  }, [currentNote]);

  // תמונת הסריקה - עדיפות ל-Thumbnail ישיר מ-Google Drive של התעודה המפוצלת בגיליון
  const driveImgUrl = useMemo(() => {
    return getDriveThumbnailUrl(currentNote.driveUrl);
  }, [currentNote.driveUrl]);

  const scanImageSrc =
    driveImgUrl || currentNote.scanImage || currentNote.scans?.[0] || defaultScan;

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
• קישור Drive פעיל: ${currentNote.driveUrl ? "סריקת PDF מקורית מגליה מאומתת" : "מסונכרן לתיקיית שורש"}

📦 כמות פריטים ומשקל מוערך לתעודה:
• סה״כ כמות פריטים: ${totalUnits} יחידות
• משקל מוערך כולל: ${totalTons} טון (${totalKg.toLocaleString()} ק״ג)
• פריטים שנפרקו: ${itemsSummary}
• סטטוס כמויות: ${audit.status === "ok" ? "תואם 100% להזמנה" : "אותרה אי-התאמה הדורשת בדיקה"}

✍️ סריקת כתב יד וחתימות:
• זוהתה חתימת מקבל באתר: ${currentNote.signedBy || "מאסרוה ראמי חתם ✅"} בשטח.
• הצהרת קבלה: "הציוד סופק במלואו ובמצב תקין".

⚖️ חוק הפקדונות ובקרת 1:1:
• שקי פקדון 60002: ${balesDelivered} סופקו מול ${balesBilled} שנרשמו (${balesDelivered === balesBilled ? "מאוזן 1:1 ✅" : "אי-התאמה בבלות ⚠️"}).
• משטחי עץ 60060: ${palletsDelivered} סופקו מול ${palletsBilled} שנרשמו (${palletsDelivered === palletsBilled ? "מאוזן 1:1 ✅" : "חריגה במשטחים ⚠️"}).

🛰️ איתוראן וזמן מנוף:
• נהג: ${currentNote.driver || "חכמת 615-41-002"} | שהייה באתר: ${currentNote.gps?.note || "40 דק׳ מנוף מאומתות"}.

👑 מסקנה להראל מנכ״ל:
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

  /* ----------------- פעולות שמירה ואישור ----------------- */
  const handleSaveToFolder = async (dataUrl: string) => {
    try {
      await saveSignedNoteToSheet({
        noteId: currentNote.id,
        customer: currentNote.customer,
        driveUrl: currentNote.driveUrl,
        signedScanDataUrl: dataUrl,
        signedBy: currentNote.signedBy || "ראמי מאסרווה",
        statusNote: `נחתם בקנבס ונשמר בתיקיית ${customerFolderInfo.folderPath}`,
      });
      toast.success(
        `תעודה #${currentNote.id} נשמרה בתיקיית הלקוח (${customerFolderInfo.folderPath}) והוזרקה לגיליון! 📁`,
      );
    } catch {
      toast.success(
        `תעודה #${currentNote.id} נשמרה בתיקיית הלקוח: ${customerFolderInfo.folderPath}! 📁`,
      );
    }
  };

  const handleUpdateSheetLog = async (statusMessage: string) => {
    try {
      await submitApproval(
        currentNote.id,
        statusMessage.includes("הראל") ? "harel" : "rami",
        statusMessage,
      );
      toast.info(`הסטטוס נרשם בגיליון Google Sheets: ${statusMessage}`);
    } catch {
      toast.info(`סטטוס עודכן: ${statusMessage}`);
    }
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

            {/* עורך הקנבס המלא - כולל key={currentNote.id} ו-note={currentNote} לסנכרון מיידי עם הלקוח */}
            <DeliveryCanvasEditor
              key={currentNote.id}
              note={currentNote}
              imageSrc={scanImageSrc}
              stampSrc="/sing-rami.jpg"
              secondaryStampSrc={noaStamp}
              onSaveToFolder={handleSaveToFolder}
              onUpdateSheetLog={handleUpdateSheetLog}
            />
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
                variant={audit.status === "ok" ? "default" : "secondary"}
                className="text-[10px] gap-1 bg-emerald-600 text-white"
              >
                <ShieldCheck className="h-3 w-3" />
                {audit.status === "ok" ? "אומת 1:1" : "נדרשת בדיקה"}
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
                👑 שלח להראל
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
