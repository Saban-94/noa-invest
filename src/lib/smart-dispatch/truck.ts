// src/lib/smart-dispatch/truck.ts
// זיהוי משאית מתעודה: רישוי מפורש, ואם אין, הסקה משם הנהג

const DRIVER_TRUCKS: { match: RegExp; plate: string }[] = [
  { match: /חכמת/, plate: "615-41-002" },
  { match: /עלי/, plate: "651-51-701" },
];

/** מחלץ רישוי XXX-XX-XXX מטקסט חופשי. מחזיר "" אם אין רישוי. */
export function extractPlate(raw?: string): string {
  if (!raw) return "";
  const dashed = raw.match(/\b\d{2,3}-\d{2}-\d{3}\b/);
  if (dashed) return dashed[0];
  const digits = raw.match(/\b\d{7,8}\b/);
  if (digits) {
    const d = digits[0];
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }
  return "";
}

export function truckFromDriver(raw?: string): string {
  if (!raw) return "";
  return DRIVER_TRUCKS.find((d) => d.match.test(raw))?.plate ?? "";
}

/**
 * סדר עדיפויות: רישוי בעמודת משאית, רישוי בעמודת נהג, הסקה משם הנהג.
 * inferred=true כשהמשאית הוסקה מהנהג בלבד.
 */
export function resolveTruck(
  truckRaw?: string,
  driverRaw?: string,
): { plate: string; inferred: boolean } {
  const explicit = extractPlate(truckRaw) || extractPlate(driverRaw);
  if (explicit) return { plate: explicit, inferred: false };
  const inferred = truckFromDriver(driverRaw) || truckFromDriver(truckRaw);
  return { plate: inferred, inferred: Boolean(inferred) };
}