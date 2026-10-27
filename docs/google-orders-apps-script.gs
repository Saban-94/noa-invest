/**
 * נועה AI — API לקריאת טאב "הזמנות" מ-Google Sheets
 * ניתן להדביק את הפונקציות בקובץ Code.gs הקיים.
 *
 * Deploy as Web app (Execute as: Me). For production, add server-side
 * authentication and restrict access; do not expose private tokens in VITE_*.
 */
const NOA_ORDERS_SPREADSHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
const NOA_ORDERS_TAB_NAME = "הזמנות";

function handleGetOrders_(params) {
  const spreadsheetId = String(params.sheetId || NOA_ORDERS_SPREADSHEET_ID).trim();
  const tabName = String(params.tab || NOA_ORDERS_TAB_NAME).trim();
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'לא נמצאה לשונית בשם "' + tabName + '"',
      availableTabs: ss.getSheets().map(function (s) { return s.getName(); })
    })).setMimeType(ContentService.MimeType.JSON);
  }
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length || values.length < 2) {
    return ContentService.createTextOutput(JSON.stringify({ success: true, orders: [], source: tabName }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const headers = values[0].map(function (h) { return String(h || "").trim(); });
  const indexOfAny = function (aliases) {
    const normalized = headers.map(function (h) { return h.toLowerCase().replace(/[׳״']/g, "").replace(/\s+/g, " "); });
    for (var i = 0; i < aliases.length; i++) {
      const alias = String(aliases[i]).toLowerCase().replace(/[׳״']/g, "").replace(/\s+/g, " ");
      const found = normalized.indexOf(alias);
      if (found >= 0) return found;
    }
    return -1;
  };
  const get = function (row, aliases) {
    const i = indexOfAny(aliases);
    return i < 0 ? "" : String(row[i] || "").trim();
  };
  const itemHeaders = {
    name: ["שם פריט", "פריט", "מוצר", "שם מוצר", "תיאור פריט", "item", "product", "name"],
    qty: ["כמות", "כמות להזמנה", "כמות אספקה", "qty", "quantity"],
    unit: ["יחידה", "יחידת מידה", "unit"],
    weightKg: ["משקל ליחידה קג", "משקל יחידה", "משקל קג", "weightkg"]
  };
  const orderIdAliases = ["מספר הזמנה", "מס הזמנה", "הזמנה", "מס הזמנה קומקס", "orderid", "ordernumber", "id"];
  const orderIndex = indexOfAny(orderIdAliases);
  const itemsIndex = indexOfAny(["פריטים", "פירוט פריטים", "מניפסט", "items"]);
  const orders = [];
  for (var r = 1; r < values.length; r++) {
    const row = values[r];
    const id = orderIndex >= 0 ? String(row[orderIndex] || "").trim() : "";
    if (!id) continue;
    var items = [];
    if (itemsIndex >= 0 && row[itemsIndex]) {
      try {
        const parsed = JSON.parse(row[itemsIndex]);
        if (Array.isArray(parsed)) items = parsed;
      } catch (ignore) {
        // A free-text manifest is not safely convertible to structured line items.
      }
    }
    // If the tab is one-row-per-item, group repeated order numbers into one order.
    const itemName = get(row, itemHeaders.name);
    const itemQty = Number(get(row, itemHeaders.qty).replace(/,/g, "")) || 0;
    if (!items.length && itemName) {
      items = [{ name: itemName, qty: itemQty, unit: get(row, itemHeaders.unit) || "יח׳",
        weightKg: Number(get(row, itemHeaders.weightKg).replace(/,/g, "")) || 0 }];
    }
    const order = {
      id: id,
      customer: get(row, ["שם לקוח", "לקוח", "שם לקוח קומקס", "customer", "customername"]),
      phone: get(row, ["טלפון", "טלפון לקוח", "נייד", "phone", "customerphone"]),
      address: get(row, ["כתובת אספקה", "כתובת אתר", "כתובת", "deliveryaddress", "address"]),
      date: get(row, ["תאריך אספקה", "תאריך", "deliverydate", "date"]),
      window: get(row, ["חלון אספקה", "שעת אספקה", "שעה", "deliverywindow", "window"]) || "לא הוגדרה שעה",
      yard: get(row, ["מחסן מוצא", "מחסן", "yard", "warehouse"]) || "מחסן 4 החרש 10",
      driver: get(row, ["נהג", "נהג משובץ", "נהג ורכב", "driver", "drivername"]),
      status: get(row, ["סטטוס הזמנה", "סטטוס", "status", "deliverystatus"]) || "פתוחה",
      items: items
    };
    const existing = orders.find(function (o) { return o.id === id; });
    if (existing) {
      if (itemName && !existing.items.some(function (it) { return it.name === itemName; })) {
        existing.items.push({ name: itemName, qty: itemQty, unit: get(row, itemHeaders.unit) || "יח׳",
          weightKg: Number(get(row, itemHeaders.weightKg).replace(/,/g, "")) || 0 });
      }
    } else {
      orders.push(order);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    success: true, source: tabName, updatedAt: new Date().toISOString(), orders: orders
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Add this branch inside the existing doGet(e), before its unknown-action fallback:
 * if (String((e.parameter || {}).action || "") === "getOrders") return handleGetOrders_(e.parameter || {});
 *
 * If the existing doGet requires a token for all non-ping actions, call this branch
 * only AFTER that existing authentication check.
 */
