# הוספת קריאה וכתיבה להזמנות ב-Code.gs

הקטע הזה מיועד לשילוב בקובץ Code.gs הקיים. הוא **לא מחליף** את doGet/doPost שלך: הוסף את הנתיבים במקומות שמצוינים ושמור את שאר הפעולות הקיימות.

## 1. הוספה ל-doGet(e)

הוסף אחרי בדיקת `checkAuth(token)` ולפני `getNotes`:

```javascript
if (action === "getOrders") {
  return handleGetOrders(p);
}
```

## 2. הוספה ל-doPost(e)

הוסף אחרי `const action = body.action || "";` ולפני פעולות ה-fallback:

```javascript
if (action === "updateOrder" || action === "updateOrderStatus" || action === "assignOrder") {
  return handleUpdateOrder_(body, action);
}
```

הנתיב נמצא אחרי checkAuth הקיים, ולכן כל פעולת כתיבה מחייבת token תקף.

## 3. הוסף את הפונקציות הבאות ל-Code.gs

```javascript
const NOA_ORDERS_TAB_NAME = "הזמנות";

function noaOrdersSheet_() {
  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(NOA_ORDERS_TAB_NAME);
  if (!sheet) throw new Error('לא נמצאה לשונית "' + NOA_ORDERS_TAB_NAME + '"');
  return sheet;
}

function noaHeaderKey_(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[׳״']/g, "")
    .replace(/[\\s_\\-]+/g, "");
}

function noaFindColumn_(headers, aliases) {
  const keys = headers.map(noaHeaderKey_);
  for (let i = 0; i < aliases.length; i++) {
    const index = keys.indexOf(noaHeaderKey_(aliases[i]));
    if (index >= 0) return index;
  }
  return -1;
}

function noaCell_(row, headers, aliases) {
  const col = noaFindColumn_(headers, aliases);
  return col < 0 ? "" : row[col];
}

function handleGetOrders(p) {
  const sheet = noaOrdersSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return jsonResponse({ success: true, orders: [] });

  const headers = values[0];
  const orders = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = String(noaCell_(row, headers, [
      "מספר הזמנה", "מס' הזמנה", "מס הזמנה", "מספר הזמנה קומקס", "orderId", "orderNumber", "id"
    ]) || "").trim();
    if (!id) continue;

    const manifest = String(noaCell_(row, headers, [
      "פירוט מוצרים", "פירוט פריטים", "מוצרים", "פריטים", "מניפסט", "items"
    ]) || "").trim();
    const weight = noaCell_(row, headers, ["משקל (טון)", "משקל טון", "משקל", "weight"]);
    const deposits = noaCell_(row, headers, ["פיקדונות", "פיקדון", "שקי פיקדון", "משטחי פיקדון", "deposits"]);
    orders.push({
      id: id,
      customer: String(noaCell_(row, headers, ["שם לקוח", "לקוח", "customer", "customerName"]) || ""),
      phone: String(noaCell_(row, headers, ["איש קשר וטלפון", "טלפון", "טלפון לקוח", "נייד", "phone"]) || ""),
      address: String(noaCell_(row, headers, ["כתובת אספקה", "כתובת אתר", "כתובת", "deliveryAddress", "address"]) || ""),
      date: String(noaCell_(row, headers, ["תאריך אספקה", "תאריך", "deliveryDate", "date"]) || ""),
      window: String(noaCell_(row, headers, ["שעת אספקה", "חלון אספקה", "שעה", "deliveryWindow", "window"]) || "לא הוגדרה שעה"),
      yard: String(noaCell_(row, headers, ["מחסן מוצא", "מחסן", "warehouse", "yard"]) || ""),
      driver: String(noaCell_(row, headers, ["נהג / משאית", "נהג ומשאית", "נהג", "נהג משובץ", "driver", "driverName"]) || ""),
      status: String(noaCell_(row, headers, ["סטטוס סידור", "סטטוס הזמנה", "סטטוס", "status"]) || "פתוחה"),
      manifest: manifest,
      weight: String(weight || ""),
      deposits: String(deposits || ""),
      deliveryNoteNumber: String(noaCell_(row, headers, ["מספר תעודת משלוח", "מס תעודת משלוח", "תעודת משלוח", "deliveryNoteNumber"]) || ""),
      wazeUrl: String(noaCell_(row, headers, ["קישור Waze", "Waze", "wazeUrl"]) || ""),
      notes: String(noaCell_(row, headers, ["הערות", "הערה", "notes"]) || ""),
      rowNumber: r + 1
    });
  }
  return jsonResponse({
    success: true,
    source: NOA_ORDERS_TAB_NAME,
    updatedAt: new Date().toISOString(),
    orders: orders
  });
}

function handleUpdateOrder_(body, action) {
  const id = String(body.orderId || body.id || body.orderNumber || "").trim();
  if (!id) return jsonResponse({ success: false, error: "missing_order_id" });

  const sheet = noaOrdersSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return jsonResponse({ success: false, error: "orders_sheet_empty" });

  const headers = values[0];
  const idCol = noaFindColumn_(headers, [
    "מספר הזמנה", "מס' הזמנה", "מס הזמנה", "מספר הזמנה קומקס", "orderId", "orderNumber", "id"
  ]);
  if (idCol < 0) return jsonResponse({ success: false, error: "order_id_column_not_found" });

  // Match as text to preserve leading zeros and avoid accidental numeric coercion.
  let rowNumber = -1;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idCol] || "").trim() === id) {
      rowNumber = r + 1;
      break;
    }
  }
  if (rowNumber < 0) return jsonResponse({ success: false, error: "order_not_found", orderId: id });

  const fields = action === "updateOrderStatus"
    ? { status: body.status }
    : action === "assignOrder"
      ? {
          driver: body.driver,
          yard: body.yard,
          window: body.window
        }
      : {
          status: body.status,
          driver: body.driver,
          yard: body.yard,
          window: body.window,
          address: body.address,
          notes: body.notes,
          deliveryNoteNumber: body.deliveryNoteNumber
        };

  const aliasesByField = {
    status: ["סטטוס סידור", "סטטוס הזמנה", "סטטוס", "status"],
    driver: ["נהג / משאית", "נהג ומשאית", "נהג משובץ", "נהג", "driver", "driverName"],
    yard: ["מחסן מוצא", "מחסן", "warehouse", "yard"],
    window: ["שעת אספקה", "חלון אספקה", "שעה", "deliveryWindow", "window"],
    address: ["כתובת אספקה", "כתובת אתר", "כתובת", "deliveryAddress", "address"],
    notes: ["הערות", "הערה", "notes"],
    deliveryNoteNumber: ["מספר תעודת משלוח", "מס תעודת משלוח", "תעודת משלוח", "deliveryNoteNumber"]
  };

  const changes = [];
  Object.keys(fields).forEach(function (field) {
    if (fields[field] === undefined || fields[field] === null) return;
    if (typeof fields[field] !== "string" && typeof fields[field] !== "number" && typeof fields[field] !== "boolean") {
      throw new Error("invalid_field_type:" + field);
    }
    const value = String(fields[field]).trim();
    if (value.length > 2000) throw new Error("field_too_long:" + field);
    const col = noaFindColumn_(headers, aliasesByField[field] || []);
    if (col >= 0) changes.push({ col: col + 1, field: field, value: value });
  });

  if (!changes.length) {
    return jsonResponse({ success: false, error: "no_supported_fields_or_columns" });
  }

  // Write only allow-listed fields; never accept a column number/name from the caller.
  changes.forEach(function (change) {
    sheet.getRange(rowNumber, change.col).setValue(change.value);
  });
  SpreadsheetApp.flush();

  return jsonResponse({
    success: true,
    action: action,
    orderId: id,
    rowNumber: rowNumber,
    updatedFields: changes.map(function (c) { return c.field; }),
    updatedAt: new Date().toISOString()
  });
}
```

