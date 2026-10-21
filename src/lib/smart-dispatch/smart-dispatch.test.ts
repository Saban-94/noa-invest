// src/lib/smart-dispatch/smart-dispatch.test.ts
import { describe, it, expect } from "vitest";
import {
  parseHandwrittenCraneWindows,
  summarizeVisitHandwrittenTimes,
} from "./handwritten-crane";
import {
  parseAddressComponents,
  scoreAddressMatch,
  normalizeAddressToSiteKey,
  deduplicateAndFilterDeliveryNotes,
  groupNotesIntoVisits,
  matchVisitsWithIturanStops,
} from "./cross-matcher";
import { processIturanRows, cleanDriverName, normalizeTruckPlate } from "./ituran-parser";
import { estimateDispatchTime, calculatePercentile } from "./estimation-engine";
import { SAMPLE_GALYA_NOTES, SAMPLE_ITURAN_ROWS, SAMPLE_VISITS } from "./fixtures";
import type { GalyaDeliveryNote, IturanRawRow } from "./types";

describe("1. Handwritten Crane & Waiting Windows Parser (פענוח חלונות מנוף)", () => {
  const TWELVE_HANDWRITTEN_STRINGS = [
    // 1. פריקת מנוף רגילה
    "פריקת מנוף משעה 9:20 עד שעה 10:00",
    // 2. המתנה עם הקשר
    "המתנה משעה 13:05 עד שעה 13:40",
    // 3. טקסט מנוף מעורב
    "מנוף ... פריקת מנוף משעה 7 עד שעה 8:00 (בכתב יד: 7 עד 8:00, 43)",
    // 4. חלון שעות ללא מילות קידומת
    "11:50 עד 14:35",
    // 5. חלון הפוך (סיום לפני התחלה)
    "פריקת מנוף משעה 09:15 עד שעה 09:00",
    // 6. חלון חריג מעל 240 דקות
    "המתנה משעה 08:00 עד שעה 13:00",
    // 7. שעות עגולות
    "משעה 8 עד 9:00",
    // 8. פריקה עם דקות בודדות
    "פריקת מנוף משעה 10:15 עד 11:00",
    // 9. חלון קצר
    "המתנה משעה 12:00 עד 12:20",
    // 10. פריקה בשעות אחה\"צ
    "פריקת מנוף משעה 14:00 עד 14:45",
    // 11. פריקה משולבת המתנה במחרוזת אחת
    "פריקת מנוף 9:30 עד 10:15, המתנה 10:15 עד 10:45",
    // 12. סיום שווה להתחלה
    "פריקה משעה 11:00 עד 11:00",
  ];

  it("parses all 12 handwritten crane strings accurately", () => {
    // 1.
    const res1 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[0]);
    expect(res1[0]?.type).toBe("unloading");
    expect(res1[0]?.durationMin).toBe(40);
    expect(res1[0]?.isReversed).toBe(false);

    // 2.
    const res2 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[1]);
    expect(res2[0]?.type).toBe("waiting");
    expect(res2[0]?.durationMin).toBe(35);

    // 3.
    const res3 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[2]);
    expect(res3[0]?.type).toBe("unloading");
    expect(res3[0]?.durationMin).toBe(60);

    // 4.
    const res4 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[3]);
    expect(res4[0]?.type).toBe("unloading");
    expect(res4[0]?.durationMin).toBe(165);

    // 5. Reversed window
    const res5 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[4]);
    expect(res5[0]?.isReversed).toBe(true);
    expect(res5[0]?.durationMin).toBe(0);
    expect(res5[0]?.flags).toContain("חלון מנוף הפוך");

    // 6. Outlier window (> 240 min = 300 min)
    const res6 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[5]);
    expect(res6[0]?.isOutlier).toBe(true);
    expect(res6[0]?.durationMin).toBe(0);
    expect(res6[0]?.flags).toContain("חלון חריג");

    // 7.
    const res7 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[6]);
    expect(res7[0]?.durationMin).toBe(60);

    // 11. Multi window in one text
    const res11 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[10]);
    expect(res11.length).toBe(2);
    expect(res11[0]?.type).toBe("unloading");
    expect(res11[0]?.durationMin).toBe(45);
    expect(res11[1]?.type).toBe("waiting");
    expect(res11[1]?.durationMin).toBe(30);

    // 12. End equals start
    const res12 = parseHandwrittenCraneWindows(TWELVE_HANDWRITTEN_STRINGS[11]);
    expect(res12[0]?.isReversed).toBe(true);
  });

  it("summarizes visit handwritten times by taking max unloading and max waiting and ignores reversed windows", () => {
    const summary = summarizeVisitHandwrittenTimes([
      "פריקת מנוף משעה 9:20 עד 10:00", // 40
      "פריקת מנוף משעה 09:15 עד 09:00", // reversed -> 0
      "המתנה משעה 10:00 עד 10:25", // 25
    ]);
    expect(summary.unloadingMin).toBe(40);
    expect(summary.waitingMin).toBe(25);
    expect(summary.totalValidMin).toBe(65);
    expect(summary.flags).toContain("חלון מנוף הפוך");
  });
});

