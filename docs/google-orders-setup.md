# חיבור טאב הזמנות — נועה AI

הגדר ב-Vercel → Project Settings → Environment Variables את `VITE_NOA_ORDERS_API_URL` לכתובת Web App של Google Apps Script שמסתיימת ב-`/exec`, ואז בצע Redeploy.

הדפדפן יבקש GET עם `action=getOrders`, `sheetId=1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw`, `tab=הזמנות`. ה-API חייב להחזיר JSON בצורה `{ "success": true, "orders": [...] }`. כל הזמנה כוללת `id, customer, phone, address, date, window, yard, driver, status, items`; פריט כולל `name, qty, unit, weightKg`.

**חשוב:** הממשק כרגע לקריאה בלבד. ללא משתנה סביבה יוצגו נתוני הדגמה באופן מפורש. אין לשים סוד/API token במשתנה `VITE_*` כי הוא חשוף בדפדפן. לפני חשיפת נתוני לקוחות אמתיים יש להוסיף אימות והרשאות בצד שרת. ודא ששם הלשונית הוא בדיוק `הזמנות` ושכותרותיה תואמות למתאם הנתונים.