## 4. בקשות API

כל קריאה שאינה ping מחייבת את ה-token שכבר מוגדר בשרת.

קריאה (GET):
`/exec?action=getOrders&token=YOUR_TOKEN`

עדכון סטטוס (POST JSON):
```json
{
  "action": "updateOrderStatus",
  "token": "YOUR_TOKEN",
  "orderId": "6215560",
  "status": "בהעמסה"
}
```

שיבוץ (POST JSON):
```json
{
  "action": "assignOrder",
  "token": "YOUR_TOKEN",
  "orderId": "6215560",
  "driver": "חכמת / מנוף",
  "yard": "מחסן 4 החרש 10",
  "window": "ביחד"
}
```

עדכון שדות מורחב:
```json
{
  "action": "updateOrder",
  "token": "YOUR_TOKEN",
  "orderId": "6215560",
  "status": "בדרך",
  "driver": "עלי",
  "address": "כתובת אספקה",
  "notes": "הערה תפעולית"
}
```

## נקודות שצריך לאמת לפני פריסה
- הפונקציות משתמשות ב-`MASTER_SHEET_ID` וב-`jsonResponse` הקיימים בפרויקט שלך.
- שמות הכותרות מותאמים לפי aliases נפוצים. יש להשוות אותם לכותרות המדויקות בטאב שלך לפני שמבצעים כתיבה.
- אם יש כמה שורות עם אותו מספר הזמנה, פעולת הכתיבה תעדכן את ההתאמה הראשונה בלבד. יש לוודא שמספר ההזמנה ייחודי בטאב.
- ה-API קורא וכותב לפי מספר הזמנה; הוא לא מוסיף או מוחק שורות.
- אם השרת רץ כ-Web App, יש לפרוס גרסה חדשה אחרי שמירת הקוד.
- אין להכניס token קבוע בקוד דפדפן או במשתנה VITE_*. בקשות כתיבה מהדפדפן צריכות לעבור דרך שרת מאובטח ששומר את הסוד, או דרך מנגנון האימות הקיים.
