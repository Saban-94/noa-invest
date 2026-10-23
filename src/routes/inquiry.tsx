import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchLiveNotes } from "@/lib/api";
import { PageHeader } from "@/components/AppShell";
import { AlertCircle, FileText, Search, Filter } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/inquiry")({
  component: InquiryListPage,
});

function InquiryListPage() {
  const { data: notes, isLoading } = useQuery({
    queryKey: ["live-notes"],
    queryFn: fetchLiveNotes,
  });

  const [searchTerm, setSearchTerm] = useState("");
  
  const inquiries = notes?.filter((n) => n.noteStage === "returned_to_rami") || [];
  
  const filteredInquiries = inquiries.filter((n) => 
    n.id.toString().includes(searchTerm) || 
    n.customer.includes(searchTerm)
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader title="בירור תעודות (ראמי)" subtitle="תעודות שהוחזרו לטיפולך" />
      
      {/* Search & Filter Bar */}
      <div className="flex gap-2 bg-card p-2 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            placeholder="חיפוש לפי מספר תעודה או שם לקוח..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-10 py-2 rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-semibold hover:bg-muted/80">
          <Filter className="h-4 w-4" />
          סינון
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען נתונים...</div>
      ) : filteredInquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-muted rounded-2xl text-muted-foreground">
          <FileText className="h-12 w-12 mb-4 opacity-50" />
          <p>אין כרגע תעודות בבירור התואמות לחיפוש.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredInquiries.map((note) => (
            <Link
              key={note.id}
              to="/inquiry/$id"
              params={{ id: note.id }}
              className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary transition shadow-sm hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-sm">תעודה #{note.id}</div>
                  <div className="text-xs text-muted-foreground">לקוח: {note.customer}</div>
                </div>
              </div>
              <div className="text-sm font-bold text-primary px-3 py-1 bg-primary/10 rounded-lg">
                צפייה בבירור
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
