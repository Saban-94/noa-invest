import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { NotesArchive } from "@/components/NotesArchive";

export const Route = createFileRoute("/notes")({
  head: () => ({
    meta: [
      { title: "ארכיון תעודות משלוח — נועה ח. סבן" },
      {
        name: "description",
        content: "חיפוש וסינון תעודות משלוח שנסרקו ע״י גליה, לפי לקוח, תאריך ומחסן.",
      },
      { property: "og:title", content: "ארכיון תעודות משלוח — ח. סבן" },
      { property: "og:description", content: "תעודות משלוח סרוקות עם בקרת נועה AI." },
    ],
  }),
  component: NotesLayout,
});

function NotesLayout() {
  const { pathname } = useLocation();
  return pathname === "/notes" || pathname === "/notes/" ? <NotesArchive /> : <Outlet />;
}
