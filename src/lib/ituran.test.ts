import { describe, expect, it } from "vitest";
import { mapLiveIturanVisit } from "./ituran";

describe("mapLiveIturanVisit", () => {
  it("maps source-labelled Ituran rows with plate, date, address and times", () => {
    const stop = mapLiveIturanVisit({
      "מקור המדידה": "איתוראן",
      "תאריך": "25/10/2026",
      "משאית": "615-41-002 משאית מרצדס מנוף",
      "כתובת": "רקפת 4, הוד השרון",
      "איתוראן: הגעה": "25/10/2026 09:10:00",
      "איתוראן: יציאה": "25/10/2026 09:42:00",
      "PTO פתיחה": "25/10/2026 09:15:00",
      "PTO סגירה": "25/10/2026 09:38:00",
      "PTO משך (דק׳)": "23",
    });
    expect(stop?.truck).toBe("615-41-002");
    expect(stop?.durationMin).toBe(32);
    expect(stop?.ptoEvents[0]?.durationMin).toBe(23);
    expect(stop?.address).toBe("רקפת 4, הוד השרון");
  });

  it("does not treat rows without explicit Ituran source as verified", () => {
    expect(mapLiveIturanVisit({
      "תאריך": "25/10/2026",
      "משאית": "615-41-002",
      "כתובת": "רקפת 4, הוד השרון",
      "איתוראן: הגעה": "25/10/2026 09:10:00",
      "איתוראן: יציאה": "25/10/2026 09:42:00",
    })).toBeNull();
  });

  it("rejects incomplete rows", () => {
    expect(mapLiveIturanVisit({
      "מקור המדידה": "איתוראן",
      "תאריך": "25/10/2026",
      "משאית": "615-41-002",
      "כתובת": "רקפת 4, הוד השרון",
    })).toBeNull();
  });
});
