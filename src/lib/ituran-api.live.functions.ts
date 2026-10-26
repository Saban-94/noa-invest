/**
 * גשר שרת ← GAS getIturanPto / getIturanStops
 * להטמיע לצד ituran-api.functions.ts הקיים או להחליף ייבוא.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  matchCranePto,
  normalizePlate,
  type CraneMatchResult,
  type HandwrittenCraneWindow,
  type IturanPtoEvent,
} from "./ituran-live";

function gasUrl(): string {
  const u = process.env["GAS_URL"];
  if (!u) throw new Error("GAS_URL לא מוגדר בשרת");
  return u;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת");
  return t;
}

async function gasGet(action: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(gasUrl());
  url.searchParams.set("action", action);
  url.searchParams.set("token", apiToken());
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`תשובת GAS לא תקינה (HTTP ${res.status})`);
  }
}

export const fetchIturanPtoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { truck?: string; sinceHours?: number }) => ({
    truck: d.truck ? normalizePlate(String(d.truck)) : "",
    sinceHours: Math.min(Math.max(Number(d.sinceHours) || 36, 1), 168),
  }))
  .handler(async ({ data }) => {
    const since = new Date(Date.now() - data.sinceHours * 3600 * 1000).toISOString();
    try {
      const json = (await gasGet("getIturanPto", {
        truck: data.truck,
        since,
      })) as {
        success?: boolean;
        error?: string;
        events?: IturanPtoEvent[];
        source?: string;
        meta?: { fetchedAt?: string; count?: number };
      };

      if (json.error || json.success === false) {
        return {
          ok: false as const,
          error: String(json.error || "getIturanPto failed"),
          events: [] as IturanPtoEvent[],
        };
      }

      return {
        ok: true as const,
        events: Array.isArray(json.events) ? json.events : [],
        source: json.source || "ituran_pto_sheet",
        fetchedAt: json.meta?.fetchedAt || new Date().toISOString(),
        count: json.meta?.count ?? (json.events?.length || 0),
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
        events: [] as IturanPtoEvent[],
      };
    }
  });

/**
 * שאלה תפעולית: מתי חכמת פתחה מנוף / האם תואם כתב-יד
 */
export const answerCranePtoFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      truck?: string;
      handwritten?: HandwrittenCraneWindow;
      sinceHours?: number;
    }) => ({
      truck: normalizePlate(String(d.truck || "615-41-002")),
      handwritten: d.handwritten,
      sinceHours: Math.min(Math.max(Number(d.sinceHours) || 36, 1), 168),
    }),
  )
  .handler(async ({ data }): Promise<CraneMatchResult & { ok: boolean; error?: string }> => {
    const since = new Date(Date.now() - data.sinceHours * 3600 * 1000).toISOString();
    try {
      const json = (await gasGet("getIturanPto", {
        truck: data.truck,
        since,
      })) as {
        success?: boolean;
        error?: string;
        events?: IturanPtoEvent[];
        source?: string;
        meta?: { fetchedAt?: string };
      };

      if (json.error || json.success === false) {
        return {
          ok: false,
          error: String(json.error || "GAS error"),
          evidence: "unavailable",
          evidenceLabelHe: "לא זמין / נדרש אימות",
          summaryHe: `לא ניתן לשלוף אירועי PTO מהשרת: ${json.error || "שגיאה"}.`,
          ptoEvents: [],
        };
      }

      const events = Array.isArray(json.events) ? json.events : [];
      const matched = matchCranePto(events, data.handwritten);
      return {
        ok: true,
        ...matched,
        fetchedAt: json.meta?.fetchedAt || new Date().toISOString(),
        source: json.source || matched.source,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: msg,
        evidence: "unavailable",
        evidenceLabelHe: "לא זמין / נדרש אימות",
        summaryHe: `כשל בחיבור למקור איתוראן: ${msg}`,
        ptoEvents: [],
      };
    }
  });
