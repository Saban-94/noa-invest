import { createServerFn } from "@tanstack/react-start";

/**
 * הזמנות חיות מגיליון Google Sheets דרך Apps Script (action=getOrders).
 * הטוקן נשאר בשרת. אין נפילה לנתוני דמה: כל כשל נזרק ומוצג למשתמש.
 */

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbyh-8mU90O1gvfO20bbnoPHrmb_pgIMucWmE_S7fRxjhwztelp1v93Q6-2ayQU-ElrgIw/exec";

export type SheetOrderItem = {
  sku: string;
  name: string;
  catalogName: string;
  qty: number;
  unit: string;
  weightKg: number;
  matched: boolean;
};

export type SheetOrder = {
  id: string;
  customer: string;
  phone: string;
  address: string;
  date: string; // yyyy-MM-dd או ""
  window: string;
  yard: string;
  driver: string;
  status: string;
  itemsText: string;
  items: SheetOrderItem[];
};

export const listOrdersFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = process.env["API_TOKEN"];
  if (!token) throw new Error("API_TOKEN לא מוגדר בשרת (Environment Variables)");

  const u = new URL(process.env["GAS_URL"] || DEFAULT_GAS_URL);
  u.searchParams.set("action", "getOrders");
  u.searchParams.set("token", token);

  const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `תשובה לא תקינה מ-Apps Script (HTTP ${res.status}): ${text.slice(0, 160).replace(/\s+/g, " ")}`,
    );
  }
  if (data.success === false || data.error) {
    throw new Error(String(data.error || "getOrders נכשל"));
  }
  return {
    tab: String(data.tab || ""),
    orders: (Array.isArray(data.orders) ? data.orders : []) as SheetOrder[],
  };
});
