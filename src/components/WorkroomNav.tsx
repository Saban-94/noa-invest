/**
 * WorkroomNav — ניווט משותף בין דשבורד / ראמי / הראל / צ׳אט / תעודות
 */
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, ClipboardList, Crown, MessageSquare, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "דשבורד", icon: LayoutDashboard },
  { to: "/inquiry", label: "בירור ראמי", icon: ClipboardList },
  { to: "/harel", label: "דשבורד הראל", icon: Crown },
  { to: "/chat", label: "צ׳אט נועה", icon: MessageSquare },
  { to: "/notes", label: "תעודות", icon: FileText },
] as const;

export function WorkroomNav({ active }: { active?: "inquiry" | "harel" | "chat" | "notes" | "home" }) {
  return (
    <nav
      className="flex flex-wrap gap-1.5 rounded-2xl border border-border/60 bg-card/80 p-1.5 shadow-sm"
      aria-label="ניווט חדר עבודה"
      dir="rtl"
    >
      {ITEMS.map(({ to, label, icon: Icon }) => {
        const isActive =
          (active === "home" && to === "/") ||
          (active === "inquiry" && to === "/inquiry") ||
          (active === "harel" && to === "/harel") ||
          (active === "chat" && to === "/chat") ||
          (active === "notes" && to === "/notes");
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
