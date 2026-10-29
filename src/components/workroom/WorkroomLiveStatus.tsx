/**
 * שורת סטטוס רענון (aria-live) — זהה בשני המסכים.
 */

export function WorkroomLiveStatus({
  label,
  isFetching,
  isError,
  intervalLabel = "רענון אוטומטי כל 2 דקות",
}: {
  label: string;
  isFetching: boolean;
  isError: boolean;
  intervalLabel?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground"
    >
      <span className="font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${
            isFetching
              ? "bg-amber-500 motion-safe:animate-pulse motion-reduce:animate-none"
              : isError
                ? "bg-destructive"
                : "bg-emerald-500"
          }`}
        />
        {isFetching ? "הנתונים מתעדכנים" : isError ? "לא ניתן לעדכן כרגע" : intervalLabel}
      </span>
    </div>
  );
}
