/**
 * Saban Flow — Ituran client library (v2.1)
 * הצלבת תעודות מול עצירות GPS · מקורות: גיליון / XLSX / SAMPLE
 */

import type { AuditStatus, DeliveryNote } from "./data";

export type GpsStop = {
  plate: string;
  address: string;
  arrive: string;
  depart: string;
  driver?: string;
  durationMin?: number;
  dateKey?: string;
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

export const DWELL_RULES = {
  crane: [25, 45] as [number, number],
  flatbed: [15, 25] as [number, number],
};

const toMin = (t: string) => {
  const m = String(t || "")
    .trim()
    .match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
};

export function normalizePlate(raw?: string): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 7) {
    const d = digits.slice(0, 8);
    if (d.length === 8) {
      return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
    }
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }
  return String(raw).trim();
}

export function plateDigits(raw?: string): string {
  return normalizePlate(raw).replace(/\D/g, "");
}

export function plateOfDriver(driverName?: string): string {
  const d = String(driverName || "");
  if (/עלי/i.test(d)) return DRIVER_FLEET.ali.plate;
  if (/חכמת|אנג.?ל/i.test(d)) return DRIVER_FLEET.hikmat.plate;
  return "";
}

export function kindOfPlate(plate: string): "crane" | "flatbed" {
  const p = plateDigits(plate);
  if (p.includes("651") || p === "65151701") return "flatbed";
  return "crane";
}

