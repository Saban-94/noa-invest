import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchLiveNotes } from "@/lib/api";
import { PageHeader } from "@/components/AppShell";
import { AlertCircle, FileText } from "lucide-react";

export const Route = createFileRoute("/inquiry")({
  component: InquiryListPage,
});

function InquiryListPage() {
  const { data: notes, isLoading } = useQuery({
    queryKey: ["live-notes"],
    queryFn: fetchLiveNotes,
  });

  const inquiries = notes?.filter((n) => n.noteStage === "returned_to_rami") || [];

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader title="בירור תעודות (ראמי)" subtitle="תעודות שהוחזרו לטיפולך" />

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען נתונים...</div>
      ) : inquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-muted rounded-2xl text-muted-foreground">
          <FileText className="h-12 w-12 mb-4 opacity-50" />
          <p>אין כרגע תעודות בבירור.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {inquiries.map((note) => (
            <Link
              key={note.id}
              to="/inquiry/$id"
              params={{ id: note.id }}
              className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary transition shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold">תעודה #{note.id}</div>
                  <div className="text-xs text-muted-foreground">לקוח: {note.customer}</div>
                </div>
              </div>
              <div className="text-sm font-bold text-primary">הצג בירור</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
