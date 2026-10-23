import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchRamiInquiries, type RamiInquiryItem } from "@/lib/api";
import { PageHeader } from "@/components/AppShell";
import { AlertCircle, FileText, Search, ExternalLink, ShieldAlert } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/inquiry")({
  component: InquiryListPage,
});

function InquiryListPage() {
  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["rami-inquiries-list"],
    queryFn: fetchRamiInquiries,
  });

  const [searchTerm, setSearchTerm] = useState("");

  const list = inquiries || [];
  
  const filteredInquiries = list.filter((n) => 
    String(n.docNumber || "").includes(searchTerm) || 
    String(n.customer || "").includes(searchTerm) ||
    String(n.errorReason || "").includes(searchTerm)
  );

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto" dir="rtl">
      <PageHeader title="בירור תעודות (ראמי)" subtitle="מרכז בקרת תעודות וחריגים מול הראל מנכ״ל" />
      
      {/* Search Bar */}
      <div className="flex gap-2 bg-card p-2.5 rounded-2xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            placeholder="חיפוש לפי מספר תעודה, שם לקוח או סוג חריגה..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-11 py-2 rounded-xl bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/30"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground animate-pulse">טוען תעודות בירור מטאב הגיליון...</div>
      ) : filteredInquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 border-2 border-dashed border-muted rounded-3xl text-muted-foreground bg-card/50 space-y-3">
          <FileText className="h-12 w-12 text-muted-foreground/40" />
          <p className="font-bold text-sm">אין כרגע תעודות בבירור התואמות לחיפוש.</p>
          <p className="text-xs text-muted-foreground/70">התעודות יופיעו כאן אוטומטית ברגע שיעובדו ממיילי הסריקות.</p>
        </div>
      ) : (
        <div className="grid gap-3.5">
          {filteredInquiries.map((note, idx) => (
            <div
              key={note.docNumber || idx}
              className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 bg-card border border-border rounded-2xl hover:border-primary/50 transition shadow-sm hover:shadow-md gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl shrink-0 mt-0.5">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">תעודה #{note.docNumber || 'ללא מספר'}</span>
                    <span className="text-[11px] px-2 py-0.5 bg-muted rounded-md text-muted-foreground font-medium">
                      {note.receivedDate || 'היום'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">
                    לקוח: <strong className="text-foreground">{note.customer || 'לא צוין לקוח'}</strong> · כתובת: {note.address || 'לא צוינה כתובת'}
                  </div>
                  <div className="text-xs text-amber-800 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/60 inline-block font-medium">
                    🔍 חריגה: {note.errorReason || note.aiAnalysis || 'דורש בירור ובדיקת ראמי'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end pt-2 md:pt-0 border-t md:border-t-0 border-border">
                {note.driveLink && (
                  <a 
                    href={note.driveLink} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted text-foreground text-xs font-bold hover:bg-muted/80 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>צפה בסריקה</span>
                  </a>
                )}
                <Link
                  to="/inquiry/$id"
                  params={{ id: note.docNumber || String(note.rowIndex) }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition shadow-sm"
                >
                  <span>טיפול ומענה</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}