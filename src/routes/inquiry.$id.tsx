import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  FileText, 
  Send, 
  Download, 
  ArrowRight, 
  Crown,
  MessageSquare,
  ShieldAlert,
  PenTool,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { fetchRamiInquiries, submitApproval } from "@/lib/api";

export const Route = createFileRoute("/inquiry/$id")({
  component: RamiInquiryAdvancedView,
});

function RamiInquiryAdvancedView() {
  const { id } = Route.useParams();
  
  // שליפת נתונים מטאב בירור_ראמי
  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["rami-inquiries"],
    queryFn: fetchRamiInquiries,
  });

  const inquiry = inquiries?.find(
    (n: any) => String(n.docNumber) === String(id) || String(n.rowIndex) === String(id)
  );

  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // מצבי עריכה בקנבס ושכבת סימון (חצים אדומים, מרקר, חתימה)
  const [toolMode, setToolMode] = useState<"marker" | "arrow" | "signature" | "none">("none");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // חיווי חתימה (אוטומטי או ידני)
  const [hasSignature, setHasSignature] = useState(true);

  useEffect(() => {
    // אתחול הקנבס והצגת התעודה/רקע
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#ef4444"; // ברירת מחדל אדום לחריגות
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
  }, [inquiry]);

  // פונקציות ציור וסימון בקנבס
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (toolMode === "none") return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);

    if (toolMode === "marker") {
      ctx.strokeStyle = "rgba(234, 179, 8, 0.4)"; // צהוב מרקר שקוף
      ctx.lineWidth = 18;
    } else if (toolMode === "arrow") {
      ctx.strokeStyle = "#ef4444"; // אדום בולט לחריגה
      ctx.lineWidth = 4;
    } else {
      ctx.strokeStyle = "#16a34a"; // ירוק לחתימה מאושרת
      ctx.lineWidth = 3;
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || toolMode === "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground animate-pulse font-medium">טוען תיק בירור מטאב הגיליון...</div>;
  }

  if (!inquiry) {
    return (
      <div className="p-12 text-center space-y-4 max-w-md mx-auto">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-bold">תעודה #{id} לא נמצאה בבירור ראמי</h2>
        <Link to="/inquiry" className="inline-flex items-center gap-2 text-primary font-bold">
          <ArrowRight className="h-4 w-4" /> חזרה לרשימת הבירורים
        </Link>
      </div>
    );
  }

  const handleSendToHarel = async () => {
    if (!replyText.trim()) {
      toast.error("יש להזין הסבר ומענה מראמי לפני השליחה להראל");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitApproval(String(inquiry.docNumber || id), "rami", replyText);
      toast.success("המענה נשלח בהצלחה להראל מנכ״ל לאישור סופי! 👑", {
        description: "הסטטוס עודכן בגיליון תחת טאב בירור ראמי.",
      });
      setReplyText("");
    } catch (err) {
      toast.error("שגיאה בשליחת המענה לשרת");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* סרגל ניהול עליון */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-card p-4 rounded-2xl border border-border shadow-sm gap-4">
        <PageHeader 
          title={`תיק בירור חריגה: תעודה #${inquiry.docNumber || id}`} 
          subtitle={`לקוח: ${inquiry.customer} | כתובת: ${inquiry.address}`} 
        />
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {inquiry.driveLink && (
            <a 
              href={inquiry.driveLink} 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted text-foreground text-xs font-bold hover:bg-muted/80 transition"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <span>קישור חי לקובץ בדרייב</span>
            </a>
          )}
          <Link 
            to="/inquiry"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-bold hover:bg-secondary/80 transition"
          >
            <ArrowRight className="h-4 w-4" />
            <span>חזרה לבירורים</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* עמודה ימנית: תצוגת מסמך, לינק חי וקנבס סימון חריגות */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-5 border-border rounded-2xl shadow-sm space-y-4 bg-card">
            
            {/* סרגל כלים לקנבס ולסימון חריגות */}
            <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-2">
              <div className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm">ניתוח קנבס וסימון חריגות בשטח</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <Button 
                  size="sm" 
                  variant={toolMode === "marker" ? "default" : "outline"}
                  onClick={() => setToolMode("marker")}
                  className="h-7 text-[11px] gap-1 font-bold"
                >
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span> מרקר חריגה
                </Button>
                <Button 
                  size="sm" 
                  variant={toolMode === "arrow" ? "default" : "outline"}
                  onClick={() => setToolMode("arrow")}
                  className="h-7 text-[11px] gap-1 font-bold"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> חץ אדום
                </Button>
                <Button 
                  size="sm" 
                  variant={toolMode === "signature" ? "default" : "outline"}
                  onClick={() => setToolMode("signature")}
                  className="h-7 text-[11px] gap-1 font-bold"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> חתימה
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={clearCanvas}
                  className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                  title="נקה ציור"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* אזור קנבס אינטראקטיבי מעל תצוגת התעודה */}
            <div className="relative border border-border rounded-xl bg-muted/20 min-h-[460px] flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-2 pointer-events-none opacity-40">
                <FileText className="h-16 w-16 text-muted-foreground" />
                <p className="text-xs font-bold text-muted-foreground">תעודת משלוח #{inquiry.docNumber || id}</p>
                <p className="text-[11px] text-muted-foreground">לחץ ובחר כלי למעלה לסימון חריגות או הוספת חצים על גבי המסמך</p>
              </div>

              {/* קנבס הציור והשכבות */}
              <canvas
                ref={canvasRef}
                width={600}
                height={460}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={`absolute inset-0 z-10 w-full h-full cursor-crosshair ${toolMode === "none" ? "pointer-events-none" : ""}`}
              />

              {/* חיווי חתימת לקוח דינמי */}
              <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 bg-card/90 backdrop-blur border border-border px-3 py-1.5 rounded-xl shadow-sm text-xs">
                {hasSignature ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-bold text-green-700">חתימת לקוח: מאושר ותקין (ירוק)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="font-bold text-amber-700">חתימת לקוח: טרם אומתה</span>
                  </>
                )}
              </div>
            </div>

          </Card>
        </div>

        {/* עמודה שמאלית: צ'אט נועה AI ליד תצוגת התעודה + תיבת הודעות ומענה מראמי */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* צ'אט נועה AI מובנה */}
          <Card className="p-4 border-border rounded-2xl shadow-sm bg-card space-y-3">
            <div className="flex items-center justify-between border-b pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 text-primary rounded-xl">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs">עוזרת AI נועה · תמיכה בבירור</h4>
                  <p className="text-[10px] text-muted-foreground">ניתוח חריגה וכתב יד אוטומטי</p>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">פעילה</span>
            </div>
            
            <div className="bg-muted/30 p-3 rounded-xl text-xs space-y-2 border border-border/60">
              <div className="font-bold text-foreground">💡 ניתוח חריגה שזוהה:</div>
              <p className="text-muted-foreground leading-relaxed">{inquiry.aiAnalysis || inquiry.errorReason || 'אין חריגות חריפות. נדרשת בדיקת ראמי.'}</p>
            </div>
          </Card>

          {/* תיבת הודעות ומענה מודרנית לשליחת תשובות */}
          <Card className="p-5 border-border rounded-2xl shadow-sm space-y-4 bg-card flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <MessageSquare className="h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="font-bold text-sm">תיבת מענה ושרשור להראל</h3>
                  <p className="text-[11px] text-muted-foreground">הזרקת תשובות ועדכון סופי מול המנכ״ל</p>
                </div>
              </div>

              {/* שדה הקלדת מענה */}
              <div className="space-y-1.5">
                <label className="font-bold text-xs text-foreground block">הסבר ותיקון מאת ראמי:</label>
                <textarea 
                  rows={4}
                  placeholder="הקלד את תשובתך או את התיקון שבוצע בעקבות החריגה..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed shadow-inner"
                />
              </div>
            </div>

            {/* כפתור שליחה */}
            <div className="pt-3 border-t mt-3">
              <Button 
                onClick={handleSendToHarel}
                disabled={isSubmitting || !replyText.trim()}
                className="w-full rounded-xl font-bold text-xs h-11 bg-primary text-primary-foreground gap-2 shadow-md hover:shadow-lg transition-all"
              >
                <Crown className="h-4 w-4 text-amber-300" />
                <span>{isSubmitting ? "שולח מענה..." : "שלח מענה להראל מנכ״ל לאישור סופי 👑"}</span>
              </Button>
            </div>
          </Card>

        </div>

      </div>
    </div>
  );
}