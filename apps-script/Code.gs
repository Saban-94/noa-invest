/**
 * נועה AI / Saban Flow — קוד שרת Google Apps Script (Code.gs)
 * גיליון: 1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw ("בדיקת תעודות משלוח")
 *
 * הוראות התקנה:
 * 1. היכנס ל-https://script.google.com ופתח את הפרויקט.
 * 2. הדבק את הקוד הזה בקובץ Code.gs ושמור (Ctrl+S / סמל דיסק).
 * 3. לחץ על 'Deploy' (פריסה) -> 'Manage deployments' (ניהול פריסות) -> ערוך (עפרון) -> בחר 'New version' (גרסה חדשה).
 * 4. ודא: Execute as: "Me", Who has access: "Anyone" (כל אחד, אפילו אנונימי).
 * 5. לחץ Deploy והעתק את הכתובת שמסתיימת ב-/exec.
 */

const API_VERSION = "2026-10-21-v5-prod";
const MASTER_SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
const TAB_GALYA = "ארכיון_תעודות_גליה";

function getSecretToken() {
  const prop = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  return prop || "";
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkAuth(token) {
  const valid = getSecretToken();
  return token && String(token).trim() === String(valid).trim();
}

/**
 * מטפל בקריאות GET
 * ?action=ping&token=...
 * ?action=getNotes&token=...
 * ?action=getFile&id=...&token=...
 */
function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = p.action || "ping";
    const token = p.token || "";

    if (action === "ping") {
      return jsonResponse({
        success: true,
        version: API_VERSION,
        sheetId: MASTER_SHEET_ID,
        timestamp: new Date().toISOString(),
      });
    }

    if (!checkAuth(token)) {
      return jsonResponse({ success: false, error: "unauthorized" });
    }

    if (action === "getNotes") {
      return handleGetNotes(p);
    }

    if (action === "getRamiInquiries") {
      return handleGetRamiInquiries();
    }

    if (action === "getFile") {
      return handleGetFile(p.id);
    }

    return jsonResponse({ success: false, error: "unknown action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * מטפל בקריאות POST
 * { action: "saveSignedNote", token, noteId, customer, signedBy, statusNote, signedScanDataUrl }
 * { action: "submitApproval", token, noteId, approver, note }
 */
function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    const token = body.token || "";
    if (!checkAuth(token)) {
      return jsonResponse({ success: false, error: "unauthorized" });
    }

    const action = body.action || "";

    if (action === "ping") {
      return jsonResponse({ success: true, version: API_VERSION });
    }

    if (action === "submitApproval") {
      return handleSubmitApproval(body);
    }

    if (action === "submitRamiReply") {
      return handleSubmitRamiReply(body);
    }

    if (action === "saveInquiryAnnotations") {
      return handleSaveInquiryAnnotations(body);
    }

    if (action === "saveSignedNote") {
      return handleSaveSignedNote(body);
    }

    return jsonResponse({ success: false, error: "unknown action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

function handleGetNotes(params) {
  const ss = SpreadsheetApp.openById(params.sheetId || MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(TAB_GALYA);
  if (!sheet) {
    return jsonResponse({ success: false, error: "Sheet tab not found: " + TAB_GALYA });
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  if (values.length <= 1) {
    return jsonResponse({ success: true, notes: [] });
  }
  // Read-only metadata: preserve formulas and rich-text hyperlinks without editing the sheet.
  const formulas = dataRange.getFormulas();
  const richTextValues = dataRange.getRichTextValues();

  const headers = values[0].map(h => String(h || "").trim());
  const col = (name) => headers.indexOf(name);

  const idxDateRec = col("תאריך קליטה");
  const idxDateDoc = headerIndex_(headers, ["תאריך תעודה", "תאריך אספקה", "תאריך", "date", "deliveryDate"]);
  const idxTimeDoc = headerIndex_(headers, ["שעת תעודה", "שעת אספקה", "שעה", "time"]);
  const idxDocNum = headerIndex_(headers, ["מס' תעודת משלוח", "מס׳ תעודת משלוח", "מספר תעודת משלוח", "מספר ת.מ", "מספר תעודה", "מס׳ תעודה", "docNumber", "noteId", "id"]);
  const idxOrderNum = headerIndex_(headers, ["מס' הזמנה", "מס׳ הזמנה", "מספר הזמנה", "בגין הזמנה", "comaxOrder", "orderId"]);
  const idxCustNum = headerIndex_(headers, ["מס' לקוח", "מס׳ לקוח", "מספר לקוח", "customerNo"]);
  const idxCustName = headerIndex_(headers, ["שם לקוח", "לקוח", "customer", "customerName"]);
  const idxAddress = headerIndex_(headers, ["כתובת אספקה", "כתובת יעד", "כתובת אתר", "כתובת", "address", "siteAddress"]);
  const idxDriver = headerIndex_(headers, ["נהג", "נהג משוייך", "נהג ורכב", "driver"]);
  const idxTruck = headerIndex_(headers, ["רישוי / משאית", "מספר רכב", "משאית", "רכב", "truck"]);
  const idxLink = headerIndex_(headers, ["קישור לתעודה", "קישור סריקה", "קישור לקובץ סריקה", "קישור קובץ Drive", "קישור דרייב", "קישור לקובץ", "מזהה קובץ Drive", "driveUrl", "driveLink", "fileUrl"]);
  const idxItems = headerIndex_(headers, ["פריטים", "פירוט מוצרים ומק״טים", "סחורה מפורטת", "items"]);
  const idxDeposits = headerIndex_(headers, ["פיקדונות", "פקדונות", "בלות פקדון (60002)", "משטחי סבן (60060)", "deposits"]);
  const idxCrane = headerIndex_(headers, ["זמני מנוף / המתנה", "זמני מנוף/פריקה", "זמן פריקה/מנוף", "craneNotes"]);
  const idxSourceFile = col("קובץ מקור");
  const idxExtractStatus = headerIndex_(headers, ["סטטוס חילוץ", "extractStatus"]);
  const idxUniqueKey = headerIndex_(headers, ["מפתח ייחודי", "key", "uniqueKey"]);
  const idxApprovalStatus = headerIndex_(headers, ["סטטוס אישור", "סטטוס", "approvalStatus"]);
  const idxSignedLink = headerIndex_(headers, ["קישור חתום", "קישור PDF חתום", "קישור סריקה חתומה", "signedUrl", "signedLink"]);
  const idxRami = headerIndex_(headers, ["אישור ראמי", "חתימת ראמי", "ramiApprovedAt"]);
  const idxHarel = headerIndex_(headers, ["אישור הראל", "חתימת הראל", "harelApprovedAt"]);

  const notes = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const docNum = String(row[idxDocNum] || "").trim();
    if (!docNum) continue;

    const headerLinkValue = idxLink >= 0
      ? driveLinkFromCell_(row[idxLink], formulas[r][idxLink], richTextValues[r][idxLink])
      : "";
    // Support the actual scan-link locations K and T as read-only fallbacks.
    const columnKLink = row.length > 10
      ? driveLinkFromCell_(row[10], formulas[r][10], richTextValues[r][10])
      : "";
    const columnTLink = row.length > 19
      ? driveLinkFromCell_(row[19], formulas[r][19], richTextValues[r][19])
      : "";
    const signedLinkRaw = idxSignedLink >= 0
      ? driveLinkFromCell_(row[idxSignedLink], formulas[r][idxSignedLink], richTextValues[r][idxSignedLink])
      : "";
    const link = headerLinkValue || columnKLink || columnTLink;
    const signedLink = signedLinkRaw;
    const sourceLink = signedLink || link;
    const fileId = extractDriveFileId_(sourceLink);

    notes.push({
      id: docNum,
      key: idxUniqueKey >= 0 ? String(row[idxUniqueKey] || docNum) : docNum,
      date: idxDateDoc >= 0 ? String(row[idxDateDoc] || "") : "",
      time: idxTimeDoc >= 0 ? String(row[idxTimeDoc] || "") : "",
      docNumber: docNum,
      comaxOrder: idxOrderNum >= 0 ? String(row[idxOrderNum] || docNum) : docNum,
      customerNo: idxCustNum >= 0 ? String(row[idxCustNum] || "") : "",
      customer: idxCustName >= 0 ? String(row[idxCustName] || "") : "",
      address: idxAddress >= 0 ? String(row[idxAddress] || "") : "",
      driver: idxDriver >= 0 ? String(row[idxDriver] || "") : "",
      truck: idxTruck >= 0 ? String(row[idxTruck] || "") : "",
      fileId: fileId,
      driveUrl: signedLink || link,
      items: [],
      depositsText: idxDeposits >= 0 ? String(row[idxDeposits] || "") : "",
      craneNotes: idxCrane >= 0 ? String(row[idxCrane] || "") : "",
      extractStatus: idxExtractStatus >= 0 ? String(row[idxExtractStatus] || "") : "",
      approvalStatus: idxApprovalStatus >= 0 ? String(row[idxApprovalStatus] || "") : "",
      signedUrl: signedLink,
      ramiApprovedAt: idxRami >= 0 ? String(row[idxRami] || "") : "",
      harelApprovedAt: idxHarel >= 0 ? String(row[idxHarel] || "") : "",
    });
  }

  return jsonResponse({ success: true, notes: notes });
}

function handleGetFile(fileId) {
  if (!fileId) {
    return jsonResponse({ success: false, error: "Missing file id" });
  }
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  return jsonResponse({
    success: true,
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes()),
    name: file.getName(),
  });
}

function handleSubmitApproval(body) {
  const noteId = String(body.noteId || "").trim();
  const approver = body.approver; // "rami" | "harel"
  const note = body.note || "";

  if (!noteId) return jsonResponse({ success: false, error: "Missing noteId" });

  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(TAB_GALYA);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || "").trim());

  const idxDocNum = headers.indexOf("מס' תעודת משלוח");
  const idxApprovalStatus = headers.indexOf("סטטוס אישור");
  const idxRami = headers.indexOf("אישור ראמי");
  const idxHarel = headers.indexOf("אישור הראל");
  const idxNote = headers.indexOf("הערת אישור");

  const nowStr = Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm");

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idxDocNum] || "").trim() === noteId) {
      const rowNum = r + 1;
      if (approver === "rami") {
        if (idxRami >= 0) sheet.getRange(rowNum, idxRami + 1).setValue(nowStr);
        if (idxApprovalStatus >= 0) sheet.getRange(rowNum, idxApprovalStatus + 1).setValue("ממתין לאישור מנכ״ל");
      } else if (approver === "harel") {
        if (idxHarel >= 0) sheet.getRange(rowNum, idxHarel + 1).setValue(nowStr);
        if (idxApprovalStatus >= 0) sheet.getRange(rowNum, idxApprovalStatus + 1).setValue("מאושר לחיוב");
      }
      if (idxNote >= 0 && note) {
        const prev = sheet.getRange(rowNum, idxNote + 1).getValue();
        sheet.getRange(rowNum, idxNote + 1).setValue((prev ? prev + " | " : "") + approver + ": " + note);
      }
      SpreadsheetApp.flush();
      return jsonResponse({ success: true, noteId: noteId, approver: approver });
    }
  }

  return jsonResponse({ success: false, error: "Note not found in sheet: " + noteId });
}

