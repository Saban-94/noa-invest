import { ORDERS, type Order } from "@/lib/data";

// This URL was supplied by the user. Override it in Vercel if the deployment URL changes.
const endpoint = (
  import.meta.env.VITE_NOA_ORDERS_API_URL as string | undefined
)?.trim() || "https://script.google.com/macros/s/AKfycbx9NpLEnJ5904JqaeeuuR8NslN66F4r6IYddyvr-Q7AeGx5HFHfSAjW8CoP2oT6NoQrvA/exec";
export const hasLiveOrdersEndpoint = Boolean(endpoint);

function pick(raw: Record<string, any>, ...keys: string[]): any {
  for (const key of keys) if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  const normalized = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase().replace(/[׳״']/g, ""), v]));
  for (const key of keys) {
    const value = normalized[key.trim().toLowerCase().replace(/[׳״']/g, "")];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}
function normalizeStatus(value: unknown): Order["status"] {
  const s = String(value ?? "").trim();
  if (/סופק|הושלם|נמסר|נמסרה/.test(s)) return "סופק";
  if (/בדרך|בנסיעה|יצאה/.test(s)) return "בדרך";
  if (/העמסה|בהכנה|מעמיסים|בביצוע/.test(s)) return "בהעמסה";
  return "פתוחה";
}
function normalizeOrder(raw: Record<string, any>): Order | null {
  const id = String(pick(raw, "id", "orderId", "orderNumber", "מספר הזמנה", "מס' הזמנה", "מס הזמנה")).trim();
  if (!id) return null;
  const sourceItems = Array.isArray(raw.items) ? raw.items : Array.isArray(raw["פריטים"]) ? raw["פריטים"] : [];
  const items = sourceItems.map((item: any) => ({
    name: String(item?.name ?? item?.product ?? item?.["שם פריט"] ?? "פריט ללא שם"),
    qty: Math.max(0, Number(item?.qty ?? item?.quantity ?? item?.["כמות"] ?? 0) || 0),
    unit: String(item?.unit ?? item?.["יחידה"] ?? "יח׳"),
    weightKg: Math.max(0, Number(item?.weightKg ?? item?.weight_kg ?? 0) || 0),
    ...(item?.deposit ? { deposit: Number(item.deposit) || 0 } : {}),
  }));
  const manifest = String(pick(raw, "פירוט מוצרים", "פירוט פריטים", "מניפסט", "itemsText", "products") || "").trim();
  if (!items.length && manifest) {
    // Keep the source manifest verbatim; do not fabricate individual quantities or weights.
    const totalTons = Number(String(pick(raw, "משקל (טון)", "משקל טון", "משקל")).replace(/,/g, "")) || 0;
    items.push({ name: manifest, qty: 1, unit: "פירוט הזמנה", weightKg: totalTons * 1000 });
  }
  const yardRaw = String(pick(raw, "yard", "warehouse", "מחסן מוצא", "מחסן") || "מחסן 4 החרש 10");
  const yard: Order["yard"] = /התלמיד|מחסן\s*1/.test(yardRaw) ? "מחסן 1 התלמיד 6" : "מחסן 4 החרש 10";
  const dateValue = pick(raw, "date", "deliveryDate", "תאריך אספקה", "תאריך");
  const date = dateValue ? String(dateValue).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const driver = String(pick(raw, "driver", "driverName", "נהג / משאית", "נהג", "נהג משובץ"));
  const phoneRaw = String(pick(raw, "phone", "customerPhone", "טלפון", "איש קשר וטלפון"));
  const phoneMatch = phoneRaw.match(/(?:0\d[-\s]?\d{7,8})/);
  return {
    id,
    customer: String(pick(raw, "customer", "customerName", "שם לקוח", "לקוח") || "לקוח לא מזוהה"),
    phone: phoneMatch?.[0] ?? phoneRaw,
    address: String(pick(raw, "address", "deliveryAddress", "כתובת אספקה", "כתובת") || ""),
    date,
    window: String(pick(raw, "window", "deliveryWindow", "שעה", "חלון אספקה", "שעת אספקה") || "לא הוגדרה שעה"),
    yard,
    driverId: /עלי/i.test(driver) ? "ali" : /חכמת|מנוף/i.test(driver) ? "hikmat" : null,
    status: normalizeStatus(pick(raw, "status", "deliveryStatus", "סטטוס סידור", "סטטוס הזמנה", "סטטוס")),
    items,
  };
}
export async function fetchLiveOrdersFromSheet(): Promise<Order[]> {
  const url = new URL(endpoint);
  url.searchParams.set("action", "getOrders");
  url.searchParams.set("sheetId", "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw");
  url.searchParams.set("tab", "הזמנות");
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets API returned HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload?.orders ?? payload?.data ?? payload?.rows;
  if (!Array.isArray(rows)) throw new Error(payload?.error || "השרת לא החזיר רשימת הזמנות. יש לוודא שתומך ב-action=getOrders.");
  const orders = rows.map((row: Record<string, any>) => normalizeOrder(row)).filter(Boolean) as Order[];
  if (payload?.success === false) throw new Error(payload?.error || "השרת דיווח על כשל בקריאת ההזמנות.");
  return orders;
}
