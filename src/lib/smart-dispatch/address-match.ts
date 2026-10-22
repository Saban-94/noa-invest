// src/lib/smart-dispatch/address-match.ts
// נרמול כתובות ותאריכים, ציון התאמה מחמיר ושיבוץ 1:1 גלובלי

const KNOWN_CITIES = [
  "הוד השרון", "רמת השרון", "תל אביב", "רמת גן", "פתח תקווה", "רעננה", "כפר סבא",
  "הרצליה", "סביון", "גבעתיים", "בת ים", "ראשון לציון", "חולון", "אור יהודה",
  "יהוד", "קרית אונו", "נתניה", "חגור",
];

const CITY_ALIASES: Record<string, string> = {
  "תל אביב יפו": "תל אביב",
  יפו: "תל אביב",
  תא: "תל אביב",
  "ת א": "תל אביב",
};

const STREET_NOISE = new Set(["רחוב", "רח", "שד", "שדרות"]);

/* ---------- תאריך ---------- */

/** מחזיר DD/MM/YYYY או "" */
export function normalizeDate(raw?: string): string {
  if (!raw) return "";
  const s = raw.trim().split(/[\sT]/)[0] ?? "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[3]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${m[1]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${y}`;
  }
  return "";
}

/* ---------- נרמול טקסט ---------- */

