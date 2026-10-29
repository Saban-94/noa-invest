import { describe, expect, it } from "vitest";
import {
  inquiryTabForStatus,
  isTodayInIsrael,
  notificationAccepted,
  parseTabParam,
  parseTaskParam,
  statusTone,
} from "./workroom-ui";
import type { InquiryTask } from "./inquiry-workflow";

describe("parseTaskParam", () => {
  it("accepts numeric task (TanStack parses ?task=6715841 as a number)", () => {
    expect(parseTaskParam(6715841)).toBe("6715841");
  });
  it("accepts strings and trims", () => {
    expect(parseTaskParam(" INQ-12 ")).toBe("INQ-12");
  });
  it("rejects empty / invalid", () => {
    expect(parseTaskParam("")).toBeUndefined();
    expect(parseTaskParam(undefined)).toBeUndefined();
    expect(parseTaskParam(Number.NaN)).toBeUndefined();
    expect(parseTaskParam({})).toBeUndefined();
  });
});

describe("parseTabParam / inquiryTabForStatus", () => {
  it("only allows known tabs", () => {
    expect(parseTabParam("tasks")).toBe("tasks");
    expect(parseTabParam("nope")).toBeUndefined();
  });
  it("maps status to the right /inquiry tab", () => {
    expect(inquiryTabForStatus("returned_to_rami")).toBe("tasks");
    expect(inquiryTabForStatus("pending_harel")).toBe("pending_harel");
    expect(inquiryTabForStatus("approved")).toBe("all");
  });
});

describe("statusTone", () => {
  const openTask = (dueAt: string): InquiryTask => ({
    id: "t",
    inquiryId: "i",
    noteId: "n",
    status: "open",
    assignedTo: "rami",
    createdBy: "harel",
    reason: "r",
    dueAt,
    nudgeEveryMin: 60,
    nudgeCount: 0,
    createdAt: new Date().toISOString(),
  });
  it("uses the semantic palette", () => {
    expect(statusTone("pending_harel")).toBe("amber");
    expect(statusTone("returned_to_rami")).toBe("orange");
    expect(statusTone("approved")).toBe("emerald");
  });
  it("overdue open task wins", () => {
    expect(statusTone("returned_to_rami", openTask("2000-01-01T00:00:00Z"))).toBe("destructive");
  });
});

describe("isTodayInIsrael", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  it("matches the same Israeli calendar day", () => {
    expect(isTodayInIsrael("2026-10-28T22:30:00Z", now)).toBe(true); // 00:30 IL on the 29th
    expect(isTodayInIsrael("2026-10-28T20:00:00Z", now)).toBe(false);
  });
  it("handles empty / invalid", () => {
    expect(isTodayInIsrael("", now)).toBe(false);
    expect(isTodayInIsrael("not a date", now)).toBe(false);
  });
});

describe("notificationAccepted", () => {
  it("requires a non-empty id and no errors", () => {
    expect(notificationAccepted({ id: "abc", errors: "" })).toBe(true);
    expect(notificationAccepted({ id: "", errors: "" })).toBe(false);
    expect(
      notificationAccepted({ id: "abc", errors: '["All included players are not subscribed"]' }),
    ).toBe(false);
    expect(notificationAccepted({ id: "abc", errors: [] })).toBe(true);
    expect(notificationAccepted(null)).toBe(false);
  });
});
