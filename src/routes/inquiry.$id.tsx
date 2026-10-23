import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLiveNotes, submitApproval } from "@/lib/api";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  FileText, 
  Send, 
  Mail, 
  Download, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Crown,
  PenTool,
  MessageSquare
} from "lucide-react";

export const Route = createFileRoute("/inquiry/$id")({
  component: InquiryDetailView,
});

function InquiryDetailView() {
  const { id } = Route.useParams();
  
  // שליפת התעודות החיות מול השרת / הגיליון
  const { data: notes, isLoading } = useQuery({
    queryKey: ["live-notes"],
    queryFn: fetchLiveNotes,
  });

  const note = notes?.find((n) => n.id === id);

  // מצב מענה ראמי
  const [ramiReplyText, setRamiReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground">טוען נתוני תעודה מטאב הבירור...</div>;
  }

  if (!note) {
    return (
      <div className="p-8 text-center space-y-4">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-lg font-bold">תעודה #{id} לא נמצאה בבירור</h2>
        <Link to="/inquiry" className="inline-flex items-center gap-2 text-primary font-bold">
          <ArrowRight className="h-4 w-4" /> חזרה לרשימת הבירורים
        </Link>
      </div>
    );
  }

  // שליחת מענה להראל מראמי
  const handleSendReplyToHarel = async () => {
    if (!ramiReplyText.trim()) {
      toast.error("יש להזין הסבר ומענה מראמי לפני השליחה להראל");
      return;
    }

    setIsSubmitting(true);
    try {
      // עדכון הסטטוס ל-pending_harel_reply ושליחת ההודעה
      await submitApproval(note.id, "rami", ramiReplyText.trim());
      toast.success("המענה של ראמי נשלח בהצלחה להראל מנכ״ל לאישור סופי! 👑", {
        description: "הסטטוס בגיליון ובדשבורד עודכן ל-pending_harel_reply.",
      });
      setRamiReplyText("");
    } catch (err) {
      toast.error("שגיאה בשליחת המענה", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // שליחה למייל (ללינה הנה״ח או גורם רלוונטי)
  const handleSendEmail = () => {
    const subject = encodeURIComponent(`מענה לבירור תעודת משלוח #${note.id} - ${note.customer}`);
    const body = encodeURIComponent(`שלום רב,\n\nלהלן התייחסות ראמי לבירור תעודה #${note.id} עבור הלקוח ${note.customer}:\n\n${ramiReplyText || "ללא הערות נוספות."}\n\nבברכה,\nח. סבן חומרי בניין`);
    window.location.href = `mailto:lina@saban94.co.il?subject=${subject}&body=${body}`;
    toast.success("נפתחה טיוטת מייל ללינה בהנהלת חשבונות");
  };

  // הורדת קובץ / צפייה בסריקה
  const handleDownloadPdf = () => {
    if (note.driveUrl) {
      window.open(note.driveUrl, "_blank");
      toast.success("נפתח קובץ הסריקה מ-Google Drive להורדה");
    } else {
      toast.error("אין קישור קובץ פעיל לתעודה זו");
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* סרגל עליון */}
      <div className="flex items-center justify-between">
        <PageHeader 
          title={`טיפול בבירור: תעודה #${note.id}`} 
          subtitle={`לקוח: ${note.customer} · אתר: ${note.siteAddress || "לא צוינה כתובת"}`} 
        />
        <Link 
          to="/inquiry"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted text-foreground text-xs font-bold hover:bg-muted/80 transition"
        >
          <ArrowRight className="h-4 w-4" />
          <span>חזרה לכל הבירורים</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* עמודה ימנית: תצוגת התעודה והסריקה */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-5 border-border rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-sm">מסמך סרוק ונתוני שטר משלוח</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleDownloadPdf} className="h-8 text-xs gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  <span>הורד קובץ PDF</span>
                </Button>
                <Button size="sm" variant="outline" onClick={handleSendEmail} className="h-8 text-xs gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  <span>שלח למייל (לינה)</span>
                </Button>
              </div>
            </div>

            {/* תצוגת תמונה / PDF מהדרייב */}
            <div className="rounded-xl overflow-hidden border border-border bg-muted/30 min-h-[420px] flex items-center justify-center">
              {note.scanImage || note.driveUrl ? (
                <img 
                  src={note.scanImage || note.driveUrl} 
                  alt={`תעודה ${note.id}`} 
                  className="max-h-[500px] object-contain w-full"
                />
              ) : (
                <div className="text-center p-8 text-muted-foreground space-y-2">
                  <FileText className="mx-auto h-10 w-10 opacity-40" />
                  <p className="text-xs">אין תצוגה מקדימה זמינה לקובץ זה</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* עמודה שמאלית: טופס מענה ראמי להראל */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-5 border-border rounded-2xl shadow-sm space-y-4 bg-card">
            <div className="flex items-center gap-2 border-b pb-3">
              <MessageSquare className="h-5 w-5 text-amber-600" />
              <div>
                <h3 className="font-bold text-sm">מענה והסבר מראמי להראל מנכ״ל</h3>
                <p className="text-[11px] text-muted-foreground">הקלד את ההסבר לתיקון הטעות או פער הפקדונות</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-muted/50 p-3 rounded-xl space-y-1">
                <span className="font-bold text-foreground block">הערות הראל בפסילה:</span>
                <p className="text-muted-foreground">״נמצאה אי-התאמה בכמות בלות פקדון 60002 או חלון מנוף חריג. נדרש הסבר ותיקון לפני חיוב.״</p>
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">הסבר / מענה מקצועי מאת ראמי:</label>
                <textarea 
                  rows={4}
                  placeholder="הקלד כאן את ההסבר המפורט לתיקון הטעות בשטח..."
                  value={ramiReplyText}
                  onChange={(e) => setRamiReplyText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-2">
                <Button 
                  onClick={handleSendReplyToHarel}
                  disabled={isSubmitting || !ramiReplyText.trim()}
                  className="w-full rounded-xl font-bold text-xs h-10 bg-primary text-primary-foreground gap-2 shadow-sm"
                >
                  <Crown className="h-4 w-4 text-amber-300" />
                  <span>{isSubmitting ? "שולח מענה..." : "שלח מענה חזרה להראל לאישור סופי 👑"}</span>
                </Button>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  לחיצה תעדכן את סטטוס התעודה ל-<code className="font-mono">pending_harel_reply</code> ותחזיר אותה לדשבורד של הראל.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}