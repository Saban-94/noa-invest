/**
 * גל 1 — הזמנות אמינות
 * לפרוס ב-Apps Script:
 * 1) הדבק קובץ זה כ-Orders.gs באותו פרויקט של Code.gs
 *    (או החלף את handleGetOrders_ הקיים בתוכן זה + הוסף handleUpdateOrderStatus_).
 * 2) ב-doPost ב-Code.gs, לפני unknown action, הוסף:
 *
 *    if (action === "updateOrderStatus") {
 *      return handleUpdateOrderStatus_(body);
 *    }
 *
 * 3) Deploy → Manage deployments → New version (Anyone).
 * 4) ודא API_TOKEN ב-Script Properties תואם ל-Vercel.
 *
 * חשוב: אם handleGetOrders_ כבר קיים ב-Code.gs — מחק/החלף אותו כדי למנוע כפילות.
 */

/**
 * גל 1 — שליפת הזמנות מטאב ההזמנות (מיפוי כותרות אמיתי מהגיליון).
 * כותרות: מס' הזמנה | מס' לקוח | שם לקוח | … | סטטוס סידור | …
 */
var ORDERS_TAB_CANDIDATES_ = [
  "הזמנות",
  "🚚_הזמנות_חיות_וסידור",
  "הזמנות_חיות_וסידור",
  "הזמנות חיות וסידור",
  "הזמנות_חיות",
  "הזמנות חיות",
];

var ORDERS_COL_ = {
  id: ["מס' הזמנה", "מס׳ הזמנה", "מספר הזמנה", "הזמנה", "orderId", "id"],
  customerNo: ["מס' לקוח", "מס׳ לקוח", "מספר לקוח", "customerNo", "customerId"],
  customer: ["שם לקוח", "לקוח", "customer", "customerName"],
  phone: ["איש קשר וטלפון", "טלפון", "איש קשר", "phone"],
  address: ["כתובת אספקה", "כתובת יעד ועיר", "כתובת יעד", "כתובת אתר", "כתובת", "address"],
  date: ["תאריך אספקה", "תאריך הזמנה", "תאריך", "date"],
  window: ["שעה", "סבב ושעה", "שעת אספקה", "חלון זמן", "window"],
  yard: ["מחסן מוצא", "מחסן", "yard"],
  driver: ["נהג / משאית", "נהג משוייך", "נהג משויך", "נהג", "driver"],
  status: ["סטטוס סידור", "סטטוס ביצוע", "סטטוס", "status"],
  items: ["פירוט מוצרים", "פירוט מוצרים ומק״טים", "פריטים", "סחורה מפורטת", "items"],
  noteId: ["מס' תעודת משלוח", "מס׳ תעודת משלוח", "מספר תעודת משלוח", "noteId"],
  weightTons: ["משקל (טון)", "משקל", "weightTons"],
  notes: ["הערות", "notes"],
  waze: ["קישור Waze", "Waze", "waze"],
};

function ordersSheetFind_(ss) {
  for (var i = 0; i < ORDERS_TAB_CANDIDATES_.length; i++) {
    var sh = ss.getSheetByName(ORDERS_TAB_CANDIDATES_[i]);
    if (sh) return sh;
  }
  var all = ss.getSheets();
  for (var j = 0; j < all.length; j++) {
    var n = all[j].getName();
    if (n.indexOf("הזמנות") !== -1 && n.indexOf("ארכיון") === -1 && n.indexOf("תעודות") === -1) {
      return all[j];
    }
  }
  return null;
}

function ordersCellStr_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, "Asia/Jerusalem", "yyyy-MM-dd");
  }
  return String(v == null ? "" : v).trim();
}