function handleSaveSignedNote(body) {
  const noteId = String(body.noteId || "").trim();
  const customer = String(body.customer || "").trim();
  const signedScanDataUrl = body.signedScanDataUrl || "";
  const statusNote = body.statusNote || "נבדק ונחתם בקנבס";

  if (!noteId || !signedScanDataUrl) {
    return jsonResponse({ success: false, error: "Missing noteId or image dataUrl" });
  }

  // חילוץ תמונת ה-PNG
  const base64Data = signedScanDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, "image/png", "תעודה_" + noteId + "_חתומה.png");

  // מציאת או יצירת תיקיית לקוח
  let targetFolder = DriveApp.getRootFolder();
  const rootFolders = DriveApp.getFoldersByName("תיקיות לקוחות");
  if (rootFolders.hasNext()) {
    const parentFolder = rootFolders.next();
    const custFolders = parentFolder.getFoldersByName(customer);
    targetFolder = custFolders.hasNext() ? custFolders.next() : parentFolder;
  }

  // שמירה ישירה ל-Drive (ללא צורך ב-DocumentApp ומניעת שגיאות הרשאה)
  const savedFile = targetFolder.createFile(blob);
  const fileUrl = savedFile.getUrl();

  // עדכון הגיליון
  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(TAB_GALYA);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || "").trim());

  const idxDocNum = headers.indexOf("מס' תעודת משלוח");
  const idxSignedLink = headers.indexOf("קישור חתום");
  const idxApprovalStatus = headers.indexOf("סטטוס אישור");
  const idxRami = headers.indexOf("אישור ראמי");
  const idxNote = headers.indexOf("הערת אישור");

  const nowStr = Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm");

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idxDocNum] || "").trim() === noteId) {
      const rowNum = r + 1;
      if (idxSignedLink >= 0) sheet.getRange(rowNum, idxSignedLink + 1).setValue(fileUrl);
      if (idxRami >= 0) sheet.getRange(rowNum, idxRami + 1).setValue(nowStr);
      if (idxApprovalStatus >= 0) sheet.getRange(rowNum, idxApprovalStatus + 1).setValue("ממתין לאישור מנכ״ל");
      if (idxNote >= 0) sheet.getRange(rowNum, idxNote + 1).setValue(statusNote);
      SpreadsheetApp.flush();
      break;
    }
  }

  return jsonResponse({
    success: true,
    driveUrl: fileUrl,
    folder: targetFolder.getName(),
  });
}


