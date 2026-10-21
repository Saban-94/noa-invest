// src/lib/smart-dispatch.functions.ts
// Server functions עבור מערכת סידור חכם – ח. סבן חומרי בניין

import { createServerFn } from "@tanstack/react-start";
import {
  fetchGalyaArchiveNotes,
  fetchAllVisits,
  getErrorLogs,
} from "./smart-dispatch/sheets-integration";
import {
  buildCustomerSitesSummary,
  buildCitiesSummary,
  estimateDispatchTime,
} from "./smart-dispatch/estimation-engine";
import {
  getIngestionStatus,
  triggerSmartDispatchSync,
  processIturanExcelBuffer,
} from "./smart-dispatch/gmail-ingestion";
import type { EstimationRequest } from "./smart-dispatch/types";

/**
 * שליפת סקירה מלאה לכל מסכי האפליקציה
 */
export const getSmartDispatchOverviewFn = createServerFn({ method: "GET" }).handler(async () => {
  const notes = await fetchGalyaArchiveNotes();
  const visits = await fetchAllVisits();
  const sites = buildCustomerSitesSummary(visits);
  const cities = buildCitiesSummary(visits);
  const status = getIngestionStatus();
  const errorLogs = getErrorLogs();

  return {
    notes,
    visits,
    sites,
    cities,
    status,
    errorLogs,
  };
});

/**
 * הרצת מנוע הערכה לסדרן עבור הזמנה חדשה
 */
export const estimateDispatchOrderFn = createServerFn({ method: "POST" })
  .inputValidator((data: EstimationRequest) => {
    return {
      customerNo: data.customerNo || "",
      address: data.address || "",
      city: data.city || "",
      targetDate: data.targetDate,
      targetTime: data.targetTime,
    };
  })
  .handler(async ({ data }) => {
    const visits = await fetchAllVisits();

    // לוחות עבודה של שתי המשאיות לחישוב חלונות פנויים
    const truckDailySchedules = [
      {
        truck: "615-41-002",
        stops: [
          { arrive: "09:15", depart: "10:00" },
          { arrive: "10:40", depart: "11:30" },
        ],
      },
      {
        truck: "651-51-701",
        stops: [{ arrive: "11:45", depart: "12:25" }],
      },
    ];

    const result = estimateDispatchTime(data, visits, truckDailySchedules);
    return result;
  });

/**
 * הפעלת סנכרון מיידי ("הרץ עכשיו")
 */
export const triggerSyncNowFn = createServerFn({ method: "POST" }).handler(async () => {
  const status = await triggerSmartDispatchSync();
  return status;
});

/**
 * העלאת קובץ אקסל איתוראן ישירות מהדפדפן
 */
export const uploadIturanReportFn = createServerFn({ method: "POST" })
  .inputValidator((data: { base64: string; fileName: string }) => {
    if (!data.base64) throw new Error("חסר קובץ אקסל");
    return data;
  })
  .handler(async ({ data }) => {
    const cleanB64 = data.base64.replace(/^data:.*?;base64,/, "");
    const binary = Buffer.from(cleanB64, "base64");
    const result = await processIturanExcelBuffer(binary, data.fileName);
    return result;
  });

/**
 * אישור / טיפול ידני בפריט מתיבת איכות הנתונים
 */
export const resolveQualityIssueFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { issueId: string; action: "approve" | "ignore" | "manual_fix"; note?: string }) => {
      return data;
    },
  )
  .handler(async ({ data }) => {
    const status = getIngestionStatus();
    const target = status.qualityIssues.find((q) => q.id === data.issueId);
    if (target) {
      target.status = data.action === "ignore" ? "ignored" : "resolved";
    }
    return { success: true, issueId: data.issueId };
  });