function handleGetOrders_(params) {
  params = params || {};
  var ss = SpreadsheetApp.openById(params.sheetId || MASTER_SHEET_ID);
  var sheet = ordersSheetFind_(ss);
  if (!sheet) {
    return jsonResponse({
      success: false,
      error: "לא נמצא טאב הזמנות. קיימים: " + ss.getSheets().map(function (s) { return s.getName(); }).join(" | "),
    });
  }

  var values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) {
    return jsonResponse({ success: true, tab: sheet.getName(), orders: [] });
  }

  var headers = values[0].map(function (h) { return String(h || "").trim(); });
  var idx = {};
  Object.keys(ORDERS_COL_).forEach(function (k) {
    idx[k] = headerIndex_(headers, ORDERS_COL_[k]);
  });

  if (idx.id < 0) {
    return jsonResponse({
      success: false,
      error: "בטאב " + sheet.getName() + " לא נמצאה עמודת מספר הזמנה. כותרות: " + headers.join(" | "),
    });
  }

  var orders = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = ordersCellStr_(row[idx.id]);
    if (!id) continue;
    function cell(key) {
      return idx[key] >= 0 ? ordersCellStr_(row[idx[key]]) : "";
    }
    var itemsText = cell("items");
    orders.push({
      id: id,
      customerNo: cell("customerNo"),
      customer: cell("customer"),
      phone: cell("phone"),
      address: cell("address"),
      date: cell("date"),
      window: cell("window"),
      yard: cell("yard"),
      driver: cell("driver"),
      status: cell("status") || "פתוחה",
      itemsText: itemsText,
      items: [],
      noteId: cell("noteId"),
      weightTons: cell("weightTons"),
      notes: cell("notes"),
      waze: cell("waze"),
      _row: r + 1,
    });
  }

  return jsonResponse({
    success: true,
    tab: sheet.getName(),
    orders: orders,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * גל 1 — עדכון סטטוס סידור לפי מס' הזמנה (לא row-).
 * כותב לעמודת "סטטוס סידור", flush, קריאה חוזרת, ורק אז success.
 */
function handleUpdateOrderStatus_(body) {
  body = body || {};
  var orderId = String(body.orderId || body.id || "").trim();
  var status = String(body.status || "").trim();

  if (!orderId) {
    return jsonResponse({ success: false, error: "חסר מספר הזמנה" });
  }
  if (/^row-/i.test(orderId)) {
    return jsonResponse({ success: false, error: "מזהה row- אינו מפתח עסקי — כתיבה נחסמה" });
  }
  if (!status) {
    return jsonResponse({ success: false, error: "חסר סטטוס לעדכון" });
  }

  var ss = SpreadsheetApp.openById(body.sheetId || MASTER_SHEET_ID);
  var sheet = ordersSheetFind_(ss);
  if (!sheet) {
    return jsonResponse({ success: false, error: "לא נמצא טאב הזמנות" });
  }

  var lastCol = Math.max(1, sheet.getLastColumn());
  var lastRow = Math.max(1, sheet.getLastRow());
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) {
    return String(h || "").trim();
  });

  var idIdx = headerIndex_(headers, ORDERS_COL_.id);
  var statusIdx = headerIndex_(headers, ORDERS_COL_.status);
  if (idIdx < 0) {
    return jsonResponse({ success: false, error: "לא נמצאה עמודת מס' הזמנה. כותרות: " + headers.join(" | ") });
  }
  if (statusIdx < 0) {
    return jsonResponse({ success: false, error: "לא נמצאה עמודת סטטוס סידור. כותרות: " + headers.join(" | ") });
  }

  if (lastRow < 2) {
    return jsonResponse({ success: false, error: "טאב ההזמנות ריק" });
  }

  var idColValues = sheet.getRange(2, idIdx + 1, lastRow, idIdx + 1).getDisplayValues();
  var matchRow = -1;
  for (var i = 0; i < idColValues.length; i++) {
    if (ordersCellStr_(idColValues[i][0]) === orderId) {
      if (matchRow >= 0) {
        return jsonResponse({
          success: false,
          error: "נמצאו מספר שורות עם אותו מס' הזמנה: " + orderId,
        });
      }
      matchRow = i + 2;
    }
  }
  if (matchRow < 0) {
    return jsonResponse({ success: false, error: "הזמנה לא נמצאה: " + orderId });
  }

  sheet.getRange(matchRow, statusIdx + 1).setValue(status);
  SpreadsheetApp.flush();

  var written = ordersCellStr_(sheet.getRange(matchRow, statusIdx + 1).getDisplayValue());
  if (written !== status) {
    return jsonResponse({
      success: false,
      error: "כתיבה לא אומתה בקריאה חוזרת (נקרא: " + written + ")",
      orderId: orderId,
      row: matchRow,
    });
  }

  if (typeof invalidateWorkroomSheetCache_ === "function") {
    try { invalidateWorkroomSheetCache_(); } catch (ignore) {}
  }

  return jsonResponse({
    success: true,
    orderId: orderId,
    status: written,
    row: matchRow,
    tab: sheet.getName(),
    updatedAt: new Date().toISOString(),
  });
}
