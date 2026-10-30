# גל 1 — תיקון doPost + פריסת Orders.gs

## 1. הוסף את הקובץ `apps-script/Orders.gs` לפרויקט Apps Script

(העתק ממאגר GitHub → קובץ חדש בשם Orders.gs)

## 2. מחק/החלף את `handleGetOrders_` הישן ב-Code.gs

אם קיימת גרסה ישנה שמחזירה `order[h] = row[i]` — מחק אותה כדי למנוע כפילות פונקציות.

## 3. ב-doPost, לפני unknown action

```javascript
if (action === "updateOrderStatus") {
  return handleUpdateOrderStatus_(body);
}
```

## 4. Deploy

Manage deployments → Edit → New version → Anyone

## 5. אימות

- `GET ?action=getOrders&token=…` מחזיר `customerNo`, `driver`, `status` מתוך **סטטוס סידור**
- `POST { action:"updateOrderStatus", orderId:"6215849", status:"…", token }` → נשמר בגיליון + קריאה חוזרת
- `row-…` נחסם