export function normalizeHe(s?: string): string {
  return (s ?? "")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/["'״׳`]/g, "")
    .replace(/[–—_-]/g, " ")
    .replace(/[;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCity(raw: string): string {
  const c = normalizeHe(raw);
  return CITY_ALIASES[c] ?? c;
}

/* ---------- פירוק כתובת ---------- */

export type ParsedAddress = {
  city: string;
  street: string;
  number: string;
  suffix: string; // אות אחרי מספר הבית (4א)
};

export function parseAddressComponents(rawAddress?: string): ParsedAddress {
  const empty: ParsedAddress = { city: "", street: "", number: "", suffix: "" };
  if (!rawAddress) return empty;

  const cleaned = rawAddress
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/["'״׳`]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[;()]/g, " ");

  const parts = cleaned
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let streetPart = "";
  let city = "";

  if (parts.length >= 2) {
    streetPart = parts[0]!;
    city = canonicalCity(parts[parts.length - 1]!);
  } else {
    // בלי פסיק: מחפשים עיר מוכרת בסוף המחרוזת בלבד
    streetPart = parts[0] ?? "";
    const norm = normalizeHe(streetPart);
    const found = [...KNOWN_CITIES, ...Object.keys(CITY_ALIASES)]
      .sort((a, b) => b.length - a.length)
      .find((c) => norm === c || norm.endsWith(` ${c}`));
    if (found) {
      city = canonicalCity(found);
      streetPart = norm.slice(0, norm.length - found.length).trim();
    }
  }

  // מספר בית: הראשון בחלק הרחוב, עם אות אופציונלית
  let number = "";
  let suffix = "";
  const nm = streetPart.match(/(\d+)\s*([א-ת])?(?![א-ת])/);
  if (nm) {
    number = nm[1]!;
    suffix = nm[2] ?? "";
    streetPart = streetPart.replace(nm[0], " ");
  }

  const tokens = normalizeHe(streetPart)
    .split(" ")
    .filter((t) => t && !STREET_NOISE.has(t));

  // הסרת ה' הידיעה מהמילה הראשונה בלבד ("הרקפת" -> "רקפת")
  if (tokens[0] && tokens[0].length > 3 && tokens[0].startsWith("ה")) {
    tokens[0] = tokens[0].slice(1);
  }

  return { city, street: tokens.join(" "), number, suffix };
}

export function normalizeAddressToSiteKey(rawAddress?: string): string {
  const { city, street, number } = parseAddressComponents(rawAddress);
  return `${city}|${street}|${number}`.toLowerCase();
}

/* ---------- דמיון ---------- */

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/** 0..1. שמות קצרים (עד 3 אותיות, כמו "נח") דורשים זהות מלאה. */
export function streetSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const shortest = Math.min(a.length, b.length);
  if (shortest <= 3) return 0;

  const ta = a.split(" ");
  const tb = b.split(" ");
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // הכלה מילולית: "בן גוריון" בתוך "דוד בן גוריון" (רק אם יש 2+ מילים)
  if (small.length >= 2 && small.every((t) => big.includes(t))) return 0.9;

  const ratio = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return ratio >= 0.8 ? ratio : 0;
}

/* ---------- ציון התאמה ---------- */

export type AddressMatch = {
  score: number; // רחוב 2 + מספר 2 + עיר 1
  streetMatched: boolean;
  numberMatched: boolean;
  cityMatched: boolean;
  isMatch: boolean;
  reasons: string[]; // להצגה בצ'אט
};

export function scoreAddressMatch(addr1?: string, addr2?: string): AddressMatch {
  const p1 = parseAddressComponents(addr1);
  const p2 = parseAddressComponents(addr2);
  const reasons: string[] = [];

  const sim = streetSimilarity(p1.street, p2.street);
  const streetMatched = sim > 0;
  const bothNumbers = Boolean(p1.number && p2.number);
  const numberMatched = bothNumbers && p1.number === p2.number;
  const numberConflict = bothNumbers && p1.number !== p2.number;
  const bothCities = Boolean(p1.city && p2.city);
  const cityMatched = bothCities && p1.city === p2.city;
  const cityConflict = bothCities && p1.city !== p2.city;

  let score = 0;
  if (streetMatched) {
    score += 2;
    reasons.push(sim === 1 ? "רחוב זהה" : `רחוב דומה (${Math.round(sim * 100)}%)`);
  }
  if (numberMatched) {
    score += 2;
    reasons.push(`מספר בית ${p1.number}`);
  }
  if (cityMatched) {
    score += 1;
    reasons.push(`עיר ${p1.city}`);
  }
  if (numberConflict) reasons.push(`מספר שונה (${p1.number} מול ${p2.number})`);
  if (cityConflict) reasons.push(`עיר שונה (${p1.city} מול ${p2.city})`);

  // התאמה רק אם הרחוב תואם, ואין סתירה במספר או בעיר
  const isMatch = streetMatched && !numberConflict && !cityConflict && score >= 3;
  return { score, streetMatched, numberMatched, cityMatched, isMatch, reasons };
}

/* ---------- זמן ---------- */

export function timeToMin(hhmm?: string): number | null {
  const m = (hhmm ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10) : null;
}

/** חפיפה בדקות בין שני חלונות HH:mm (0 אם אין או חסר נתון) */
export function windowOverlapMin(aS?: string, aE?: string, bS?: string, bE?: string): number {
  const [as, ae, bs, be] = [aS, aE, bS, bE].map(timeToMin);
  if (as == null || ae == null || bs == null || be == null) return 0;
  return Math.max(0, Math.min(ae, be) - Math.max(as, bs));
}

/* ---------- שיבוץ 1:1 גלובלי ---------- */

/**
 * במקום "ביקור ראשון לוקח את העצירה הטובה ביותר", בונים את כל הזוגות,
 * ממיינים לפי ציון (ואז tiebreak) ומשבצים בחמדנות מהטוב לגרוע.
 * מחזיר Map: אינדקס ביקור -> אינדקס עצירה.
 */
export function assignOneToOne<V, S>(
  visits: V[],
  stops: S[],
  scorer: (v: V, s: S) => { score: number; tiebreak?: number } | null,
): Map<number, number> {
  const pairs: { vi: number; si: number; score: number; tie: number }[] = [];
  visits.forEach((v, vi) =>
    stops.forEach((s, si) => {
      const r = scorer(v, s);
      if (r && r.score > 0) pairs.push({ vi, si, score: r.score, tie: r.tiebreak ?? 0 });
    }),
  );
  pairs.sort((a, b) => b.score - a.score || b.tie - a.tie);

  const usedV = new Set<number>();
  const usedS = new Set<number>();
  const out = new Map<number, number>();
  for (const p of pairs) {
    if (usedV.has(p.vi) || usedS.has(p.si)) continue;
    usedV.add(p.vi);
    usedS.add(p.si);
    out.set(p.vi, p.si);
  }
  return out;
}