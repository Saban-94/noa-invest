import { describe, it, expect } from "vitest";
import { buildCatalog, expectedDeposits, orderWeight } from "./catalog";

const H = {
  sku: 'מק"ט (SKU)', name: "שם מוצר רשמי (קומקס)", cat: "קטגוריה לוגיסטית",
  unit: "יחידת מידה", dep: "סיווג וחישוב פקדונות", w: "משקל יח' (ק\"ג)",
  ws: "סטטוס משקל", ds: "סיווג פקדון מאומת",
};
const row = (sku: string, dep: string, w: string, cat = "מליטה וצמנט", n = 2) => ({
  _row: n, [H.sku]: sku, [H.name]: sku, [H.cat]: cat, [H.unit]: "שק",
  [H.dep]: dep, [H.w]: w, [H.ws]: Number(w) > 0 ? "מאומת" : "חסר", [H.ds]: "מאומת",
});

describe("catalog", () => {
  it("rounds pallets up and counts bales 1:1", () => {
    const cat = buildCatalog([
      row("10002", "משטח סבן (40 שקים) (מק\"ט 60060)", "25", "מליטה וצמנט", 2),
      row("11501", "בלה (1:1 מק\"ט 60002)", "700", "שקים גדולים (בלות)", 3),
    ]);
    const r = expectedDeposits([{ sku: "10002", qty: 41 }, { sku: "11501", qty: 3 }], cat);
    expect(r.required["60060"]).toBe(2);
    expect(r.required["60002"]).toBe(3);
    expect(r.complete).toBe(true);
  });

  it("blocks conflicting duplicate SKUs", () => {
    const cat = buildCatalog([
      row("10011", "משטח סבן (40 שקים)", "25", "מליטה וצמנט", 4),
      row("10011", "ללא", "25", "מליטה וצמנט", 5),
    ]);
    const r = expectedDeposits([{ sku: "10011", qty: 40 }], cat);
    expect(r.complete).toBe(false);
    expect(r.unresolved[0]?.sku).toBe("10011");
  });

  it("treats zero weight as unknown, not zero", () => {
    const cat = buildCatalog([
      row("10002", "משטח סבן (40 שקים)", "25", "מליטה וצמנט", 2),
      row("15109", "ללא", "0", "דבקים ומליטה", 6),
    ]);
    const w = orderWeight([{ sku: "10002", qty: 4 }, { sku: "15109", qty: 1 }], cat);
    expect(w.knownKg).toBe(100);
    expect(w.complete).toBe(false);
  });

  it("does not treat a positive weight as verified when the status column is absent", () => {
    const cat = buildCatalog([{ _row: 2, [H.sku]: "10002", [H.name]: "test", [H.cat]: "מליטה וצמנט", [H.unit]: "שק", [H.dep]: "ללא", [H.w]: "25" }]);
    const w = orderWeight([{ sku: "10002", qty: 1 }], cat);
    expect(w.complete).toBe(false);
    expect(w.unknown[0]?.reason).toContain("לא מאומת");
  });
});
