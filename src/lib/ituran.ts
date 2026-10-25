/**
 * Saban Flow — Ituran client library (v2)
 * הצלבת תעודות משלוח מול עצירות GPS + כללי שהייה.
 * ללא עלות עסקית — רק זמנים, כתובות ולוחיות.
 */

import type { AuditStatus, DeliveryNote } from "./data";

export type GpsStop = {
  plate: string;
  address: string;
  arrive: string;
  depart: string;
  driver?: string;
  durationMin?: number;
};

export type IturanVisit = {
  key: string;
  docNumber: string;
  date: string;
  customer: string;
  customerNo?: string;
  address: string;
  driver: string;
  truck: string;
  itArrive: string;
  itDepart: string;
  itStop: number;
  itKm?: number | string;
  travelMin?: number | string;
  itAddr?: string;
  matchScore?: number | string;
  ptoOpen?: string;
  ptoClose?: string;
  ptoMin?: number | string;
  crane?: string;
  status: AuditStatus;
};

export type PlateSummary = {
  plate: string;
  stops: number;
  totalMin: number;
  driver: string;
};

export type DriverId = "hikmat" | "ali";

export const DRIVER_FLEET: Record<
  DriverId,
  { name: string; plate: string; kind: "crane" | "flatbed"; label: string }
> = {
  hikmat: {
    name: "חכמת",
    plate: "615-41-002",
    kind: "crane",
    label: "חכמת · מנוף 615-41-002",
  },
  ali: {
    name: "עלי",
    plate: "651-51-701",
    kind: "flatbed",
    label: "עלי · פלטה 651-51-701",
  },
};

/** דק׳ שהייה צפויות לפי סוג רכב */
export const DWELL_RULES = {
  crane: [25, 45] as [number, number],
  flatbed: [15, 25] as [number, number],
};

const toMin = (t: string) => {
  const clean = String(t || "00:00").trim();
  const m = clean.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
};

export function normalizePlate(raw?: string): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return String(raw).trim();
}

export function plateOfDriver(driverName?: string): string {
  const d = String(driverName || "");
  if (/עלי/i.test(d)) return DRIVER_FLEET.ali.plate;
  if (/חכמת|אנג.?ל|מסארוה/i.test(d) && !/עלי/i.test(d)) {
    // מסארוה ראמי לפעמים על תעודה — לא בהכרח לוחית
    if (/חכמת|אנג/i.test(d)) return DRIVER_FLEET.hikmat.plate;
  }
  if (/חכמת|אנג/i.test(d)) return DRIVER_FLEET.hikmat.plate;
  return "";
}

export function kindOfPlate(plate: string): "crane" | "flatbed" {
  const p = normalizePlate(plate);
  if (p === DRIVER_FLEET.ali.plate || p.includes("651")) return "flatbed";
  return "crane";
}

