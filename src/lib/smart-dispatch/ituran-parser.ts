// src/lib/smart-dispatch/ituran-parser.ts
// פענוח דוח אקסל 24 שעות של איתוראן (iweb2+)

import * as XLSX from "xlsx";
import type { IturanRawRow, IturanStop, PtoEvent } from "./types";
import { normalizeAddressToSiteKey } from "./cross-matcher";

/**
 * חילוץ מספר רישוי מנורמל בפורמט XXX-XX-XXX מתוך תג זיהוי או טקסט חופשי
 */
export function normalizeTruckPlate(raw?: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 7) {
    // פורמט 7 ספרות: 651-51-701, 615-41-002
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 8) {
    // פורמט 8 ספרות: 123-45-678
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  // אם כבר יש מקפים
  const match = raw.match(/\d{2,3}-\d{2}-\d{3}/);
  return match ? match[0] : raw.trim();
}

/**
 * ניקוי שם נהג מתוך תחיליות כגון "נהג קבוע:\nעלי אבו עידה" או שמות משאיות
 */
export function cleanDriverName(raw?: string): string {
  if (!raw) return "";
  let clean = raw
    .replace(/^נהג\s*קבוע:\s*/i, "")
    .replace(/^נהג:\s*/i, "")
    .trim();

  // אם יש ירידת שורה
  const lines = clean
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1 && (lines[0]?.includes("נהג") || lines[0]?.includes("קבוע"))) {
    clean = lines[1] ?? lines[0] ?? "";
  } else if (lines.length > 0) {
    clean = lines[lines.length - 1] ?? clean;
  }

  // פיצול לפי / והסרת שמות משאית או רישוי
  const parts = clean.split("/").map((p) => p.trim());
  const filtered = parts.filter((p) => {
    if (/\d{5,8}/.test(p)) return false;
    if (p.includes("משאית") || p.includes("מרצדס") || p.includes("איסוזו") || p.includes("מנוף")) {
      return false;
    }
    return p.length > 1;
  });

  return filtered.join(" ").trim() || clean;
}

/**
 * המרת מחרוזת תאריך ושעה dd/MM/yyyy HH:mm:ss ל-Timestamp (ms)
 */
