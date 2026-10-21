// src/lib/smart-dispatch/handwritten-crane.ts
// פענוח חלונות מנוף והמתנה בכתב יד מתוך עמודת "זמני מנוף / המתנה"

import type { HandwrittenCraneWindow } from "./types";

/**
 * המרת שעה כגון "9", "9:20", "09:15" למספר דקות מחצות
 */
export function timeToMinutes(hourStr: string, minStr?: string): number {
  const h = parseInt(hourStr, 10);
  const m = minStr ? parseInt(minStr.replace(":", ""), 10) : 0;
  return h * 60 + m;
}

/**
 * פיענוח כל חלונות הזמן מטקסט הערות מנוף/המתנה
 */
export function parseHandwrittenCraneWindows(raw?: string): HandwrittenCraneWindow[] {
  if (!raw || typeof raw !== "string") return [];
  const text = raw.trim();
  if (!text) return [];

  const results: HandwrittenCraneWindow[] = [];

  // Regex מדויק: שעת התחלה (אופציונלי דקות) עד שעת סיום (אופציונלי שעה/דקות)
  // דוגמאות: "9:20 עד שעה 10:00", "7 עד 8:00", "11:50 עד 14:35"
  const regex = /(\d{1,2})(:\d{2})?\s*עד\s*(?:שעה\s*)?(\d{1,2})(:\d{2})?/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const matchIndex = match.index;

    const startH = match[1]!;
    const startM = match[2];
    const endH = match[3]!;
    const endM = match[4];

    // בדיקת הקשר של עד 16 תווים לפני החלון: מכיל "המתנה" = המתנה, אחרת פריקה
    const precedingContext = text.slice(Math.max(0, matchIndex - 16), matchIndex);
    const isWaiting = precedingContext.includes("המתנה");
    const type: "unloading" | "waiting" = isWaiting ? "waiting" : "unloading";

    const startMinutes = timeToMinutes(startH, startM);
    const endMinutes = timeToMinutes(endH, endM);

    const startStr = `${startH.padStart(2, "0")}:${startM ? startM.replace(":", "") : "00"}`;
    const endStr = `${endH.padStart(2, "0")}:${endM ? endM.replace(":", "") : "00"}`;

    const durationMin = endMinutes - startMinutes;
    const isReversed = endMinutes <= startMinutes;
    const isOutlier = durationMin > 240;

    const flags: string[] = [];
    if (isReversed) {
      flags.push("חלון מנוף הפוך");
    }
    if (isOutlier) {
      flags.push("חלון חריג");
    }

    results.push({
      rawText: fullMatch,
      type,
      startStr,
      endStr,
      durationMin: isReversed || isOutlier ? 0 : durationMin,
      isReversed,
      isOutlier,
      flags,
    });
  }

  return results;
}

/**
 * סיכום זמני מנוף והמתנה תקפים מתוך רשימת תעודות של אותו ביקור
 * לוקח את הפריקה הארוכה ביותר ואת ההמתנה הארוכה ביותר (משום שזו אותה פריקה פיזית)
 */
export function summarizeVisitHandwrittenTimes(rawTexts: (string | undefined)[]): {
  unloadingMin: number;
  waitingMin: number;
  totalValidMin: number;
  flags: string[];
} {
  const flagsSet = new Set<string>();
  let maxUnloading = 0;
  let maxWaiting = 0;

  for (const raw of rawTexts) {
    const windows = parseHandwrittenCraneWindows(raw);
    for (const w of windows) {
      w.flags.forEach((f) => flagsSet.add(f));

      // התעלם מחלונות הפוכים או חריגים בחישוב הזמן
      if (w.isReversed || w.isOutlier) {
        continue;
      }

      if (w.type === "unloading") {
        if (w.durationMin > maxUnloading) {
          maxUnloading = w.durationMin;
        }
      } else if (w.type === "waiting") {
        if (w.durationMin > maxWaiting) {
          maxWaiting = w.durationMin;
        }
      }
    }
  }

  return {
    unloadingMin: maxUnloading,
    waitingMin: maxWaiting,
    totalValidMin: maxUnloading + maxWaiting,
    flags: Array.from(flagsSet),
  };
}
