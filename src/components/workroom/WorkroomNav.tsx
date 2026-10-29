/**
 * שורת ניווט זהה ל-/inquiry, /inquiry/$id ו-/harel.
 * כשיש taskId — הקישורים לבירור ראמי ולדשבורד הראל שומרים על אותה משימה.
 */

import { Link } from "@tanstack/react-router";
import { Crown, LayoutDashboard, MessageCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Current = "dashboard" | "inquiry" | "harel" | "chat";

const ITEM =
  "inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

function itemClass(active: boolean) {
  return cn(
    ITEM,
    active
      ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );
}

export function WorkroomNav({
  current,
  taskId,
  className,
}: {
  current: Current;
  /** מספר תעודה / מזהה בירור — נשמר בקישורים בין ראמי להראל */
  taskId?: string | undefined;
  className?: string;
}) {
  const taskSearch = taskId ? { task: taskId } : {};
  return (
    <nav
      aria-label="ניווט אזור העבודה"
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/60 bg-card/70 p-1.5 shadow-sm backdrop-blur",
        className,
      )}
    >
      <Link
        to="/"
        aria-current={current === "dashboard" ? "page" : undefined}
        className={itemClass(current === "dashboard")}
      >
        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
        דשבורד
      </Link>
      <Link
        to="/inquiry"
        search={{ ...taskSearch, tab: "tasks" }}
        aria-current={current === "inquiry" ? "page" : undefined}
        className={itemClass(current === "inquiry")}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        בירור ראמי
      </Link>
      <Link
        to="/harel"
        search={taskSearch}
        aria-current={current === "harel" ? "page" : undefined}
        className={itemClass(current === "harel")}
      >
        <Crown className="h-3.5 w-3.5" aria-hidden="true" />
        דשבורד הראל
      </Link>
      <Link
        to="/chat"
        aria-current={current === "chat" ? "page" : undefined}
        className={itemClass(current === "chat")}
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        צ׳אט נועה
      </Link>
      {taskId && (
        <span className="ms-auto rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-mono text-[11px] font-bold text-orange-800 dark:text-orange-200">
          ת.מ. {taskId}
        </span>
      )}
    </nav>
  );
}