/* ------------------------------------------------------------------ */
/* בירור ראמי: שליפה, שמירת מענה ושכבת סימון                             */
/* ------------------------------------------------------------------ */

function getInquirySheet_() {
  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const candidates = ["בירור_ראמי", "בירור ראמי", "בירור_ראמי ", TAB_GALYA];
  for (const name of candidates) {
    const sheet = ss.getSheetByName(name);
    if (sheet) return sheet;
  }
  throw new Error("לא נמצא גיליון בירור ראמי או ארכיון תעודות");
}

/**
 * Resolve a Drive link from a cell's raw value, HYPERLINK formula, or rich-text link.
 * This function only reads the sheet; it never writes or alters cell content.
 */
function driveLinkFromCell_(value, formula, richText) {
  const formulaMatch = String(formula == null ? "" : formula).match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
  const candidates = [
    richText && typeof richText.getLinkUrl === "function" ? richText.getLinkUrl() : "",
    String(value == null ? "" : value).trim(),
    formulaMatch ? formulaMatch[1] : "",
  ];
  for (const candidate of candidates) {
    const textValue = String(candidate || "").trim();
    if (/https?:\/\/(?:drive|docs)\.google\.com\//i.test(textValue)) return textValue;
    if (/^[A-Za-z0-9_-]{25,}$/.test(textValue)) return textValue;
  }
  return "";
}

function extractDriveFileId_(urlOrId) {
  const raw = String(urlOrId || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/d\/([A-Za-z0-9_-]+)/) || raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
  const id = match ? match[1] : (/^[A-Za-z0-9_-]{25,}$/.test(raw) ? raw : "");
  return id || "";
}

function headerIndex_(headers, names) {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

function ensureHeader_(sheet, headers, names, preferredName) {
  const existing = headerIndex_(headers, names);
  if (existing >= 0) return existing;
  const index = headers.length;
  sheet.getRange(1, index + 1).setValue(preferredName);
  headers.push(preferredName);
  return index;
}

function inquiryRow_(sheet, noteId, headers) {
  const idIndex = headerIndex_(headers, ["מס' תעודת משלוח", "מס׳ תעודה", "מספר תעודה", "מספר ת.מ", "docNumber", "noteId", "id"]);
  if (idIndex < 0) throw new Error("לא נמצאה עמודת מספר תעודה בגיליון הבירור");
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIndex] || "").trim() === noteId) return r + 1;
  }
  return -1;
}