/** Cross-match one delivery note against GPS stops */
export function crossMatch(
  note: Pick<DeliveryNote, "siteAddress" | "signedBy" | "driver" | "date"> &
    Record<string, unknown>,
  kind: "crane" | "flatbed",
  plate: string,
  stops: GpsStop[],
): { status: AuditStatus; dwell: number | null; label: string; stop?: GpsStop } {
  const siteStr = String(
    note?.siteAddress ||
      note?.["כתובת אתר"] ||
      note?.["כתובת יעד"] ||
      note?.["כתובת אספקה"] ||
      note?.site ||
      "",
  );
  const street =
    (siteStr.split(",")[0] ?? "")
      .replace(/רח׳|שד׳|רח'|שד'/g, "")
      .trim()
      .split(" ")[0] ?? "";

  const targetPlate = normalizePlate(plate).replace(/\D/g, "");

  const stop = (Array.isArray(stops) ? stops : []).find((s) => {
    const sPlate = normalizePlate(
      String(s.plate || (s as Record<string, unknown>)["מספר רישוי"] || ""),
    ).replace(/\D/g, "");
    const sAddr = String(
      s.address ||
        (s as Record<string, unknown>)["כתובת לקוח מאותרת"] ||
        (s as Record<string, unknown>)["כתובת"] ||
        "",
    );
    if (!sPlate || !targetPlate) return false;
    return sPlate === targetPlate && (!street || sAddr.includes(street));
  });

  if (!stop) return { status: "fail", dwell: null, label: "🔴 רכב לא שהה בכתובת" };

  const arriveStr = String(stop.arrive || "08:00");
  const departStr = String(stop.depart || "08:30");
  const signedStr = String(note?.signedBy || note?.signedAt || "08:15");

  const normalizedStop: GpsStop = {
    plate: normalizePlate(stop.plate) || plate,
    address: stop.address || siteStr,
    arrive: arriveStr,
    depart: departStr,
    driver: stop.driver,
  };

  const dwell =
    stop.durationMin ??
    Math.max(0, toMin(departStr) - toMin(arriveStr));
  const [min, max] = DWELL_RULES[kind] || DWELL_RULES.crane;
  const sign = toMin(signedStr.match(/\d{1,2}:\d{2}/)?.[0] || signedStr);
  const signInside =
    !sign ||
    (sign >= toMin(arriveStr) - 10 && sign <= toMin(departStr) + 15);

  if (dwell >= min - 5 && dwell <= max + 15 && signInside) {
    return {
      status: "ok",
      dwell,
      stop: normalizedStop,
      label: "🟢 אומת ב-100% באיתוראן",
    };
  }
  return {
    status: "warn",
    dwell,
    stop: normalizedStop,
    label: "⚠️ סטיית זמן חריגה",
  };
}

/** Parse rows from Ituran export / Sheet — Hebrew/English headers */
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
      plate: normalizePlate(pick(r, ["רכב", "רישוי", "תג", "plate", "Plate"])),
      address: pick(r, ["כתובת", "מיקום", "address", "Address"]),
      arrive: time(pick(r, ["כניסה", "הגעה", "arrive", "Arrival", "זמן הודעה"])) || "08:30",
      depart: time(pick(r, ["יציאה", "עזיבה", "depart", "Departure", "סיום"])) || "09:00",
      driver: pick(r, ["נהג", "driver", "Driver"]),
    }))
    .filter((s) => Boolean(s.plate));
}

export function visitStatusLabel(status: AuditStatus): string {
  if (status === "ok") return "🟢 אומת";
  if (status === "warn") return "⚠️ סטייה";
  return "🔴 לא הותאם";
}

export function groupStopsByDriver(stops: GpsStop[]): Record<DriverId, GpsStop[]> {
  const out: Record<DriverId, GpsStop[]> = { hikmat: [], ali: [] };
  for (const s of stops) {
    const p = normalizePlate(s.plate).replace(/\D/g, "");
    if (p.includes("651") || p === "65151701") out.ali.push(s);
    else out.hikmat.push(s);
  }
  return out;
}

/** דמו — עד להחלפה בדוח אמיתי מהשרת */
export const SAMPLE_STOPS: GpsStop[] = [
  {
    plate: "615-41-002",
    address: "ירמיהו 11 רמת גן",
    arrive: "07:50",
    depart: "08:22",
    driver: "חכמת",
  },
  {
    plate: "615-41-002",
    address: "נח 3 תל אביב",
    arrive: "06:10",
    depart: "06:45",
    driver: "חכמת",
  },
  {
    plate: "615-41-002",
    address: "הורדים 19 סביון",
    arrive: "08:28",
    depart: "08:58",
    driver: "חכמת",
  },
  {
    plate: "615-41-002",
    address: "ת.דלק פז חגור",
    arrive: "09:38",
    depart: "10:06",
    driver: "חכמת",
  },
  {
    plate: "651-51-701",
    address: "בורוכוב 28 תל אביב",
    arrive: "07:12",
    depart: "07:30",
    driver: "עלי",
  },
  {
    plate: "651-51-701",
    address: "העוגב 15 קרני שומרון",
    arrive: "11:20",
    depart: "12:45",
    driver: "עלי",
  },
];
