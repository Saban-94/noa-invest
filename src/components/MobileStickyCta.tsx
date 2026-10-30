/**
 * סרגל פעולה דביק מעל הניווט התחתון — מובייל
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MobileStickyCta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky-cta lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