function handleGetRamiInquiries() {
  const sheet = getInquirySheet_();
  const values = sheet.getDataRange().getValues();
  if (!values.length) return jsonResponse({ success: true, inquiries: [] });
  const headers = values[0].map(h => String(h || "").trim());
  const idx = (names) => headerIndex_(headers, names);
  const docIdx = idx(["מס' תעודת משלוח", "מס׳ תעודה", "מספר תעודה", "מספר ת.מ", "docNumber", "noteId", "id"]);
  if (docIdx < 0) return jsonResponse({ success: false, error: "לא נמצאה עמודת מספר תעודה" });
  const inquiries = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const docNumber = String(row[docIdx] || "").trim();
    if (!docNumber) continue;
    const get = (names) => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i >= 0) {
          const value = String(row[i] || "").trim();
          if (value) return value;
        }
      }
      return "";
    };
    const driveUrl = get(["קישור חתום", "קישור לתעודה", "קישור קובץ Drive", "קישור דרייב", "driveUrl", "driveLink"]);
    const fileMatch = driveUrl.match(/[-\w]{25,}/);
    inquiries.push({
      rowIndex: r + 1,
      id: docNumber,
      docNumber: docNumber,
      receivedDate: get(["תאריך קליטה", "תאריך תעודה", "date", "receivedDate"]),
      date: get(["תאריך תעודה", "תאריך קליטה", "date"]),
      customer: get(["שם לקוח", "customer", "customerName"]),
      address: get(["כתובת אספקה", "כתובת", "address"]),
      driver: get(["נהג", "נהג ורכב", "driver"]),
      issue: get(["תיאור החריגה / הטעות שזוהתה", "תיאור חריגה", "הערת אישור", "errorReason", "issue"]),
      errorReason: get(["תיאור החריגה / הטעות שזוהתה", "תיאור חריגה", "errorReason", "issue"]),
      aiAnalysis: get(["ניתוח AI וכתב יד", "ניתוח AI", "aiAnalysis"]),
      ramiReply: get(["הסבר ומענה מראמי", "מענה ראמי", "ramiReply"]),
      status: get(["סטטוס בירור", "סטטוס אישור", "status"]) || "ממתין לטיפול",
      harelApproval: get(["אושר ע״י הראל", "אישור הראל", "harelApproval"]),
      fileId: fileMatch ? fileMatch[0] : "",
      driveUrl: driveUrl,
      driveLink: driveUrl,
      rounds: [],
    });
  }
  return jsonResponse({ success: true, inquiries: inquiries });
}

