import { describe, expect, it } from "vitest";
import {
  asksCurrentGps,
  asksSourceStatus,
  evidenceFromMeta,
  gpsUnavailableMessage,
  buildNoaContext,
} from "./chat-grounding";

describe("chat-grounding P0", () => {
  it("detects current GPS questions", () => {
    expect(asksCurrentGps("איפה המשאית שלי כרגע?")).toBe(true);
    expect(asksCurrentGps("מה מזג האוויר")).toBe(false);
  });

  it("detects source-status questions", () => {
    expect(asksSourceStatus("אילו נתונים זמינים כרגע?")).toBe(true);
  });

  it("GPS message does not invent location", () => {
    const m = gpsUnavailableMessage();
    expect(m).toMatch(/אין לי כרגע מיקום GPS/);
    expect(m).not.toMatch(/615-41-002/);
  });

  it("evidence from meta without live notes is unavailable", () => {
    expect(evidenceFromMeta(null)).toBe("unavailable");
    expect(evidenceFromMeta({ notesSource: "unavailable", ituranSource: "none" })).toBe(
      "unavailable",
    );
  });

  it("evidence from live notes is from_store", () => {
    expect(
      evidenceFromMeta({ notesSource: "live", notesCount: 3, ituranSource: "none" }),
    ).toBe("from_store");
  });

  it("context JSON forbids demo and marks no live GPS", () => {
    const ctx = JSON.parse(
      buildNoaContext({
        meta: { notesSource: "live", notesCount: 1, ituranSource: "none" },
        fetchedAt: "2026-10-26T00:00:00.000Z",
        notes: [{ id: "1", customer: "בדיקה" }],
        visits: [],
        discrepancies: [],
        question: "מה הסטטוס?",
      }),
    );
    expect(ctx.constraints.demoReportsForbidden).toBe(true);
    expect(ctx.constraints.noLiveGps).toBe(true);
    expect(ctx.notesSample[0].id).toBe("1");
  });
});
