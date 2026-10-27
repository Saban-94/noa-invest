import { ORDERS, type Order } from "./data";

// כתובת ה-Apps Script המוגדרת במשתני הסביבה (Vite)
export const VITE_NOA_ORDERS_API_URL = import.meta.env.ORDERS_API_URL || "";
export const ITURAN_TOKEN = import.meta.env.ITURAN_TOKEN || import.meta.env.ITURAN_TOKEN || "saban-ituran-secret-2026";

export const hasLiveOrdersEndpoint = Boolean(VITE_NOA_ORDERS_API_URL.trim());

/**
 * פונקציה לשליפה חיה של טאב "הזמנות" מתוך Google Apps Script / Google Sheets
 */
export async function fetchLiveOrdersFromSheet(): Promise<Order[]> {
  if (!hasLiveOrdersEndpoint) {
    console.info("מצב הדגמה: NOA_ORDERS_API_URL אינו מוגדר. טוען נתונים סטטיים.");
    return ORDERS;
  }

  try {
    const separator = VITE_NOA_ORDERS_API_URL.includes("?") ? "&" : "?";
    const url = `${VITE_NOA_ORDERS_API_URL}${separator}action=getOrders&token=${encodeURIComponent(ITURAN_TOKEN)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`שגיאת שרת בקבלת ההזמנות (${res.status})`);
    }

    const data = await res.json();

    if (!data.success || !Array.isArray(data.orders)) {
      throw new Error(data.error || "מבנה הנתונים שהתקבל מהשרת אינו תקין");
    }

    // מיפוי נתוני הגיליון הגולמיים למבנה הטיפוס Order במערכת
    return data.orders.map((item: any, idx: number) => {
      const orderId = String(item["מס' הזמנה"] || item["מספר הזמנה"] || `ord_${idx + 1}`).trim();
      const customerName = String(item["שם לקוח"] || "לקוח מזדמן").trim();
      const address = String(item["כתובת אספקה"] || "").trim();
      const yard = String(item["מחסן מוצא"] || "4 (החרש 10)").trim();
      const status = String(item["סטטוס סידור"] || "פתוחה").trim();
      const date = String(item["תאריך אספקה"] || new Date().toISOString().split("T")[0]).trim();
      const time = String(item["שעה"] || "08:00").trim();
      const phone = String(item["איש קשר וטלפון"] || "").replace(/[^\d-]/g, "");
      const driverStr = String(item["נהג / משאית"] || "").trim();
      const rawItems = String(item["פירוט מוצרים"] || "").trim();

      // פיצול שורות מוצרים גולמיות ממחרוזת הגיליון למבנה מניפסט
      const parsedItems = rawItems
        ? rawItems.split(/[,;]/).map((part, pIdx) => {
            const trimmed = part.trim();
            const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(יח'|שק|בלות|לוח|דלי|מטר)?\s*(.+)$/);
            return {
              name: match ? match[3].trim() : trimmed,
              qty: match ? parseFloat(match[1]) : 1,
              unit: match && match[2] ? match[2] : "יח'",
              weightKg: 50, // משקל ברירת מחדל לשורה אם לא צוין אחרת
              deposit: /בלות|פקדון|משטחים/i.test(trimmed),
            };
          })
        : [{ name: "סחורה כללית לפי תעודה", qty: 1, unit: "מנה", weightKg: 100, deposit: false }];

      return {
        id: orderId,
        customer: customerName,
        customerNo: String(item["מס' לקוח"] || ""),
        address: address,
        yard: yard,
        status: status.includes("סופק") ? "סופק" : status.includes("בהעמסה") ? "בהעמסה" : status.includes("בדרך") ? "בדרך" : "פתוחה",
        date: date,
        window: time,
        phone: phone,
        driverId: driverStr.includes("חכמת") ? "driver_1" : driverStr.includes("עלי") ? "driver_2" : null,
        driverName: driverStr,
        items: parsedItems,
        notes: String(item["הערות"] || ""),
      };
    });
  } catch (err) {
    console.error("שגיאה בסנכרון ההזמנות מול Google Sheets:", err);
    throw err;
  }
}
