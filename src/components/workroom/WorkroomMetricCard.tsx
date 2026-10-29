/**
 * כרטיס מדד אחיד (בסיס: כרטיסי המדדים של /harel).
 * עם onClick — הופך לכפתור סינון עם aria-pressed.
 */

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { TONE, type WorkroomTone } from "@/lib/workroom-ui";

export type WorkroomMetric = {
  label: string;
  value: number;
  detail?: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  tone: WorkroomTone;
};

export function WorkroomMetricCard({
  metric,
  active,
  onClick,
}: {
  metric: WorkroomMetric;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = metric.icon;
  const tone = TONE[metric.tone];
  const interactive = Boolean(onClick);

  const body = (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-primary/80 via-primary/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted-foreground">{metric.label}</div>
          <div className="mt-2 font-display text-3xl font-extrabold tabular-nums tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
            {metric.value}
          </div>
          {metric.detail && (
            <div className="mt-1 text-[11px] text-muted-foreground">{metric.detail}</div>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none",
            tone.surface,
            tone.text,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </>
  );

  const base = cn(
    "group relative w-full overflow-hidden rounded-2xl border bg-card/95 p-4 text-right shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transform-none",
    active ? "border-primary/40 ring-2 ring-primary/20" : "border-border/70",
  );

  if (!interactive) return <div className={base}>{body}</div>;

  return (
    <button
      type="button"
      aria-pressed={Boolean(active)}
      onClick={onClick}
      className={cn(
        base,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      )}
    >
      {body}
    </button>
  );
}
