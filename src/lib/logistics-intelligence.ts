/**
 * logistics-intelligence — מחסני מוצא, מרחקים גיאוגרפיים בסיסיים, סיווג התאמה.
 * אין כאן קריאות Routes API; מרחק אווירי מסומן במפורש כלא-GPS-מדידה.
 */

export const YARDS = {
  harash: {
    id: "harash",
    name: "מחסן החרש",
    address: "החרש 10",
    lat: 32.1235, // נקודת ייחוס תפעולית — לא GPS חי
    lng: 34.895,
  },
  talmid: {
    id: "talmid",
    name: "מחסן התלמיד",
    address: "התלמיד 6",
    lat: 32.0856,
    lng: 34.7818,
  },
} as const;

export type YardId = keyof typeof YARDS;

/** מרחק אווירי בק״מ (Haversine). לא זמן נסיעה ולא מסלול GPS. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function distanceToYardKm(
  point: { lat: number; lng: number } | null | undefined,
  yardId: YardId,
): number | null {
  if (point == null || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return haversineKm(point, { lat: YARDS[yardId].lat, lng: YARDS[yardId].lng });
}

export type MatchTier = "verified" | "high" | "review" | "unmatched";

export const MATCH_TIER_HE: Record<MatchTier, string> = {
  verified: "התאמה מאומתת",
  high: "סבירות גבוהה",
  review: "לבדיקה",
  unmatched: "לא משויך",
};

/** מיפוי סטטוס קיים (ok/warn/fail) לסיווג מודיעין */
export function tierFromAudit(status: string | undefined, fromSheet: boolean): MatchTier {
  if (fromSheet && (status === "ok" || status === "matched")) return "verified";
  if (status === "ok") return "high";
  if (status === "warn") return "review";
  return "unmatched";
}

export function formatKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "אין נתון";
  return `${km.toFixed(1)} ק״מ (אווירי)`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "אין נתון";
  return `${Math.round(min)} דק׳`;
}
