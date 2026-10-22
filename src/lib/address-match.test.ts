import { describe, it, expect } from "vitest";
import {
  normalizeDate,
  parseAddressComponents,
  scoreAddressMatch,
  normalizeAddressToSiteKey,
} from "./address-match";
import { resolveTruck } from "./truck";
import { groupNotesIntoVisits, matchVisitsWithIturanStops } from "./cross-matcher";
import type { GalyaDeliveryNote, IturanStop } from "./types";

describe("address matching: דיוק", () => {
  it("מספר בית שונה באותו רחוב אינו התאמה", () => {
    const m = scoreAddressMatch("נח 3, תל אביב", "נח 5, תל אביב");
    expect(m.isMatch).toBe(false);
    expect(m.reasons.join(" ")).toContain("מספר שונה");
  });

  it("'נח' אינו מתאים ל'נחלת בנימין'", () => {
    expect(scoreAddressMatch("נח 3, תל אביב", "נחלת בנימין 3, תל אביב").isMatch).toBe(false);
  });

  it("עיר שונה באותו רחוב ומספר אינה התאמה", () => {
    expect(scoreAddressMatch("הרצל 5, רעננה", "הרצל 5, כפר סבא").isMatch).toBe(false);
  });

  it("מספר חסר באחד הצדדים עדיין מתאים (רחוב ועיר זהים)", () => {
    expect(scoreAddressMatch("הרקפת, הוד השרון", "רקפת 4, הוד השרון").isMatch).toBe(true);
  });

  it("כינויי עיר: 'תל אביב - יפו' שווה 'תל אביב'", () => {
    expect(normalizeAddressToSiteKey("שד׳ ירושלים 112, תל אביב - יפו")).toBe(
      normalizeAddressToSiteKey("ירושלים 112, תל אביב"),
    );
  });

  it("לא מפרש מספר כעיר כשאין פסיק", () => {
    const p = parseAddressComponents("רחוב חדש לחלוטין 15");
    expect(p.city).toBe("");
    expect(p.number).toBe("15");
  });

  it("מנרמל תאריכים בפורמטים שונים", () => {
    expect(normalizeDate("5/10/2026")).toBe("05/10/2026");
    expect(normalizeDate("2026-10-05")).toBe("05/10/2026");
    expect(normalizeDate("15/10/2026 07:12:00")).toBe("15/10/2026");
    expect(normalizeDate("זבל")).toBe("");
  });
});

describe("truck resolution", () => {
  it("מסיק משאית משם נהג כשאין רישוי", () => {
    expect(resolveTruck("", "חכמת")).toEqual({ plate: "615-41-002", inferred: true });
  });
  it("מעדיף רישוי מפורש", () => {
    expect(resolveTruck("651-51-701 משאית איסוזו", "חכמת")).toEqual({
      plate: "651-51-701",
      inferred: false,
    });
  });
  it("מחזיר ריק כשאין רישוי ואין נהג מוכר", () => {
    expect(resolveTruck("", "נהג לא ידוע")).toEqual({ plate: "", inferred: false });
  });
});

const note = (over: Partial<GalyaDeliveryNote>): GalyaDeliveryNote => ({
  docDate: "15/10/2026",
  docTime: "06:00",
  noteId: "1",
  customerName: "לקוח",
  deliveryAddress: "הרצל 5, רעננה",
  driverRaw: "חכמת",
  truckRaw: "",
  ...over,
});

const stop = (over: Partial<IturanStop>): IturanStop => ({
  id: "s",
  truck: "615-41-002",
  driver: "חכמת",
  date: "15/10/2026",
  startTime: "15/10/2026 08:05:00",
  endTime: "15/10/2026 08:45:00",
  durationMin: 40,
  address: "הרצל 5, רעננה",
  normalizedSiteKey: "",
  cumulativeKm: 10,
  ptoEvents: [],
  ...over,
});

describe("visits and matching", () => {
  it("נהג בלי רישוי מקבל משאית מוסקת ודגל", () => {
    const [v] = groupNotesIntoVisits([note({})]);
    expect(v?.truck).toBe("615-41-002");
    expect(v?.qualityFlags).toContain("משאית הוסקה מהנהג");
  });

  it("בלי רישוי ובלי נהג מוכר: משאית חסרה", () => {
    const [v] = groupNotesIntoVisits([note({ driverRaw: "מישהו" })]);
    expect(v?.truck).toBe("חסרה משאית");
    expect(v?.qualityFlags).toContain("משאית חסרה");
  });

  const morning = note({
    noteId: "A",
    craneTimeRaw: "פריקת מנוף משעה 8:00 עד שעה 8:40",
  });
  const afternoon = note({
    noteId: "B",
    craneTimeRaw: "פריקת מנוף משעה 13:00 עד שעה 13:30",
  });

  it("מפצל שני ביקורים באותו אתר באותו יום", () => {
    const visits = groupNotesIntoVisits([afternoon, morning]);
    expect(visits.length).toBe(2);
    expect(visits[0]?.noteIds).toEqual(["A"]);
    expect(visits[1]?.visitKey.endsWith("#2")).toBe(true);
  });

  it("משבץ כל ביקור לעצירה הנכונה לפי חפיפת זמנים", () => {
    const visits = groupNotesIntoVisits([morning, afternoon]);
    const stops = [
      stop({
        id: "aft",
        startTime: "15/10/2026 13:05:00",
        endTime: "15/10/2026 13:35:00",
        durationMin: 30,
      }),
      stop({ id: "morn" }),
    ];
    const { matchedVisits, matchedStopsCount, unmatchedStopsCount } = matchVisitsWithIturanStops(
      visits,
      stops,
    );
    expect(matchedStopsCount).toBe(2);
    expect(unmatchedStopsCount).toBe(0);
    expect(matchedVisits[0]?.ituranDurationMin).toBe(40);
    expect(matchedVisits[1]?.ituranDurationMin).toBe(30);
  });

  it("תאריך בפורמט שונה בעצירה עדיין מתאים", () => {
    const visits = groupNotesIntoVisits([morning]);
    const { matchedStopsCount } = matchVisitsWithIturanStops(visits, [stop({ date: "2026-10-15" })]);
    expect(matchedStopsCount).toBe(1);
  });
});