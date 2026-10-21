import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/tachograph")({
  head: () => ({
    meta: [
      { title: "בקרת דיסקיות טכוגרף — נועה ח. סבן" },
      {
        name: "description",
        content: "פענוח דיסקיות טכוגרף AI ואימות זמני פריקת מנוף PTO מול נתוני סידור העבודה.",
      },
      { property: "og:title", content: "דיסקיות טכוגרף — ח. סבן" },
      { property: "og:description", content: "מערכת noaBrain SPARK Vision לבקרת דיסקיות טכוגרף." },
    ],
  }),
  component: TachographPageRoute,
});

function TachographPageRoute() {
  return (
    <>
      <PageHeader
        title="דיסקיות טכוגרף SPARK Vision"
        subtitle="פענוח אוטונומי של דיסקיות טכוגרף מעגליות 24H, פרופיל מהירות ואישור ראמי מסארווה"
        action={
          <a
            href="/tachograph.html"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition active:scale-95 shadow-sm"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>פתח בחלון נפרד</span>
          </a>
        }
      />
      <div className="w-full rounded-2xl overflow-hidden border border-border shadow-xl bg-gray-950 mt-4">
        <iframe
          src="/tachograph.html"
          title="noaBrain SPARK Vision"
          className="w-full h-[900px] border-0"
        />
      </div>
    </>
  );
}
