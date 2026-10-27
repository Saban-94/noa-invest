import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxp3CnxhBb2vpcV_fiIBKIxIaGtsD1mYE-tpBApVCWRU4i7kcGDy4csBv2JOKfBi_pI/exec";

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
  date: string;
  window: string;
  yard: string;
  driver: string;
  status: string;
  itemsText: string;
  items: SheetOrderItem[];
};

function firstValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeItem(value: unknown, index: number): SheetOrderItem {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const name = String(firstValue(row, "name", "catalogName", "שם מוצר", "מוצר", "פריט"));
  const qtyValue = Number(String(firstValue(row, "qty", "quantity", "כמות") || "1").replace(",", "."));
  const weightValue = Number(String(firstValue(row, "weightKg", "unitWeightKg", "משקל ליחידה") || "0").replace(",", "."));
  return {
    sku: String(firstValue(row, "sku", "מק״ט", "מק''ט") || `item-${index + 1}`),
    name,
    catalogName: String(firstValue(row, "catalogName") || name),
    qty: Number.isFinite(qtyValue) ? qtyValue : 1,
    unit: String(firstValue(row, "unit", "יחידה") || "יח׳"),
    weightKg: Number.isFinite(weightValue) ? weightValue : 0,
    matched: firstValue(row, "matched") === true || String(firstValue(row, "matched")).toLowerCase() === "true",
  };
}

function normalizeOrder(value: unknown, index: number): SheetOrder {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawItems = firstValue(row, "items", "פריטים");
  let items: SheetOrderItem[] = [];
  if (Array.isArray(rawItems)) {
    items = rawItems.map(normalizeItem);
  } else if (typeof rawItems === "string" && rawItems.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawItems);
      if (Array.isArray(parsed)) items = parsed.map(normalizeItem);
    } catch {
      // Fall back to parsing the human-readable product list below.
    }
  }

  const itemsText = String(firstValue(row, "itemsText", "items_text", "פירוט מוצרים", "פרטי הזמנה"));
  if (items.length === 0 && itemsText) {
    items = itemsText.split(/[\n,;]+/).map((part, itemIndex) => {
      const text = part.trim();
      const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(יח׳?|יחידות|שק|שקים|בלות|לוח|דלי|מטר|משטח)?\s*(.+)$/);
      return normalizeItem({
        name: match ? match[3].trim() : text,
        qty: match ? match[1].replace(",", ".") : "1",
        unit: match?.[2] || "יח׳",
      }, itemIndex);
    }).filter((item) => item.name);
  }

  return {
    id: String(firstValue(row, "id", "orderId", "orderNumber", "מס׳ הזמנה", "מס' הזמנה", "מספר הזמנה") || `row-${index + 1}`),
    customer: String(firstValue(row, "customer", "customerName", "שם לקוח", "לקוח") || "לקוח ללא שם"),
    phone: String(firstValue(row, "phone", "customerPhone", "איש קשר וטלפון", "טלפון")),
    address: String(firstValue(row, "address", "deliveryAddress", "כתובת אספקה", "כתובת")),
    date: String(firstValue(row, "date", "deliveryDate", "תאריך אספקה")),
    window: String(firstValue(row, "window", "time", "שעה")),
    yard: String(firstValue(row, "yard", "warehouse", "מחסן מוצא", "מחסן")),
    driver: String(firstValue(row, "driver", "driverName", "נהג / משאית", "נהג")),
    status: String(firstValue(row, "status", "orderStatus", "סטטוס סידור", "סטטוס") || "פתוחה"),
    itemsText,
    items,
  };
}

async function getServerConfig() {
  const token = process.env["API_TOKEN"];
  if (!token) throw new Error("API_TOKEN לא מוגדר בשרת (Vercel → Settings → Environment Variables)");
  const gasUrl = process.env["GAS_URL"] || DEFAULT_GAS_URL;
  return { token, gasUrl };
}

export const listOrdersFn = createServerFn({ method: "POST" }).handler(async () => {
  const { token, gasUrl } = await getServerConfig();
  const url = new URL(gasUrl);
  url.searchParams.set("action", "getOrders");
  url.searchParams.set("token", token);

  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${response.status}): ${text.slice(0, 160).replace(/\s+/g, " ")}`);
  }

  if (!response.ok) throw new Error(`Apps Script החזיר HTTP ${response.status}`);
  if (data.success === false || data.error) {
    throw new Error(String(data.error || "getOrders נכשל"));
  }
  if (!Array.isArray(data.orders)) {
    throw new Error("Apps Script לא החזיר מערך orders. יש לבדוק שהפעולה getOrders מחוברת לטאב ההזמנות.");
  }

  return {
    tab: String(data.tab || "הזמנות"),
    orders: data.orders.map(normalizeOrder),
  };
});

export const updateOrderStatusFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; status: string }) => input)
  .handler(async ({ data }) => {
    const { token, gasUrl } = await getServerConfig();
    const response = await fetch(gasUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "updateOrderStatus",
        id: data.id,
        orderId: data.id,
        status: data.status,
        token,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`תשובה לא תקינה בעדכון הזמנה (HTTP ${response.status})`);
    }
    if (!response.ok || result.success === false || result.ok === false || result.error) {
      throw new Error(String(result.error || "עדכון הסטטוס בגיליון נכשל"));
    }
    return { success: true };
  });
