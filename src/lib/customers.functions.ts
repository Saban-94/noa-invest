/**
 * customers.functions.ts — חיבור ל-GAS: getCustomers + notes/orders לפי לקוח
 */
import { createServerFn } from "@tanstack/react-start";

const GAS_URL = process.env.GAS_URL || process.env.VITE_SHEETS_ORDERS_URL || "";
const API_TOKEN = process.env.API_TOKEN || process.env.GAS_API_TOKEN || "";

async function gasGet(action: string, extra: Record<string, string> = {}) {
  if (!GAS_URL) throw new Error("GAS_URL לא מוגדר בשרת");
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  if (API_TOKEN) url.searchParams.set("token", API_TOKEN);
  Object.entries(extra).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GAS החזיר לא-JSON (${res.status}): ${text.slice(0, 120)}`);
  }
  if (!res.ok || json.success === false) {
    throw new Error(String(json.error || `GAS ${res.status}`));
  }
  return json;
}

export type LiveCustomer = {
  id: string;
  customerNo: string;
  name: string;
  address: string;
  phone: string;
  preferredDriver: string;
  notesCount: number;
  ordersCount: number;
  lastNoteId: string;
  lastNoteDate: string;
  sampleDriveUrl: string;
  addresses?: string[];
  lastActivity?: string;
  lastDeliveryDate?: string;
  totalWeightTons?: number;
  balesDepositQty?: number;
  palletsDepositQty?: number;
  recentOrders?: Array<Record<string, unknown>>;
};

export const listCustomersFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const json = await gasGet("getCustomers");
    const customers = (json.customers as LiveCustomer[]) || [];
    return {
      customers,
      source: String(json.source || "gas"),
      count: customers.length,
      fetchedAt: String(json.fetchedAt || new Date().toISOString()),
    };
  },
);


/** חיפוש לקוחות בשרת — GAS מסנן לפי שם, מספר, טלפון וכתובת. */
export const searchCustomersFn = createServerFn({ method: "POST" })
  .validator((d: { query: string }) => d)
  .handler(async ({ data }) => {
    const json = await gasGet("searchCustomers", { q: String(data.query || "").trim() });
    const customers = (json.customers as LiveCustomer[]) || [];
    return {
      customers,
      source: String(json.source || "gas"),
      count: customers.length,
      fetchedAt: String(json.fetchedAt || new Date().toISOString()),
    };
  });

/** שליפת פרופיל יחיד לפי מספר קומקס יציב. */
export const getCustomerFn = createServerFn({ method: "POST" })
  .validator((d: { customerNo: string }) => d)
  .handler(async ({ data }) => {
    const customerNo = String(data.customerNo || "").trim();
    if (!customerNo) throw new Error("חסר מספר לקוח");
    const json = await gasGet("getCustomer", { customerNo });
    return {
      customer: (json.customer as LiveCustomer | null) || null,
      found: Boolean(json.found),
      fetchedAt: String(json.fetchedAt || new Date().toISOString()),
    };
  });

export const getCustomerBundleFn = createServerFn({ method: "POST" })
  .validator((d: { customerNo: string }) => d)
  .handler(async ({ data }) => {
    const no = String(data.customerNo || "").trim();
    if (!no) throw new Error("חסר מספר לקוח");

    const [custJson, notesJson, ordersJson] = await Promise.all([
      gasGet("getCustomers").catch(() => ({ customers: [] as LiveCustomer[] })),
      gasGet("getNotes").catch(() => ({ notes: [] as unknown[] })),
      gasGet("getOrders").catch(() => ({ orders: [] as unknown[] })),
    ]);

    const customers = (custJson.customers as LiveCustomer[]) || [];
    const customer =
      customers.find((c) => c.customerNo === no || c.id === no) || null;

    const notes = ((notesJson.notes as Record<string, unknown>[]) || []).filter(
      (n) => String(n.customerNo || "").trim() === no,
    );

    const allOrders = (ordersJson.orders as Record<string, unknown>[]) || [];
    const name = customer?.name || "";
    const orders = allOrders.filter((o) => {
      const oNo = String(o.customerNo || "").trim();
      if (oNo && oNo === no) return true;
      if (name && String(o.customer || "").includes(name)) return true;
      return false;
    });

    return {
      customer,
      notes,
      orders,
      customerNo: no,
      fetchedAt: new Date().toISOString(),
    };
  });
