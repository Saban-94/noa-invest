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
  return prop || "saban2026";
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

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return jsonResponse({ success: true, notes: [] });
  }

  const headers = values[0].map(h => String(h || "").trim());
  const col = (name) => headers.indexOf(name);

  const idxDateRec = col("תאריך קליטה");
  const idxDateDoc = col("תאריך תעודה");
  const idxTimeDoc = col("שעת תעודה");
  const idxDocNum = col("מס' תעודת משלוח");
  const idxOrderNum = col("מס' הזמנה");
  const idxCustNum = col("מס' לקוח");
  const idxCustName = col("שם לקוח");
  const idxAddress = col("כתובת אספקה");
  const idxDriver = col("נהג");
  const idxTruck = col("רישוי / משאית");
  const idxLink = col("קישור לתעודה");
  const idxItems = col("פריטים");
  const idxDeposits = col("פיקדונות");
  const idxCrane = col("זמני מנוף / המתנה");
  const idxSourceFile = col("קובץ מקור");
  const idxExtractStatus = col("סטטוס חילוץ");
  const idxUniqueKey = col("מפתח ייחודי");
  const idxApprovalStatus = col("סטטוס אישור");
  const idxSignedLink = col("קישור חתום");
  const idxRami = col("אישור ראמי");
  const idxHarel = col("אישור הראל");

  const notes = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const docNum = String(row[idxDocNum] || "").trim();
    if (!docNum) continue;

    const link = idxLink >= 0 ? String(row[idxLink] || "") : "";
    const signedLink = idxSignedLink >= 0 ? String(row[idxSignedLink] || "") : "";
    let fileId = "";
    const m = (signedLink || link).match(/[-\w]{25,}/);
    if (m) fileId = m[0];

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
