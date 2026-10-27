import { ORDERS, type Order } from "@/lib/data";
const endpoint = (import.meta.env.VITE_NOA_ORDERS_API_URL as string | undefined)?.trim();
function normalizeStatus(value: unknown): Order["status"] {
 const s=String(value??"").trim(); if(["בדרך","בנסיעה","יצאה"].includes(s)) return "בדרך"; if(["בהעמסה","בהכנה","מעמיסים"].includes(s)) return "בהעמסה"; return "פתוחה";
}
function normalizeOrder(raw: Record<string, any>): Order | null {
 const id=String(raw.id??raw.orderId??raw.orderNumber??raw["מספר הזמנה"]??raw["מס' הזמנה"]??"").trim(); if(!id)return null;
 const rawItems=Array.isArray(raw.items)?raw.items:[];
 const items=rawItems.map((item:any)=>({name:String(item?.name??item?.product??item?.["שם פריט"]??"פריט ללא שם"),qty:Math.max(0,Number(item?.qty??item?.quantity??item?.["כמות"]??0)||0),unit:String(item?.unit??item?.["יחידה"]??"יח׳"),weightKg:Math.max(0,Number(item?.weightKg??item?.weight_kg??0)||0),...(item?.deposit?{deposit:Number(item.deposit)||0}:{})}));
 const yardRaw=String(raw.yard??raw.warehouse??raw["מחסן"]??"מחסן 4 החרש 10"); const yard:Order["yard"]=/התלמיד|מחסן\\s*1/.test(yardRaw)?"מחסן 1 התלמיד 6":"מחסן 4 החרש 10";
 const d=raw.date??raw.deliveryDate??raw["תאריך אספקה"]??raw["תאריך"]; const date=d?String(d).slice(0,10):new Date().toISOString().slice(0,10); const driver=String(raw.driver??raw.driverName??"");
 return {id,customer:String(raw.customer??raw.customerName??raw["שם לקוח"]??raw["לקוח"]??"לקוח לא מזוהה"),phone:String(raw.phone??raw.customerPhone??raw["טלפון"]??""),address:String(raw.address??raw.deliveryAddress??raw["כתובת אספקה"]??raw["כתובת"]??""),date,window:String(raw.window??raw.deliveryWindow??raw["חלון אספקה"]??raw["שעת אספקה"]??"לא הוגדרה שעה"),yard,driverId:/עלי/i.test(driver)?"ali":/חכמת|מנוף/i.test(driver)?"hikmat":null,status:normalizeStatus(raw.status??raw.deliveryStatus??raw["סטטוס"]??raw["סטטוס הזמנה"]),items};
}
export async function fetchLiveOrdersFromSheet(): Promise<Order[]> {
 if(!endpoint)return ORDERS;
 const url=new URL(endpoint); url.searchParams.set("action","getOrders"); url.searchParams.set("sheetId","1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw"); url.searchParams.set("tab","הזמנות");
 const response=await fetch(url.toString(),{method:"GET",cache:"no-store"}); if(!response.ok)throw new Error(`Google Sheets API returned HTTP ${response.status}`);
 const payload=await response.json(); if(payload?.success!==true||!Array.isArray(payload.orders))throw new Error(payload?.error||"תגובה לא תקינה מ-Google Sheets");
 return payload.orders.map(normalizeOrder).filter(Boolean) as Order[];
}
