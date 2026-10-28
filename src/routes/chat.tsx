import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/chat")({
  component: () => (
    <div dir="rtl" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-bold">נועה AI — חמ״ל</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        דף הצ׳אט בעדכון. הקובץ המלא עם מוח grounding מוכן ב-repo המקומי.
        יש לדחוף את src/routes/chat.tsx מהמחשב המקומי או לבקש דחיפה מלאה.
      </p>
      <Link to="/canvas" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
        עבור לקנבס
      </Link>
    </div>
  ),
});
