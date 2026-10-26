/**
 * מוסיפים את הפונקציה לפרויקט Apps Script הקיים; לא מחליפים את Code.gs כולו.
 * doGet צריך לנתב action=getCatalog אל handleGetCatalog_ לאחר בדיקת API_TOKEN.
 */
function getCatalog_() {
  var ss = SpreadsheetApp.openById("1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw");
  var sh = ss.getSheetByName("מילון_לוגיסטי");
  if (!sh) throw new Error('הטאב "מילון_לוגיסטי" לא נמצא');

  var values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) throw new Error('הטאב "מילון_לוגיסטי" ריק');

  var headers = values[0].map(function (h) { return String(h || "").trim(); });
  var required = ['מק"ט (SKU)', 'שם מוצר רשמי (קומקס)', 'קטגוריה לוגיסטית', 'יחידת מידה', 'סלנג ומילות מפתח לנרמול AI', 'סיווג וחישוב פקדונות', 'משקל יח\' (ק"ג)'];
  var missing = required.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) throw new Error("עמודות חסרות בקטלוג: " + missing.join(", "));

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = { _row: i + 1 };
    for (var c = 0; c < headers.length; c++) row[headers[c]] = values[i][c];
    rows.push(row);
  }
  return { success: true, rows: rows, fetchedAt: new Date().toISOString(), totalRows: rows.length };
}
