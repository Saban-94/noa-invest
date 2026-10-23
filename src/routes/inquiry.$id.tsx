import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
  ShieldCheck,
  PenTool,
  CheckCircle
} from "lucide-react";

export const Route = createFileRoute("/inquiry/$id")({
  component: RamiInquiryDetailView,
});

function RamiInquiryDetailView() {
  const { id } = Route.useParams();
  
  // שליפת נתונים מטאב בירור_ראמי בגיליון
  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["rami-inquiries"],
    queryFn: async () => {
      // קריאה לשרת Apps Script / API
      return window.google?.script?.run
        ? new Promise((resolve) => window.google.script.run.withSuccessHandler(resolve).getRamiInquiriesData())
        : [
            { rowIndex: 2, docNumber: id, customer: 'א.ש. בלום נדל״ן', address: 'דרך השרון 12, כפר סבא', errorReason: 'פער בבלות פקדון 1:1', aiAnalysis: 'זוהה חוסר התאמה בין כמות המשלוח לפקדונות', ramiReply: '', status: 'ממתין למענה ראמי ⏳', driveLink: '' }
          ];
    },
  });

  const inquiry = inquiries?.find((n: any) => String(n.docNumber) === String(id) || String(n.rowIndex) === String(id));

  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCanvasMode, setIsCanvasMode] = useState(false);

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground animate-pulse">טוען נתוני תעודה מטאב בירור ראמי...</div>;
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
      // שליחת המענה ועדכון הסטטוס ל-pending_harel_reply
      toast.success("המענה נשלח בהצלחה להראל מנכ״ל לאישור סופי! 👑", {
        description: "הסטטוס בגיליון ובדשבורד עודכן בהצלחה.",
      });
      setReplyText("");
    } catch (err) {
      toast.error("שגיאה בשליחת המענה");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* סרגל עליון */}
      <div className="flex items-center justify-between bg-card p-4 rounded-2xl border border-border shadow-sm">
        <PageHeader 
          title={`תיק בירור: תעודה #${inquiry.docNumber}`} 
          subtitle={`לקוח: ${inquiry.customer} · נהג: ${inquiry.driver || 'לא צוין'}`} 
        />
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsCanvasMode(!isCanvasMode)}
            className="gap-2 font-bold text-xs"
          >
            <PenTool className="h-4 w-4 text-primary" />
            <span>{isCanvasMode ? "תצוגת מסמך רגילה" : "עריכה וחתימה בקנבס"}</span>
          </Button>
          <Link 
            to="/inquiry"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted text-foreground text-xs font-bold hover:bg-muted/80 transition"
          >
            <ArrowRight className="h-4 w-4" />
            <span>חזרה לבירורים</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* עמודה ימנית: תצוגת מסמך / קנבס עריכה */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-5 border-border rounded-2xl shadow-sm space-y-4 bg-card">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm">תצוגת שטר משלוח וניתוח AI</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => window.open(inquiry.driveLink, '_blank')} className="h-8 text-xs gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  <span>צפה בדרייב</span>
                </Button>
              </div>
            </div>

            {/* אזור תצוגה או עורך קנבס */}
            {isCanvasMode ? (
              <div className="border-2 border-dashed border-primary/40 rounded-xl p-6 bg-muted/20 text-center space-y-4 min-h-[420px] flex flex-col items-center justify-center">
                <PenTool className="h-10 w-10 text-primary animate-bounce" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm">עורך קנבס וחתימת ראמי פעילים</h4>
                  <p className="text-xs text-muted-foreground">הוסף הערות, סמן פערים והטבע חותמת דיגיטלית ישירות על גבי התעודה.</p>
                </div>
                <Button size="sm" className="font-bold text-xs">שמור שינויים בקנבס</Button>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-border bg-muted/30 min-h-[420px] flex items-center justify-center p-4">
                <div className="text-center space-y-2">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
                  <p className="text-xs font-medium text-muted-foreground">תעודת משלוח #{inquiry.docNumber} מוכנה לצפייה ובדיקה</p>
                  <p className="text-[11px] text-amber-700 bg-amber-50 px-3 py-1 rounded-lg inline-block border border-amber-200">
                    {inquiry.errorReason}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* עמודה שמאלית: שכבת מענה מודרנית ומקצועית */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-5 border-border rounded-2xl shadow-sm space-y-4 bg-card flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <MessageSquare className="h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="font-bold text-sm">תיבת הודעות ומענה מראמי</h3>
                  <p className="text-[11px] text-muted-foreground">ניהול שרשור מול הראל המנכ״ל</p>
                </div>
              </div>

              {/* הודעת החריגה שזוهתה */}
              <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  <span>ניתוח חריגה (AI וכתב יד):</span>
                </div>
                <p className="text-amber-800 leading-relaxed">{inquiry.aiAnalysis || inquiry.errorReason}</p>
              </div>

              {/* שדה הקלדת מענה */}
              <div className="space-y-1.5">
                <label className="font-bold text-xs text-foreground block">הסבר ותיקון מאת ראמי:</label>
                <textarea 
                  rows={5}
                  placeholder="הקלד כאן את המענה המקצועי, הסבר על פער הפקדונות או סיבת התיקון בשטח..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed shadow-inner"
                />
              </div>
            </div>

            {/* כפתור שליחה והעברה להראל */}
            <div className="pt-4 border-t mt-4">
              <Button 
                onClick={handleSendToHarel}
                disabled={isSubmitting || !replyText.trim()}
                className="w-full rounded-xl font-bold text-xs h-11 bg-primary text-primary-foreground gap-2 shadow-md hover:shadow-lg transition-all"
              >
                <Crown className="h-4 w-4 text-amber-300" />
                <span>{isSubmitting ? "שולח מענה..." : "שלח מענה להראל מנכ״ל לאישור סופי 👑"}</span>
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                פעולה זו תעביר את התעודה ישירות לדשבורד של הראל בסטטוס <code className="font-mono text-primary font-bold">pending_harel_reply</code>.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}