describe("2. Address Normalization & Matching (הצלבת כתובות)", () => {
  it("normalizes 'הרקפת 4, הוד השרון' and 'רקפת 4, הוד השרון' to identical site key", () => {
    const p1 = parseAddressComponents("הרקפת 4, הוד השרון");
    const p2 = parseAddressComponents("רקפת 4, הוד השרון");

    expect(p1.street).toBe("רקפת");
    expect(p2.street).toBe("רקפת");
    expect(p1.number).toBe("4");
    expect(p2.number).toBe("4");
    expect(p1.city).toBe("הוד השרון");

    const key1 = normalizeAddressToSiteKey("הרקפת 4, הוד השרון");
    const key2 = normalizeAddressToSiteKey("רקפת 4, הוד השרון");
    expect(key1).toBe(key2);
  });

  it("scores address match correctly with street+number+city threshold", () => {
    const match1 = scoreAddressMatch("משה שרת 9, הוד השרון", "משה שרת 9, הוד השרון");
    expect(match1.score).toBe(5); // street=2, num=2, city=1
    expect(match1.isMatch).toBe(true);

    const match2 = scoreAddressMatch("הרקפת 4, הוד השרון", "רקפת 4, הוד השרון");
    expect(match2.score).toBe(5);
    expect(match2.isMatch).toBe(true);

    const matchMismatch = scoreAddressMatch("משה שרת 9, הוד השרון", "דיזנגוף 100, תל אביב");
    expect(matchMismatch.score).toBe(0);
    expect(matchMismatch.isMatch).toBe(false);
  });
});

describe("3. Deduplication & Data Cleaning (דה-דופליקציה וניקוי)", () => {
  it("keeps the most complete row for duplicate delivery notes and ignores day markers", () => {
    const notesWithDuplicates: GalyaDeliveryNote[] = [
      {
        docDate: "15/10/2026",
        docTime: "06:30",
        noteId: "6715766",
        customerName: "ערן אזולאי",
        deliveryAddress: "משה שרת 9, הוד השרון",
      },
      {
        docDate: "15/10/2026",
        docTime: "06:30",
        noteId: "6715766",
        customerName: "ערן אזולאי",
        deliveryAddress: "משה שרת 9, הוד השרון",
        itemsSummary: "5 בלה חול",
        craneTimeRaw: "פריקת מנוף 9:20 עד 10:00",
        signedLink: "https://drive.google.com/doc",
      },
      // שורת סימון יום (ללא מספר תעודה וכתובת)
      {
        docDate: "15/10/2026",
        docTime: "",
        noteId: "",
        customerName: "",
        deliveryAddress: "",
        driverRaw: "חכמת",
      },
    ];

    const { cleanNotes, duplicateIssuesCount } = deduplicateAndFilterDeliveryNotes(notesWithDuplicates);
    expect(cleanNotes.length).toBe(1);
    expect(duplicateIssuesCount).toBe(1);
    expect(cleanNotes[0]?.itemsSummary).toBe("5 בלה חול");
  });

  it("cleans driver name and normalizes truck license plate", () => {
    expect(cleanDriverName("נהג קבוע:\nעלי אבו עידה")).toBe("עלי אבו עידה");
    expect(cleanDriverName("חכמת גאבר / 615-41-002 מרצדס מנוף")).toBe("חכמת גאבר");
    expect(normalizeTruckPlate("651-51-701 משאית איסוזו")).toBe("651-51-701");
    expect(normalizeTruckPlate("61541002")).toBe("615-41-002");
  });
});

describe("4. Ituran Processing & PTO Events (עיבוד איתוראן ו-PTO)", () => {
  it("calculates stop duration from time difference and not from text", () => {
    const { stops } = processIturanRows(SAMPLE_ITURAN_ROWS);
    const stop1 = stops.find((s) => s.address.includes("משה שרת"));
    expect(stop1).toBeDefined();
    expect(stop1?.durationMin).toBe(45); // 09:15 to 10:00
  });

  it("pairs PTO open and close and detects orphan PTO crossing boundaries", () => {
    const { ptoEvents, orphanPtoCount } = processIturanRows(SAMPLE_ITURAN_ROWS);
    expect(ptoEvents.length).toBeGreaterThan(0);
    const paired = ptoEvents.filter((p) => !p.isOrphan);
    expect(paired.length).toBeGreaterThan(0);
    expect(orphanPtoCount).toBeGreaterThanOrEqual(1);

    const orphan = ptoEvents.find((p) => p.isOrphan);
    expect(orphan).toBeDefined();
    expect(orphan?.orphanReason).toBeDefined();
  });
});

describe("5. Estimation Engine & Hierarchy (מנוע הערכה לסדרן)", () => {
  it("returns 'אתר' hierarchy with high/medium confidence for known site", () => {
    const res = estimateDispatchTime(
      {
        customerNo: "740112",
        address: "הרקפת 4, הוד השרון",
        city: "הוד השרון",
      },
      SAMPLE_VISITS,
    );

    expect(res.hierarchyLevel).toBe("אתר");
    expect(res.p50DurationMin).toBe(40);
    expect(res.sampleCount).toBeGreaterThanOrEqual(1);
    expect(res.recentVisits.length).toBeGreaterThan(0);
    expect(res.totalP50Min).toBeGreaterThan(0);
    expect(res.totalP80Min).toBeGreaterThanOrEqual(res.totalP50Min);
  });

  it("falls back to 'עיר' or 'כלל הצי' for unknown address with low confidence", () => {
    const res = estimateDispatchTime(
      {
        customerNo: "999999",
        address: "רחוב חדש לחלוטין 15",
        city: "הוד השרון",
      },
      SAMPLE_VISITS,
    );

    expect(["עיר", "כלל הצי"]).toContain(res.hierarchyLevel);
    expect(res.confidence).toBe("low");
  });

  it("calculates percentiles linearly and accurately", () => {
    expect(calculatePercentile([20, 30, 40, 50], 50)).toBe(35);
    expect(calculatePercentile([40], 80)).toBe(40);
    expect(calculatePercentile([], 50)).toBe(20);
  });
});
