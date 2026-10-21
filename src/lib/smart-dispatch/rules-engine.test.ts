// src/lib/smart-dispatch/rules-engine.test.ts
import { describe, it, expect } from "vitest";
import {
  identifyDriver,
  checkDiscOcrSuspicion,
  getEffectiveDiscMeta,
  verifyCustomerSignature,
  parseHandwrittenWindow,
  calculateDayExceptions,
} from "./rules-engine";
import type { RawDiscRecord, RawVisitRecord } from "./apps-script-contract";

describe("Smart Dispatch Rules Engine", () => {
  it("identifies driver Ali correctly from truck or name", () => {
    const iden1 = identifyDriver("עלי אבו עידה", "651-51-701");
    expect(iden1.driver).toBe("ali");
    expect(iden1.truck).toBe("651-51-701");

    const iden2 = identifyDriver("עלי", "");
    expect(iden2.driver).toBe("ali");
  });

  it("identifies driver Hekmat correctly, including Masarwa Rami crew mentions", () => {
    const iden1 = identifyDriver("חכמת גאבר", "615-41-002");
    expect(iden1.driver).toBe("hekmat");
    expect(iden1.truck).toBe("615-41-002");

    const iden2 = identifyDriver("חכמת / מסארוה ראמי", "615-41-002");
    expect(iden2.driver).toBe("hekmat");
  });

  it("detects suspicious OCR in tachograph discs (year 2020/2024, short plates, distorted names)", () => {
    const badDisc1: RawDiscRecord = {
      _row: 2,
      "תאריך דיסקית": "15/03/2020",
      "רישוי / משאית": "615-41-002",
      נהג: "חכמת",
    };
    const res1 = checkDiscOcrSuspicion(badDisc1);
    expect(res1.isSuspicious).toBe(true);
    expect(res1.reasons.some((r) => r.includes("2020"))).toBe(true);

    const badDisc2: RawDiscRecord = {
      _row: 3,
      "תאריך דיסקית": "21/10/2026",
      "רישוי / משאית": "615-41", // חסרות ספרות
      נהג: "ג'אבר מנאר", // שם מעוות
    };
    const res2 = checkDiscOcrSuspicion(badDisc2);
    expect(res2.isSuspicious).toBe(true);
    expect(res2.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("prioritizes corrected date and truck when available", () => {
    const disc: RawDiscRecord = {
      _row: 5,
      "תאריך דיסקית": "12/04/2020",
      "רישוי / משאית": "123",
      "תאריך מתוקן": "2026-10-21",
      "משאית מתוקנת": "615-41-002",
      "אושר ע״י": "ראמי",
      "אושר בתאריך": "2026-10-21 14:00",
    };
    const meta = getEffectiveDiscMeta(disc);
    expect(meta.effectiveDate).toBe("2026-10-21");
    expect(meta.effectiveTruck).toBe("615-41-002");
    expect(meta.isCorrected).toBe(true);
    expect(meta.isApproved).toBe(true);
    expect(meta.approvedBy).toBe("ראמי");
  });

  it("verifies customer signature strictly without speculation", () => {
    const sig1 = verifyCustomerSignature("https://drive.google.com/file/d/xyz", "");
    expect(sig1.hasSignature).toBe(true);
    expect(sig1.label).toBe("קיימת");

    const sig2 = verifyCustomerSignature("", "פריקה 08:00-08:45 חתימה של עמר");
    expect(sig2.hasSignature).toBe(true);

    const sig3 = verifyCustomerSignature("", "המתנה ממושכת");
    expect(sig3.hasSignature).toBe(false);
    expect(sig3.label).toBe("לא נמצאה");
  });

  it("handles reversed and outlier crane windows", () => {
    const normal = parseHandwrittenWindow("09:00 - 09:45");
    expect(normal.valid).toBe(true);
    expect(normal.durationMin).toBe(45);
    expect(normal.isReversed).toBe(false);

    // reversed: end before start
    const rev = parseHandwrittenWindow("11:30 - 10:15");
    expect(rev.valid).toBe(false);
    expect(rev.isReversed).toBe(true);

    // outlier: > 240 min
    const out = parseHandwrittenWindow("07:00 - 13:00"); // 360 min
    expect(out.valid).toBe(false);
    expect(out.isOutlier).toBe(true);
  });

  it("calculates deterministic exceptions accurately", () => {
    const disc: RawDiscRecord = {
      _row: 10,
      "תאריך דיסקית": "2026-10-21",
      "רישוי / משאית": "615-41-002",
      'סה"כ ק"מ': 100,
    };

    const visits: RawVisitRecord[] = [
      {
        _row: 1,
        "איתוראן: משך עצירה (דק׳)": 75,
        "PTO משך (דק׳)": 0, // עצירה מעל 60 דק' בלי PTO
        תעודות: "12345",
        כתובת: "הרצל 1, תל אביב",
        "חלון מנוף בכתב יד": "11:00 - 10:00", // הפוך
        "ק״מ מהעצירה הקודמת": 30, // 30 מול 100 בדיסקית -> פער ק"מ מעל 10%
      },
    ];

    const exceptions = calculateDayExceptions({ disc, visits });
    expect(exceptions.some((e) => e.type === "long_stop_no_pto")).toBe(true);
    expect(exceptions.some((e) => e.type === "reversed_window")).toBe(true);
    expect(exceptions.some((e) => e.type === "km_discrepancy")).toBe(true);
    expect(exceptions.some((e) => e.type === "missing_signature")).toBe(true);
  });
});
