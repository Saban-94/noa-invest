import { describe, it, expect } from "vitest";
import { sheetNoteToGalya } from "./live-adapter";
import { groupNotesIntoVisits } from "./cross-matcher";
import type { SheetNote } from "../notes-api.functions";

const base: SheetNote = {
  id: "6715766",
  key: "k1",
  date: "2026-10-15",
  time: "06:29",
  docNumber: "6715766",
  comaxOrder: "6215960",
  customerNo: "632122",
  customer: "א.ערן אזולאי",
  address: "משה שרת 9, הוד השרון",
  driver: "חכמת",
  truck: "",
  fileId: "",
  driveUrl: "",
  items: [
    { sku: "1", name: "חול", qty: 5, unit: "בלה" },
    { sku: "2", name: "מלט", qty: 20, unit: "שק" },
  ],
  depositsText: "בלות 60002: 5",
  craneNotes: "פריקת מנוף משעה 9:20 עד שעה 10:00",
  extractStatus: "OK",
  approvalStatus: "",
  signedUrl: "",
  ramiApprovedAt: "",
  harelApprovedAt: "",
};

describe("live-adapter", () => {
  it("ממיר שורת גיליון ומנרמל תאריך", () => {
    const g = sheetNoteToGalya(base);
    expect(g.noteId).toBe("6715766");
    expect(g.docDate).toBe("15/10/2026");
    expect(g.itemsSummary).toBe("5 בלה חול + 20 שק מלט");
    expect(g.craneTimeRaw).toContain("9:20");
  });

  it("הביקור שנבנה מתעודה חיה מסיק משאית מהנהג ומחשב כתב יד", () => {
    const [v] = groupNotesIntoVisits([sheetNoteToGalya(base)]);
    expect(v?.truck).toBe("615-41-002");
    expect(v?.handwrittenUnloadMin).toBe(40);
    expect(v?.measurementSource).toBe("handwritten");
  });

  it("שדות חסרים לא קורסים", () => {
    const g = sheetNoteToGalya({ ...base, items: [], address: "", driver: "" });
    expect(g.itemsSummary).toBe("");
    expect(g.deliveryAddress).toBe("");
  });
});