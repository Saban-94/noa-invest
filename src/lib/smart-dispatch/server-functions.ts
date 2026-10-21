// src/lib/smart-dispatch/server-functions.ts
// פונקציות שרת (createServerFn) עבור "סידור חכם – ח. סבן חומרי בניין"
// סודות הסביבה (APPS_SCRIPT_URL, API_TOKEN, GEMINI_API_KEY, GEMINI_MODEL) בשרת בלבד

import { createServerFn } from "@tanstack/react-start";
import {
  callAppsScript,
  saveDiscFix,
  clearAppsScriptCache,
  getAppsScriptUrl,
  ConnectionDiagnosticError,
  type ConnectionDiagnostic,
  type BootstrapResponse,
  type HealthResponse,
} from "./apps-script-contract";
import { analyzeTachographWithGemini, type TachographAiAnalysis } from "./gemini-tachograph";
import type { DeterministicException } from "./rules-engine";
import type { RawDiscRecord, RawVisitRecord } from "./apps-script-contract";

export type BootstrapServerResult =
  | { success: true; data: BootstrapResponse }
  | { success: false; diagnostic: ConnectionDiagnostic; errorMessage: string };

export const getSmartDispatchBootstrapFn = createServerFn({ method: "GET" })
  .validator((d: { bypassCache?: boolean } | undefined) => d || {})
  .handler(async ({ data }): Promise<BootstrapServerResult> => {
    try {
      const resp = await callAppsScript<BootstrapResponse>(
        "bootstrap",
        undefined,
        !!data.bypassCache,
      );
      return {
        success: true,
        data: {
          discs: Array.isArray(resp.discs) ? resp.discs : [],
          visits: Array.isArray(resp.visits) ? resp.visits : [],
          sites: Array.isArray(resp.sites) ? resp.sites : [],
          cities: Array.isArray(resp.cities) ? resp.cities : [],
          user: resp.user,
        },
      };
    } catch (err) {
      if (err instanceof ConnectionDiagnosticError) {
        return {
          success: false,
          diagnostic: err.diagnostic,
          errorMessage: err.message,
        };
      }
      const host = new URL(getAppsScriptUrl()).host;
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        diagnostic: {
          isHtmlError: true,
          host,
          httpStatus: 500,
          contentType: "error/exception",
          previewSnippet: err instanceof Error ? err.message.slice(0, 200) : "Network error",
          reasons: [
            "כתובת פריסה ישנה (Deployment URL לא מעודכנת לאחר שינוי קוד ב-Apps Script)",
            "הגדרת גישה אינה Anyone (נדרשת הרשאת 'Anyone' בפריסת ה-Web App ב-Google)",
            "פונקציית doGet מחזירה HtmlService/HTML במקום ContentService.createTextOutput כ-JSON",
          ],
          timestamp: new Date().toISOString(),
        },
      };
    }
  });

export type HealthServerResult =
  | { success: true; data: HealthResponse }
  | { success: false; diagnostic: ConnectionDiagnostic; errorMessage: string };

export const getSmartDispatchHealthFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<HealthServerResult> => {
    const t0 = Date.now();
    try {
      const resp = await callAppsScript<Record<string, unknown>>("health", undefined, true);
      const responseTimeMs = Date.now() - t0;
      const host = new URL(getAppsScriptUrl()).host;

      const tabs = (resp["tabs"] || resp["tabRowCounts"] || {}) as Record<string, number>;
      return {
        success: true,
        data: {
          ok: true,
          status: "healthy",
          responseTimeMs,
          tabRowCounts: {
            discs: Number(tabs["discs"] || tabs["ארכיון_טכוגרף"] || 0),
            visits: Number(tabs["visits"] || tabs["היסטוריית_ביקורים"] || 0),
            sites: Number(tabs["sites"] || tabs["אתרי_לקוחות"] || 0),
            cities: Number(tabs["cities"] || tabs["סיכום_ערים"] || 0),
            notes: Number(tabs["notes"] || tabs["ארכיון_תעודות_גליה"] || 0),
          },
          lastDataDate: String(resp["lastUpdate"] || resp["lastDataDate"] || ""),
          host,
        },
      };
    } catch (err) {
      if (err instanceof ConnectionDiagnosticError) {
        return {
          success: false,
          diagnostic: err.diagnostic,
          errorMessage: err.message,
        };
      }
      const host = new URL(getAppsScriptUrl()).host;
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        diagnostic: {
          isHtmlError: true,
          host,
          httpStatus: 500,
          contentType: "error/exception",
          previewSnippet: err instanceof Error ? err.message.slice(0, 200) : "Health check failed",
          reasons: [
            "כתובת פריסה ישנה (Deployment URL לא מעודכנת לאחר שינוי קוד ב-Apps Script)",
            "הגדרת גישה אינה Anyone (נדרשת הרשאת 'Anyone' בפריסת ה-Web App ב-Google)",
            "פונקציית doGet מחזירה HtmlService/HTML במקום ContentService.createTextOutput כ-JSON",
          ],
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
);

export const getSmartDispatchDiscImageFn = createServerFn({ method: "GET" })
  .validator((d: { link: string }) => d)
  .handler(async ({ data }): Promise<{ dataUrl: string }> => {
    if (!data.link) throw new Error("קישור דיסקית חסר");
    const res = await callAppsScript<{
      ok?: boolean;
      data?: string;
      image?: string;
      dataUrl?: string;
    }>("image", { link: data.link });
    const dataUrl = (res.data || res.image || res.dataUrl || "") as string;
    if (!dataUrl) throw new Error("לא התקבלה תמונת דיסקית מהשרת");
    return { dataUrl };
  });

export const saveSmartDispatchDiscFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      row: number;
      fix: {
        date?: string;
        plate?: string;
        approve?: boolean;
        approver?: string;
      };
    }) => d,
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    return await saveDiscFix(data);
  });

export const analyzeTachographAiFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      disc?: RawDiscRecord;
      visits: RawVisitRecord[];
      exceptions: DeterministicException[];
      imageBase64?: string;
      forceRefresh?: boolean;
    }) => d,
  )
  .handler(async ({ data }): Promise<TachographAiAnalysis> => {
    return await analyzeTachographWithGemini(data);
  });

export const clearSmartDispatchCacheFn = createServerFn({ method: "POST" }).handler(async () => {
  clearAppsScriptCache();
  return { success: true };
});