function handleSubmitRamiReply(body) {
  const noteId = String(body.noteId || "").trim();
  const reply = String(body.text || "").trim();
  if (!noteId) return jsonResponse({ success: false, error: "חסר מספר תעודה" });
  if (reply.length < 3) return jsonResponse({ success: false, error: "המענה קצר מדי" });
  if (reply.length > 2000) return jsonResponse({ success: false, error: "המענה ארוך מדי" });

  const sheet = getInquirySheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
  const rowNum = inquiryRow_(sheet, noteId, headers);
  if (rowNum < 0) return jsonResponse({ success: false, error: "התעודה לא נמצאה בגיליון הבירור" });

  const replyIdx = ensureHeader_(sheet, headers, ["הסבר ומענה מראמי", "מענה ראמי", "ramiReply"], "הסבר ומענה מראמי");
  const statusIdx = ensureHeader_(sheet, headers, ["סטטוס בירור", "סטטוס אישור", "status"], "סטטוס בירור");
  const prev = String(sheet.getRange(rowNum, replyIdx + 1).getValue() || "").trim();
  const nowStr = Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm");
  const entry = "[" + nowStr + "] ראמי: " + reply;
  sheet.getRange(rowNum, replyIdx + 1).setValue(prev ? prev + "\n" + entry : entry);
  sheet.getRange(rowNum, statusIdx + 1).setValue("ממתין לאישור הראל");
  SpreadsheetApp.flush();
  return jsonResponse({ success: true, noteId: noteId, status: "ממתין לאישור הראל" });
}

