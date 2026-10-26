/**
 * Server-side adapter for the Ituran rows already imported by Apps Script.
 * This module never accesses Gmail from the browser and never uses sample rows in production.
 */

function first(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function normalizeDate(value) {
  const s = String(value || "").trim();
  let m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${String(Number(m[1])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${year}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return "";
}

function normalizeDateTime(value, date) {
  const s = String(value || "").trim();
  if (!s) return "";
  const full = s.match(/(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (full) {
    const d = normalizeDate(full[1]);
    const t = full[2].length === 5 ? `${full[2]}:00` : full[2];
    return d ? `${d} ${t}` : "";
  }
  const time = s.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!time || !date) return "";
  const t = time[1].length === 5 ? `${time[1]}:00` : time[1];
  return `${date} ${t}`;
}

function minutesBetween(start, end) {
  const parse = (s) => {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return NaN;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  };
  const a = parse(start);
  const b = parse(end);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 60000) : 0;
}

/** Map one Apps Script visit row only when its own source field identifies Ituran. */
export function mapIturanVisit(row) {
  const source = first(row, ["מקור המדידה", "מקור מדידה", "measurementSource", "source"]);
  if (!/איתוראן|ituran/i.test(source)) return null;

  const truckRaw = first(row, ["משאית", "רישוי / משאית", "truck", "plate"]);
  const digits = truckRaw.replace(/\D/g, "");
  if (digits.length !== 7 && digits.length !== 8) return null;
  const truck = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;

  const date = normalizeDate(first(row, ["תאריך", "תאריך ביקור", "date"]));
  const address = first(row, ["כתובת", "כתובת מלאה", "address", "fullAddress"]);
  const startTime = normalizeDateTime(first(row, ["איתוראן: הגעה", "הגעה (איתוראן)", "ituranArriveTime", "itArrive"]), date);
  const endTime = normalizeDateTime(first(row, ["איתוראן: יציאה", "יציאה (איתוראן)", "ituranDepartTime", "itDepart"]), date);
  if (!date || !address || !startTime || !endTime || !truck) return null;

  const durationRaw = first(row, ["איתוראן: משך עצירה (דק׳)", "משך באתר (דק׳)", "ituranDurationMin", "itStop"]);
  const duration = Number(durationRaw);
  const durationMin = Number.isFinite(duration) && duration > 0 ? duration : minutesBetween(startTime, endTime);
  if (!durationMin) return null;

  const ptoOpen = normalizeDateTime(first(row, ["PTO פתיחה", "PTO פתיחה (איתוראן)", "ptoOpenTime", "ptoOpen"]), date);
  const ptoClose = normalizeDateTime(first(row, ["PTO סגירה", "PTO סגירה (איתוראן)", "ptoCloseTime", "ptoClose"]), date);
  const ptoRaw = first(row, ["PTO משך (דק׳)", "PTO דק׳", "ptoDurationMin", "ptoMin"]);
  const ptoDuration = Number(ptoRaw);
  const ptoEvents = ptoOpen ? [{
    id: `pto-${truck}-${ptoOpen}`,
    truck,
    openTime: ptoOpen,
    ...(ptoClose ? { closeTime: ptoClose } : {}),
    ...(Number.isFinite(ptoDuration) && ptoDuration > 0 ? { durationMin: ptoDuration } : ptoClose ? { durationMin: minutesBetween(ptoOpen, ptoClose) } : {}),
    isOrphan: !ptoClose,
    ...(!ptoClose ? { orphanReason: "missing_close" } : {}),
  }] : [];

  return {
    id: `gas-${truck}-${date}-${address}`,
    truck,
    driver: first(row, ["נהג", "driver"]),
    date,
    startTime,
    endTime,
    durationMin,
    address,
    normalizedSiteKey: address.toLowerCase(),
    cumulativeKm: 0,
    ptoEvents,
  };
}

/**
 * Pulls the Apps Script dashboard payload. Apps Script's pollIturan() must be
 * scheduled separately; this request reads its stored results and never claims
 * Gmail was polled during this request.
 */
export async function loadIturanStopsFromGas({ gasUrl, token, fetcher = fetch }) {
  if (!gasUrl || !token) return { source: "none", stops: [], error: "GAS_URL או API_TOKEN חסר בשרת" };
  try {
    const url = new URL(gasUrl);
    url.searchParams.set("action", "bootstrap");
    url.searchParams.set("token", token);
    const response = await fetcher(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(12000) });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error(`תשובת GAS אינה JSON תקין (HTTP ${response.status})`); }
    if (!response.ok || payload?.ok === false || payload?.success === false) {
      throw new Error(String(payload?.error || `GAS HTTP ${response.status}`));
    }
    const rows = payload?.data?.visits;
    if (!Array.isArray(rows)) throw new Error("תשובת GAS אינה מכילה רשימת ביקורים");
    const stops = rows.map(mapIturanVisit).filter(Boolean);
    return { source: stops.length ? "live" : "none", stops, error: stops.length ? undefined : "אין ביקורים עם מקור איתוראן וזמני עצירה מאומתים" };
  } catch (error) {
    return { source: "none", stops: [], error: error instanceof Error ? error.message : String(error) };
  }
}