export function parseIturanDateTime(dtStr?: string): number | null {
  if (!dtStr || typeof dtStr !== "string") return null;
  const parts = dtStr.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const [datePart, timePart] = parts;
  const dTokens = (datePart ?? "").split(/[/.-]/).map(Number);
  const tTokens = (timePart ?? "").split(":").map(Number);

  if (dTokens.length < 3 || tTokens.length < 2) return null;
  const day = dTokens[0]!;
  const month = dTokens[1]! - 1; // 0-indexed
  const year = dTokens[2]! < 100 ? 2000 + dTokens[2]! : dTokens[2]!;
  const hour = tTokens[0]!;
  const min = tTokens[1]!;
  const sec = tTokens[2] ?? 0;

  const d = new Date(year, month, day, hour, min, sec);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * המרת שורה גולמית מתוך האקסל לשורת הודעה מובנית
 */
function mapRowToIturanRaw(
  row: Record<string, unknown>,
  headerMap: Record<string, number>,
  rawCells: unknown[],
): IturanRawRow | null {
  const getVal = (colName: string): string => {
    if (colName in row) return String(row[colName] ?? "").trim();
    const idx = headerMap[colName];
    if (idx !== undefined && rawCells[idx] !== undefined) {
      return String(rawCells[idx] ?? "").trim();
    }
    return "";
  };

  const messageTime = getVal("זמן הודעה");
  if (!messageTime || !messageTime.includes("/")) return null;

  const identTag = getVal("תג זיהוי");
  const driverName = getVal("שם נהג");
  const address = getVal("כתובת");
  const stateName = getVal("שם מצב");
  const distanceStr = getVal('מרחק בק"מ');
  const distanceKm = parseFloat(distanceStr.replace(/[^\d.]/g, "") || "0");
  const stopDurationStr = getVal("משך עצירה");
  const stopEndTimeStr = getVal("זמן סיום עצירה");

  return {
    messageTime,
    identTag,
    direction: getVal("כיוון"),
    distanceKm,
    driverName,
    address,
    speed: parseFloat(getVal("מהירות") || "0"),
    stateName,
    alertName: getVal("שם התראה"),
    origGeoArea: getVal("אזור גיאוגראפי מקורי"),
    currGeoArea: getVal("אזור גיאוגראפי נוכחי"),
    stopDurationStr,
    stopEndTimeStr,
  };
}

/**
 * פענוח קובץ האקסל של איתוראן
 * @param buffer קובץ כ-Buffer או ArrayBuffer
 */
export function parseIturanExcel(buffer: ArrayBuffer | Uint8Array | Buffer): {
  rawRows: IturanRawRow[];
  stops: IturanStop[];
  ptoEvents: PtoEvent[];
  orphanPtoCount: number;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  // איתור גיליון Report או הגיליון הראשון
  const sheetName =
    workbook.SheetNames.find((s) => s.toLowerCase() === "report") ?? workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("קובץ האקסל אינו מכיל גיליונות");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("גיליון הנתונים ריק");
  }

  // המרת הגיליון למערך של שורות
  const rawSheetData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  // איתור דינמי של שורת הכותרות שמתחילה ב-"זמן הודעה"
  let headerRowIndex = -1;
  const headerMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(rawSheetData.length, 25); i++) {
    const row = rawSheetData[i];
    if (Array.isArray(row)) {
      const idx = row.findIndex((cell) => String(cell || "").trim() === "זמן הודעה");
      if (idx !== -1) {
        headerRowIndex = i;
        row.forEach((cell, cellIdx) => {
          const colName = String(cell || "").trim();
          if (colName) headerMap[colName] = cellIdx;
        });
        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("לא אותרה שורת כותרות המתחילה ב-'זמן הודעה' בדוח איתוראן");
  }

  const rawRows: IturanRawRow[] = [];

  for (let i = headerRowIndex + 1; i < rawSheetData.length; i++) {
    const row = rawSheetData[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const parsed = mapRowToIturanRaw({}, headerMap, row);
    if (parsed) {
      rawRows.push(parsed);
    }
  }

  // עיבוד עצירות ואירועי PTO לפי משאית
  const { stops, ptoEvents, orphanPtoCount } = processIturanRows(rawRows);

  return {
    rawRows,
    stops,
    ptoEvents,
    orphanPtoCount,
  };
}

/**
 * עיבוד רשימת הודעות איתוראן לעצירות מסודרות, נסיעות ואירועי PTO
 */
export function processIturanRows(rawRows: IturanRawRow[]): {
  stops: IturanStop[];
  ptoEvents: PtoEvent[];
  orphanPtoCount: number;
} {
  // מיון כרונולוגי לפי זמן הודעה
  const sorted = [...rawRows].sort((a, b) => {
    const ta = parseIturanDateTime(a.messageTime) ?? 0;
    const tb = parseIturanDateTime(b.messageTime) ?? 0;
    return ta - tb;
  });

  // חלוקה לפי משאית
  const byTruck: Record<string, IturanRawRow[]> = {};
  for (const row of sorted) {
    const truck = normalizeTruckPlate(row.identTag);
    if (!truck) continue;
    if (!byTruck[truck]) byTruck[truck] = [];
    byTruck[truck].push(row);
  }

  const allStops: IturanStop[] = [];
  const allPtoEvents: PtoEvent[] = [];
  let orphanPtoCount = 0;

  for (const [truck, rows] of Object.entries(byTruck)) {
    // 1. זיהוי אירועי PTO: .פתיחת PTO ו-.סגירת PTO
    const ptoEventsForTruck: PtoEvent[] = [];
    let currentOpenTime: string | null = null;
    let currentOpenTs: number | null = null;

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx]!;
      const state = r.stateName.trim();

      if (state.includes("פתיחת PTO") || state.includes("פתיחת מנוף")) {
        // אם כבר היה פתיחה קודמת ללא סגירה, נסמן כיתום
        if (currentOpenTime && currentOpenTs) {
          ptoEventsForTruck.push({
            id: `pto-${truck}-${currentOpenTime}`,
            truck,
            openTime: currentOpenTime,
            isOrphan: true,
            orphanReason: "missing_close",
          });
          orphanPtoCount++;
        }
        currentOpenTime = r.messageTime;
        currentOpenTs = parseIturanDateTime(r.messageTime);
      } else if (state.includes("סגירת PTO") || state.includes("סגירת מנוף")) {
        const closeTs = parseIturanDateTime(r.messageTime);
        if (currentOpenTime && currentOpenTs && closeTs) {
          const durationMin = Math.round((closeTs - currentOpenTs) / 60000);
          ptoEventsForTruck.push({
            id: `pto-${truck}-${currentOpenTime}`,
            truck,
            openTime: currentOpenTime,
            closeTime: r.messageTime,
            durationMin: Math.max(0, durationMin),
            isOrphan: false,
          });
          currentOpenTime = null;
          currentOpenTs = null;
        } else {
          // סגירה ללא פתיחה (חצתה את גבול הדוח)
          ptoEventsForTruck.push({
            id: `pto-${truck}-${r.messageTime}`,
            truck,
            openTime: r.messageTime,
            closeTime: r.messageTime,
            isOrphan: true,
            orphanReason: "missing_open",
          });
          orphanPtoCount++;
        }
      }
    }

    // בדיקת פתיחה יתומה בסוף הדוח
    if (currentOpenTime) {
      ptoEventsForTruck.push({
        id: `pto-${truck}-${currentOpenTime}`,
        truck,
        openTime: currentOpenTime,
        isOrphan: true,
        orphanReason: "missing_close",
      });
      orphanPtoCount++;
    }

    allPtoEvents.push(...ptoEventsForTruck);

    // 2. זיהוי עצירות: שורה שיש בה "משך עצירה" ו-"זמן סיום עצירה"
    let prevStopEndTime: number | null = null;
    let prevCumulativeKm = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const isStopRow = Boolean(r.stopEndTimeStr && r.stopDurationStr);
      if (!isStopRow) continue;

      const startTs = parseIturanDateTime(r.messageTime);
      const endTs = parseIturanDateTime(r.stopEndTimeStr);

      if (!startTs || !endTs) continue;

      // חישוב משך עצירה מהפרש הזמנים
      const durationMin = Math.max(0, Math.round((endTs - startTs) / 60000));
      const dateStr = r.messageTime.split(" ")[0] ?? "";
      const driver = cleanDriverName(r.driverName);
      const normalizedSiteKey = normalizeAddressToSiteKey(r.address);

      // חישוב נסיעה לעצירה זו מסיום העצירה הקודמת
      let driveDurationMin: number | undefined;
      let driveKm: number | undefined;

      if (prevStopEndTime !== null && startTs >= prevStopEndTime) {
        driveDurationMin = Math.max(0, Math.round((startTs - prevStopEndTime) / 60000));
        driveKm = Math.max(0, parseFloat((r.distanceKm - prevCumulativeKm).toFixed(1)));
      }

      prevStopEndTime = endTs;
      prevCumulativeKm = r.distanceKm;

      // בדיקת אירועי PTO המשויכים לעצירה זו (חפיפה של ±10 דקות לחלון העצירה)
      const stopPtos = ptoEventsForTruck.filter((p) => {
        const pOpenTs = parseIturanDateTime(p.openTime);
        if (!pOpenTs) return false;
        const marginMs = 10 * 60 * 1000;
        return pOpenTs >= startTs - marginMs && pOpenTs <= endTs + marginMs;
      });

      const stopId = `stop-${truck}-${r.messageTime.replace(/[\s:/]/g, "-")}`;

      allStops.push({
        id: stopId,
        truck,
        driver,
        date: dateStr,
        startTime: r.messageTime,
        endTime: r.stopEndTimeStr!,
        durationMin,
        address: r.address,
        normalizedSiteKey,
        cumulativeKm: r.distanceKm,
        driveDurationMin,
        driveKm,
        ptoEvents: stopPtos,
      });
    }
  }

  return {
    stops: allStops,
    ptoEvents: allPtoEvents,
    orphanPtoCount,
  };
}
