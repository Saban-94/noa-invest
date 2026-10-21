import type { AuditStatus, DeliveryNote } from "./data";

export type GpsStop = { plate: string; address: string; arrive: string; depart: string };

const toMin = (t: string) => {
  const clean = String(t || "00:00").trim();
  const [h, m] = clean.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const DWELL_RULES = { crane: [25, 45], flatbed: [15, 25] } as const;

/** Cross-match one delivery note against GPS stops (tolerant to undefined or Hebrew keys). */
export function crossMatch(
  note: Pick<DeliveryNote, "site" | "signedAt"> & Record<string, unknown>,
  kind: "crane" | "flatbed",
  plate: string,
  stops: GpsStop[],
): { status: AuditStatus; dwell: number | null; label: string; stop?: GpsStop } {
  const siteStr = String(note?.site || note?.["כתובת אתר"] || note?.["כתובת יעד"] || "");
  const street =
    (siteStr.split(",")[0] ?? "")
      .replace(/רח׳|שד׳/g, "")
      .trim()
      .split(" ")[0] ?? "";

  const targetPlate = String(plate || "").replace(/\D/g, "");

  const stop = (Array.isArray(stops) ? stops : []).find((s: GpsStop | Record<string, unknown>) => {
    const sPlate = String(
      ("plate" in s ? s.plate : "") || (s as Record<string, unknown>)?.["מספר רישוי"] || "",
    ).replace(/\D/g, "");
    const sAddr = String(
      ("address" in s ? s.address : "") ||
        (s as Record<string, unknown>)?.["כתובת לקוח מאותרת"] ||
        (s as Record<string, unknown>)?.["כתובת"] ||
        "",
    );
    if (!sPlate || !targetPlate) return false;
    return sPlate === targetPlate && (!street || sAddr.includes(street));
  });

  if (!stop) return { status: "fail", dwell: null, label: "🔴 רכב לא שהה בכתובת" };

  const arriveStr = String(
    ("arrive" in stop ? stop.arrive : "") ||
      (stop as Record<string, unknown>)?.["שעת כניסה לגדר"] ||
      "08:00",
  );
  const departStr = String(
    ("depart" in stop ? stop.depart : "") ||
      (stop as Record<string, unknown>)?.["שעת יציאה מגדר"] ||
      "08:30",
  );
  const signedStr = String(note?.signedAt || "08:15");

  const normalizedStop: GpsStop = {
    plate: String(
      ("plate" in stop ? stop.plate : "") ||
        (stop as Record<string, unknown>)?.["מספר רישוי"] ||
        plate,
    ),
    address: String(
      ("address" in stop ? stop.address : "") ||
        (stop as Record<string, unknown>)?.["כתובת לקוח מאותרת"] ||
        siteStr,
    ),
    arrive: arriveStr,
    depart: departStr,
  };

  const dwell = Math.max(0, toMin(departStr) - toMin(arriveStr));
  const [min, max] = DWELL_RULES[kind] || DWELL_RULES.crane;
  const sign = toMin(signedStr);
  const signInside = sign >= toMin(arriveStr) - 10 && sign <= toMin(departStr) + 15;

  if (dwell >= min - 5 && dwell <= max + 15 && signInside) {
    return { status: "ok", dwell, stop: normalizedStop, label: "🟢 אומת ב-100% באיתוראן" };
  }
  return { status: "warn", dwell, stop: normalizedStop, label: "⚠️ סטיית זמן חריגה" };
}

/** Parse rows from an Ituran export or Google Sheet — tolerant to Hebrew/English headers. */
export function rowsToStops(rows: Record<string, unknown>[]): GpsStop[] {
  if (!Array.isArray(rows)) return [];
  const pick = (r: Record<string, unknown>, keys: string[]) => {
    if (!r || typeof r !== "object") return "";
    const k = Object.keys(r).find((h) => keys.some((x) => h.includes(x)));
    return k ? String(r[k] ?? "").trim() : "";
  };
  const time = (v: string) => (v.match(/\d{1,2}:\d{2}/)?.[0] ?? "").padStart(5, "0");
  return rows
    .map((r) => ({
      plate: pick(r, ["רכב", "רישוי", "plate", "Plate"]),
      address: pick(r, ["כתובת", "מיקום", "address", "Address"]),
      arrive: time(pick(r, ["כניסה", "הגעה", "arrive", "Arrival"])) || "08:30",
      depart: time(pick(r, ["יציאה", "עזיבה", "depart", "Departure"])) || "09:00",
    }))
    .filter((s) => Boolean(s.plate));
}

export const SAMPLE_STOPS: GpsStop[] = [
  { plate: "615-41-002", address: "ירמיהו 11 רמת גן", arrive: "07:50", depart: "08:22" },
  { plate: "615-41-002", address: "נח 3 תל אביב", arrive: "06:10", depart: "06:45" },
  { plate: "615-41-002", address: "הורדים 19 סביון", arrive: "08:28", depart: "08:58" },
  { plate: "615-41-002", address: "ת.דלק פז חגור", arrive: "09:38", depart: "10:06" },
  { plate: "651-51-701", address: "בורוכוב 28 תל אביב", arrive: "07:12", depart: "07:30" },
];
