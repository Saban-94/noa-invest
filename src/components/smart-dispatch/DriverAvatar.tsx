// src/components/smart-dispatch/DriverAvatar.tsx
// אווטאר נהג עגול עם referrerPolicy="no-referrer", object-fit:cover,
// ו-fallback עם ראשי תיבות בצבע נהג במקרה של כשל בטעינה

import { useState } from "react";
import { DRIVER_METAS, type DriverIdentity } from "@/lib/smart-dispatch/rules-engine";

interface DriverAvatarProps {
  driver: DriverIdentity;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showBadge?: boolean;
}

export function DriverAvatar({
  driver,
  size = "md",
  className = "",
  showBadge = false,
}: DriverAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const meta =
    driver === "ali" ? DRIVER_METAS.ali : driver === "hekmat" ? DRIVER_METAS.hekmat : null;

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-16 w-16 text-lg",
    xl: "h-20 w-20 text-xl",
  }[size];

  if (!meta) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-muted font-bold text-muted-foreground ${sizeClasses} ${className}`}
      >
        נהג
      </div>
    );
  }

  return (
    <div className={`relative shrink-0 ${sizeClasses} ${className}`}>
      {!hasError && meta.avatarUrl ? (
        <img
          src={meta.avatarUrl}
          alt={meta.nameHe}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className="h-full w-full rounded-full object-cover ring-2 ring-border shadow-xs"
        />
      ) : (
        <div
          className="h-full w-full rounded-full flex items-center justify-center font-display font-extrabold text-white shadow-xs"
          style={{ backgroundColor: meta.colorHex }}
        >
          {meta.initials}
        </div>
      )}

      {showBadge && (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-card"
          style={{ backgroundColor: meta.colorHex }}
        />
      )}
    </div>
  );
}