function handleSaveInquiryAnnotations(body) {
  const noteId = String(body.noteId || "").trim();
  const layerData = String(body.pngDataUrl || "");
  const compositeData = String(body.compositeDataUrl || "");
  const annotationJson = String(body.annotationJson || "{}");
  if (!noteId) return jsonResponse({ success: false, error: "חסר מספר תעודה" });
  if (!/^data:image\/png;base64,/.test(layerData) || !/^data:image\/png;base64,/.test(compositeData)) {
    return jsonResponse({ success: false, error: "נדרשות תמונת שכבה ותמונה משולבת בפורמט PNG" });
  }
  if (layerData.length > 25000000 || compositeData.length > 25000000 || annotationJson.length > 1000000) {
    return jsonResponse({ success: false, error: "קובצי הסימון חורגים מהגודל המותר" });
  }

  const sheet = getInquirySheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
  const rowNum = inquiryRow_(sheet, noteId, headers);
  if (rowNum < 0) return jsonResponse({ success: false, error: "התעודה לא נמצאה בגיליון הבירור" });

  const folders = DriveApp.getFoldersByName("תיקי בירור - סימונים");
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("תיקי בירור - סימונים");
  const layerBytes = Utilities.base64Decode(layerData.replace(/^data:image\/png;base64,/, ""));
  const compositeBytes = Utilities.base64Decode(compositeData.replace(/^data:image\/png;base64,/, ""));
  const layerFile = folder.createFile(Utilities.newBlob(layerBytes, "image/png", "בירור_" + noteId + "_שכבת_סימון.png"));
  const compositeFile = folder.createFile(Utilities.newBlob(compositeBytes, "image/png", "בירור_" + noteId + "_תמונה_משולבת.png"));
  const jsonFile = folder.createFile(Utilities.newBlob(annotationJson, "application/json", "בירור_" + noteId + "_נתוני_סימון.json"));

  const layerIdx = ensureHeader_(sheet, headers, ["קישור שכבת סימון"], "קישור שכבת סימון");
  const compositeIdx = ensureHeader_(sheet, headers, ["קישור תמונה משולבת"], "קישור תמונה משולבת");
  const jsonIdx = ensureHeader_(sheet, headers, ["קישור נתוני סימון"], "קישור נתוני סימון");
  sheet.getRange(rowNum, layerIdx + 1).setValue(layerFile.getUrl());
  sheet.getRange(rowNum, compositeIdx + 1).setValue(compositeFile.getUrl());
  sheet.getRange(rowNum, jsonIdx + 1).setValue(jsonFile.getUrl());
  SpreadsheetApp.flush();
  return jsonResponse({
    success: true,
    noteId: noteId,
    driveUrl: compositeFile.getUrl(),
    annotationUrl: layerFile.getUrl(),
    metadataUrl: jsonFile.getUrl(),
  });
}
