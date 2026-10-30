import { listOrdersFn, updateOrderStatusFn } from "./orders.functions";
import type { Order } from "./data";

/**
 * תאימות לאחור למודולים ישנים: כל קריאה עוברת דרך Server Functions.
 * אין כתובת GAS או token בקוד לקוח, ואין fallback להזמנות דמה.
 */
export const ORDERS_API_URL = "";
export const ITURAN_TOKEN = "";
export const hasLiveOrdersEndpoint = true;

export async function fetchLiveOrdersFromSheet(): Promise<Order[]> {
  const { orders } = await listOrdersFn();
  return orders.map((order) => {
    const parsedWeight = Number(String(order.weightTons || "").replace(",", "."));
    const status = ["פתוחה", "בהעמסה", "בדרך", "סופק"].includes(order.status)
      ? (order.status as Order["status"])
      : "פתוחה";

    return {
      id: order.id,
      receivedDate: order.receivedDate || "",
      date: order.date,
      window: order.window,
      orderId: order.id,
      noteId: order.noteId || "",
      customerNo: order.customerNo,
      customer: order.customer,
      phone: order.phone,
      address: order.address,
      yard: order.yard as Order["yard"],
      driverId: null,
      driverName: order.driver,
      status,
      items: order.items.map((item) => ({
        name: item.catalogName || item.name,
        qty: item.qty,
        ordered: item.qty,
        unit: item.unit,
        weightKg: item.weightKg,
      })),
      notes: order.notes || "",
      weightTons: Number.isFinite(parsedWeight) ? parsedWeight : 0,
      wazeLink: order.waze || "",
      depositBales: "",
      depositPallets: "",
    };
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateOrderStatusFn({ data: { id: orderId, status } });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
