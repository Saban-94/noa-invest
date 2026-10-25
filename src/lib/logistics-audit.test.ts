import { describe, expect, it } from "vitest";
import type { DeliveryNote } from "@/lib/data";
import { buildLogisticsFindings, isLogisticsAuditComplete } from "./logistics-audit";

const baseNote: DeliveryNote = {
  id: "TEST-1",
  customer: "לקוח בדיקה",
  date: "2026-10-25",
  comaxOrder: "ORDER-1",
  fileId: "file-1",
  driver: "נהג בדיקה",
  items: [
    { name: "משטח סבן פקדון (60060)", qty: 8, ordered: 10, weightKg: 25, unit: "משטח" },
    { name: "הובלת מנוף (70001)", qty: 1, ordered: 1, weightKg: 0, unit: "משלוח" },
  ],
  deposits: {
    bales60002: { delivered: 0, billed: 0 },
    pallets60060: { delivered: 2, billed: 1 },
  },
  gps: { status: "ok", note: "אומת במקור בדיקה" },
};

describe("logistics audit", () => {
  it("flags quantity, deposit, and transport evidence issues", () => {
    const findings = buildLogisticsFindings(baseNote);
    expect(findings.some((item) => item.id === "item:60060:quantity")).toBe(true);
    expect(findings.some((item) => item.id === "deposit:60060:mismatch")).toBe(true);
    expect(findings.some((item) => item.id === "item:70001:transport-proof")).toBe(true);
  });

  it("blocks live records until source cross-check and transport verification are documented", () => {
    const findings = buildLogisticsFindings({ ...baseNote, live: true });
    expect(findings.some((item) => item.id === "source:live")).toBe(true);
    expect(findings.some((item) => item.id === "tracking:transport")).toBe(true);
  });

  it("requires a meaningful evidence note for every finding", () => {
    const findings = buildLogisticsFindings(baseNote);
    expect(isLogisticsAuditComplete(findings, {})).toBe(false);
    const evidence = Object.fromEntries(findings.map((item) => [item.id, "PDF page 2, line 4; source checked"]));
    expect(isLogisticsAuditComplete(findings, evidence)).toBe(true);
    expect(isLogisticsAuditComplete(findings, { ...evidence, [findings[0].id]: "ok" })).toBe(false);
  });
});