/** "בעלי מלאכה 22, תל אביב" → "בעלי מלאכה" */
export function extractStreet(siteStr: string): string {
  const part =
    String(siteStr || "")
      .split(/[,،]/)[0]
      ?.replace(/רח׳|רח'|שד׳|שד'/g, "")
      .replace(/"/g, "")
      .trim() || "";
  return part
    .replace(/\d+[א-ת]?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatNoteDate(d: unknown): string {
  if (!d) return "";
  if (d instanceof Date && !isNaN(+d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  const s = String(d).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s.split(/\s+/)[0] || s;
  const parsed = new Date(s);
  if (!isNaN(+parsed)) {
    const dd = String(parsed.getDate()).padStart(2, "0");
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${parsed.getFullYear()}`;
  }
  return s;
}

export function dateKeyFromNote(d: unknown): string {
  const formatted = formatNoteDate(d);
  const m = formatted.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

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
  const street = extractStreet(siteStr);
  const streetTokens = street.split(/\s+/).filter((w) => w.length > 1);
  const targetPlate = plateDigits(plate);
  const noteDay = dateKeyFromNote(note?.date);

  const candidates = (Array.isArray(stops) ? stops : []).filter((s) => {
    const sPlate = plateDigits(s.plate);
    if (!sPlate || !targetPlate || sPlate !== targetPlate) return false;
    if (s.dateKey && noteDay && s.dateKey !== noteDay) return false;
    return true;
  });

  let best: GpsStop | undefined;
  let bestScore = 0;

  for (const s of candidates) {
    const sAddr = String(s.address || "");
    let sc = 0;
    if (street && sAddr.includes(street)) sc += 4;
    else {
      sc += streetTokens.filter((t) => sAddr.includes(t)).length;
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }

  if (!best || bestScore < 1) {
    return { status: "fail", dwell: null, label: "🔴 רכב לא שהה בכתובת" };
  }

  const arriveStr = String(best.arrive || "08:00");
  const departStr = String(best.depart || "08:30");
  const dwell =
    best.durationMin ?? Math.max(0, toMin(departStr) - toMin(arriveStr));
  const [min, max] = DWELL_RULES[kind] || DWELL_RULES.crane;

  if (dwell >= min - 5 && dwell <= max + 15) {
    return { status: "ok", dwell, stop: best, label: "🟢 אומת באיתוראן" };
  }
  return {
    status: "warn",
    dwell,
    stop: best,
    label: "⚠️ סטיית זמן חריגה",
  };
}

export function visitsToStops(visits: IturanVisit[]): GpsStop[] {
  return visits
    .filter((v) => v.itArrive && v.truck)
    .map((v) => ({
      plate: normalizePlate(v.truck),
      address: v.itAddr || v.address || "",
      arrive: v.itArrive,
      depart: v.itDepart || v.itArrive,
      driver: v.driver,
      durationMin: v.itStop || undefined,
      dateKey: dateKeyFromNote(v.date),
    }));
}

export function rowsToStops(rows: Record<string, unknown>[]): GpsStop[] {
  if (!Array.isArray(rows)) return [];
  const pick = (r: Record<string, unknown>, keys: string[]) => {
    if (!r || typeof r !== "object") return "";
    const k = Object.keys(r).find((h) => keys.some((x) => String(h).includes(x)));
    return k ? String(r[k] ?? "").trim() : "";
  };
  const time = (v: string) => (v.match(/\d{1,2}:\d{2}/)?.[0] ?? "").padStart(5, "0");

  return rows
    .map((r) => {
      const plate = normalizePlate(
        pick(r, ["תג זיהוי", "רכב", "רישוי", "plate", "Plate"]),
      );
      const endRaw = pick(r, ["זמן סיום עצירה", "סיום", "depart", "Departure"]);
      if (!plate || !endRaw) return null;
      const startRaw = pick(r, ["זמן הודעה", "כניסה", "הגעה", "arrive", "Arrival"]);
      const datePart = (startRaw || endRaw).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      let dateKey = "";
      if (datePart) {
        let y = parseInt(datePart[3], 10);
        if (y < 100) y += 2000;
        dateKey = `${y}-${datePart[2].padStart(2, "0")}-${datePart[1].padStart(2, "0")}`;
      }
      return {
        plate,
        address: pick(r, ["כתובת", "מיקום", "address"]),
        arrive: time(startRaw) || "08:00",
        depart: time(endRaw) || "08:30",
        driver: pick(r, ["שם נהג", "נהג", "driver"]),
        dateKey: dateKey || undefined,
      } as GpsStop;
    })
    .filter(Boolean) as GpsStop[];
}

export function visitStatusLabel(status: AuditStatus): string {
  if (status === "ok") return "🟢 אומת";
  if (status === "warn") return "⚠️ סטייה";
  return "🔴 לא הותאם";
}

export function groupStopsByDriver(stops: GpsStop[]): Record<DriverId, GpsStop[]> {
  const out: Record<DriverId, GpsStop[]> = { hikmat: [], ali: [] };
  for (const s of stops) {
    const p = plateDigits(s.plate);
    if (p.includes("651")) out.ali.push(s);
    else out.hikmat.push(s);
  }
  return out;
}

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


/* Live Ituran source adapter — reads persisted Apps Script visit rows only. */
import type { IturanStop, PtoEvent } from "@/lib/smart-dispatch/types";

type AppsScriptVisit = Record<string, unknown>;
export type LiveIturanResult = { source: "live" | "none"; stops: IturanStop[]; error?: string };

function gasValue(row: AppsScriptVisit, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}
function gasDate(value: string): string {
  const s = value.trim();
  let m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${String(Number(m[1])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${year}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function gasDateTime(value: string, date: string): string {
  if (!value) return "";
  const full = value.match(/(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (full) {
    const d = gasDate(full[1]!);
    const t = full[2]!.length === 5 ? `${full[2]}:00` : full[2]!;
    return d ? `${d} ${t}` : "";
  }
  const time = value.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!time || !date) return "";
  const t = time[1]!.length === 5 ? `${time[1]}:00` : time[1]!;
  return `${date} ${t}`;
}
function gasMinutesBetween(start: string, end: string): number {
  const parse = (value: string): number => {
    const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return NaN;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  };
  const a = parse(start), b = parse(end);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 60000) : 0;
}
export function mapLiveIturanVisit(row: AppsScriptVisit): IturanStop | null {
  if (!/איתוראן|ituran/i.test(gasValue(row, ["מקור המדידה", "מקור מדידה", "measurementSource", "source"]))) return null;
  const truckRaw = gasValue(row, ["משאית", "רישוי / משאית", "truck", "plate"]);
  const digits = truckRaw.replace(/\D/g, "");
  if (digits.length !== 7 && digits.length !== 8) return null;
  const truck = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  const date = gasDate(gasValue(row, ["תאריך", "תאריך ביקור", "date"]));
  const address = gasValue(row, ["כתובת", "כתובת מלאה", "address", "fullAddress"]);
  const startTime = gasDateTime(gasValue(row, ["איתוראן: הגעה", "הגעה (איתוראן)", "ituranArriveTime", "itArrive"]), date);
  const endTime = gasDateTime(gasValue(row, ["איתוראן: יציאה", "יציאה (איתוראן)", "ituranDepartTime", "itDepart"]), date);
  if (!date || !address || !startTime || !endTime) return null;
  const rawDuration = Number(gasValue(row, ["איתוראן: משך עצירה (דק׳)", "משך באתר (דק׳)", "ituranDurationMin", "itStop"]));
  const durationMin = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : gasMinutesBetween(startTime, endTime);
  if (!durationMin) return null;
  const ptoOpen = gasDateTime(gasValue(row, ["PTO פתיחה", "PTO פתיחה (איתוראן)", "ptoOpenTime", "ptoOpen"]), date);
  const ptoClose = gasDateTime(gasValue(row, ["PTO סגירה", "PTO סגירה (איתוראן)", "ptoCloseTime", "ptoClose"]), date);
  const rawPtoDuration = Number(gasValue(row, ["PTO משך (דק׳)", "PTO דק׳", "ptoDurationMin", "ptoMin"]));
  const ptoEvents: PtoEvent[] = ptoOpen ? [{
    id: `pto-${truck}-${ptoOpen}`, truck, openTime: ptoOpen,
    ...(ptoClose ? { closeTime: ptoClose } : {}),
    ...(Number.isFinite(rawPtoDuration) && rawPtoDuration > 0 ? { durationMin: rawPtoDuration } : ptoClose ? { durationMin: gasMinutesBetween(ptoOpen, ptoClose) } : {}),
    isOrphan: !ptoClose, ...(!ptoClose ? { orphanReason: "missing_close" as const } : {}),
  }] : [];
  return {
    id: `gas-${truck}-${date}-${address}`, truck,
    driver: gasValue(row, ["נהג", "driver"]), date, startTime, endTime, durationMin,
    address, normalizedSiteKey: address.toLowerCase(), cumulativeKm: 0, ptoEvents,
  };
}
export async function loadLiveIturanFromGas({ gasUrl, token, fetcher = fetch }: {
  gasUrl?: string; token?: string; fetcher?: typeof fetch;
}): Promise<LiveIturanResult> {
  if (!gasUrl || !token) return { source: "none", stops: [], error: "GAS_URL או API_TOKEN חסר בשרת" };
  try {
    const url = new URL(gasUrl);
    url.searchParams.set("action", "bootstrap");
    url.searchParams.set("token", token);
    const response = await fetcher(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(12000) });
    const text = await response.text();
    let payload: { ok?: boolean; success?: boolean; error?: unknown; data?: { visits?: unknown } };
    try { payload = JSON.parse(text) as typeof payload; }
    catch { throw new Error(`תשובת GAS אינה JSON תקין (HTTP ${response.status})`); }
    if (!response.ok || payload.ok === false || payload.success === false) throw new Error(String(payload.error || `GAS HTTP ${response.status}`));
    if (!Array.isArray(payload.data?.visits)) throw new Error("תשובת GAS אינה מכילה רשימת ביקורים");
    const stops = (payload.data.visits as AppsScriptVisit[]).map(mapLiveIturanVisit).filter((stop): stop is IturanStop => stop !== null);
    return stops.length ? { source: "live", stops } : { source: "none", stops: [], error: "אין ביקורים עם מקור איתוראן וזמני עצירה מאומתים" };
  } catch (error) {
    return { source: "none", stops: [], error: error instanceof Error ? error.message : String(error) };
  }
}
