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

const API_VERSION = "2026-10-25-v6-workroom";
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

    if (action === "getWorkroomInquiries") {
      return handleGetWorkroomInquiries_(p);
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

    if (action === "getWorkroomInquiry") {
      return handleGetWorkroomInquiry_(body);
    }

    if (action === "ramiReply") {
      return handleWorkroomRamiReply_(body);
    }

    if (action === "harelReply") {
      return handleWorkroomHarelReply_(body);
    }

    if (action === "harelDecide") {
      return handleWorkroomHarelDecision_(body);
    }

    if (action === "harelUploadAssign") {
      return handleWorkroomHarelAssign_(body);
    }

    return jsonResponse({ success: false, error: "unknown action: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

function handleGetNotes(params) {
  const notesCacheKey = "notes:v1:" + String(params.sheetId || MASTER_SHEET_ID);
  const cachedNotes = workroomCacheRead_(notesCacheKey);
  if (cachedNotes) return jsonResponse({ success: true, notes: cachedNotes, cachedForSeconds: WORKROOM_CACHE_TTL_SECONDS });
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
  const idxLink = headerIndex_(headers, ["כתובת הקובץ (URL)", "driveFileId", "scanFileId", "fileId", "מזהה קובץ Drive", "driveUrl", "driveLink", "fileUrl", "קישור לתעודה", "קישור סריקה", "קישור לקובץ סריקה", "קישור קובץ Drive", "קישור דרייב", "קישור לקובץ"]);
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
    if (!docNum || /^(ללא[-_ ]?מספר|לא[-_ ]?מספר|test|ddw)/i.test(docNum)) continue;

    const headerLinkValue = [
      ["כתובת הקובץ (URL)", "driveFileId", "scanFileId", "fileId", "מזהה קובץ Drive", "driveUrl", "driveLink", "fileUrl"],
      ["קישור לתעודה", "קישור סריקה", "קישור לקובץ סריקה", "קישור קובץ Drive", "קישור דרייב", "קישור לקובץ"]
    ].map(names => {
      const i = headerIndex_(headers, names);
      return i >= 0 ? driveLinkFromCell_(row[i], formulas[r][i], richTextValues[r][i]) : "";
    }).find(Boolean) || "";
    const columnLLink = row.length > 11
      ? driveLinkFromCell_(row[11], formulas[r][11], richTextValues[r][11])
      : "";
    const columnKLink = row.length > 10
      ? driveLinkFromCell_(row[10], formulas[r][10], richTextValues[r][10])
      : "";
    const columnTLink = row.length > 19
      ? driveLinkFromCell_(row[19], formulas[r][19], richTextValues[r][19])
      : "";
    const signedLinkRaw = idxSignedLink >= 0
      ? driveLinkFromCell_(row[idxSignedLink], formulas[r][idxSignedLink], richTextValues[r][idxSignedLink])
      : "";
    const link = headerLinkValue || columnLLink || columnKLink || columnTLink;
    const signedLink = signedLinkRaw;
    const sourceLink = link || signedLink;
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
      driveUrl: link || signedLink,
      items: [],
      depositsText: idxDeposits >= 0 ? String(row[idxDeposits] || "") : "",
      craneNotes: idxCrane >= 0 ? String(row[idxCrane] || "") : "",
      extractStatus: idxExtractStatus >= 0 ? String(row[idxExtractStatus] || "") : "",
      approvalStatus: idxApprovalStatus >= 0 ? String(row[idxApprovalStatus] || "") : "",
      signedUrl: signedLink,
      ramiApprovedAt: idxRami >= 0 ? String(row[idxRami] || "") : "",
      harelApprovedAt: idxHarel >= 0 ? String(row[idxHarel] || "") : "",
      _score: [link, signedLink, row[idxCustName], row[idxCustNum], row[idxDateDoc], row[idxItems]].filter(v => v != null && String(v).trim()).length,
    });
  }

  // Deduplicate display records by stable certificate number; prefer the most complete row.
  const unique = {};
  notes.forEach(note => {
    const key = workroomKey_(note.docNumber);
    if (!key) return;
    if (!unique[key] || Number(note._score || 0) > Number(unique[key]._score || 0)) unique[key] = note;
  });
  const dedupedNotes = Object.keys(unique).map(key => {
    const note = unique[key];
    delete note._score;
    return note;
  });
  workroomCacheWrite_(notesCacheKey, dedupedNotes);
  return jsonResponse({ success: true, notes: dedupedNotes, cachedForSeconds: WORKROOM_CACHE_TTL_SECONDS });
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
  const approver = String(body.approver || "");
  const note = String(body.note || "").trim();
  if (!noteId) return jsonResponse({ success: false, error: "Missing noteId" });
  if (approver !== "rami" && approver !== "harel") return jsonResponse({ success: false, error: "approver לא תקין" });

  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(TAB_GALYA);
  if (!sheet) return jsonResponse({ success: false, error: "Sheet tab not found: " + TAB_GALYA });
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(h => String(h || "").trim());
  const docIdx = headerIndex_(headers, ["מס' תעודת משלוח", "מס׳ תעודת משלוח", "מספר תעודת משלוח", "מספר ת.מ", "מספר תעודה", "מס׳ תעודה", "docNumber", "noteId", "id"]);
  if (docIdx < 0) return jsonResponse({ success: false, error: "לא נמצאה עמודת מספר תעודה" });
  const rowNum = workroomUniqueRowOrError_(sheet, noteId, headers, docIdx);
  const statusIdx = ensureHeader_(sheet, headers, ["סטטוס אישור"], "סטטוס אישור");
  const ramiIdx = ensureHeader_(sheet, headers, ["אישור ראמי"], "אישור ראמי");
  const harelIdx = ensureHeader_(sheet, headers, ["אישור הראל"], "אישור הראל");
  const noteIdx = ensureHeader_(sheet, headers, ["הערת אישור"], "הערת אישור");
  const nowStr = Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm");

  if (approver === "rami") {
    sheet.getRange(rowNum, ramiIdx + 1).setValue(nowStr);
    sheet.getRange(rowNum, statusIdx + 1).setValue("ממתין לאישור מנכ״ל");
  } else {
    sheet.getRange(rowNum, harelIdx + 1).setValue(nowStr);
    sheet.getRange(rowNum, statusIdx + 1).setValue("מאושר לחיוב");
  }
  if (note) {
    const prev = String(sheet.getRange(rowNum, noteIdx + 1).getValue() || "").trim();
    sheet.getRange(rowNum, noteIdx + 1).setValue((prev ? prev + " | " : "") + approver + ": " + note);
  }
  SpreadsheetApp.flush();
  invalidateWorkroomSheetCache_();
  return jsonResponse({ success: true, noteId: noteId, approver: approver });
}

function handleSaveSignedNote(body) {
  const noteId = String(body.noteId || "").trim();
  const customer = String(body.customer || "").trim();
  const signedScanDataUrl = String(body.signedScanDataUrl || "");
  const statusNote = String(body.statusNote || "נבדק ונחתם בקנבס").trim();

  if (!noteId || !signedScanDataUrl) return jsonResponse({ success: false, error: "Missing noteId or image dataUrl" });
  if (signedScanDataUrl.indexOf("data:image/") !== 0 || signedScanDataUrl.indexOf(";base64,") < 0 || signedScanDataUrl.length > 25000000) {
    return jsonResponse({ success: false, error: "תמונת חתימה לא תקינה או גדולה מדי" });
  }

  // Resolve the unique destination row before creating a Drive file, so duplicate keys
  // cannot cause orphaned files or writes to an arbitrary first match.
  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(TAB_GALYA);
  if (!sheet) return jsonResponse({ success: false, error: "Sheet tab not found: " + TAB_GALYA });
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(h => String(h || "").trim());
  const docIdx = headerIndex_(headers, ["מס' תעודת משלוח", "מס׳ תעודת משלוח", "מספר תעודת משלוח", "מספר ת.מ", "מספר תעודה", "מס׳ תעודה", "docNumber", "noteId", "id"]);
  if (docIdx < 0) return jsonResponse({ success: false, error: "לא נמצאה עמודת מספר תעודה" });
  const rowNum = workroomUniqueRowOrError_(sheet, noteId, headers, docIdx);

  const base64Data = signedScanDataUrl.substring(signedScanDataUrl.indexOf(";base64,") + 8);
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, "image/png", "תעודה_" + noteId + "_חתומה.png");
  let targetFolder = DriveApp.getRootFolder();
  const rootFolders = DriveApp.getFoldersByName("תיקיות לקוחות");
  if (rootFolders.hasNext()) {
    const parentFolder = rootFolders.next();
    if (customer) {
      const custFolders = parentFolder.getFoldersByName(customer);
      targetFolder = custFolders.hasNext() ? custFolders.next() : parentFolder;
    } else {
      targetFolder = parentFolder;
    }
  }
  const savedFile = targetFolder.createFile(blob);
  const fileUrl = savedFile.getUrl();
  const idxSignedLink = ensureHeader_(sheet, headers, ["קישור חתום", "signedUrl", "signedLink"], "קישור חתום");
  const idxApprovalStatus = ensureHeader_(sheet, headers, ["סטטוס אישור"], "סטטוס אישור");
  const idxRami = ensureHeader_(sheet, headers, ["אישור ראמי"], "אישור ראמי");
  const idxNote = ensureHeader_(sheet, headers, ["הערת אישור"], "הערת אישור");
  const nowStr = Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm");
  sheet.getRange(rowNum, idxSignedLink + 1).setValue(fileUrl);
  sheet.getRange(rowNum, idxRami + 1).setValue(nowStr);
  sheet.getRange(rowNum, idxApprovalStatus + 1).setValue("ממתין לאישור מנכ״ל");
  sheet.getRange(rowNum, idxNote + 1).setValue(statusNote);
  SpreadsheetApp.flush();
  invalidateWorkroomSheetCache_();

  return jsonResponse({ success: true, driveUrl: fileUrl, folder: targetFolder.getName() });
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
 * Read-only pre-cleanup audit. Run manually from the Apps Script editor.
 * Does not delete rows, edit cells, or alter triggers.
 */
function auditInquirySheet() {
  const sheet = getInquirySheet_();
  const range = sheet.getDataRange();
  const values = range.getValues();
  const formulas = range.getFormulas();
  const rich = range.getRichTextValues();
  const headers = values.length ? values[0].map(h => String(h || "").trim()) : [];
  const docIdx = headerIndex_(headers, ["מס' תעודת משלוח", "מס׳ תעודה", "מספר תעודה", "מספר ת.מ", "docNumber", "noteId", "id"]);
  if (docIdx < 0) throw new Error("לא נמצאה עמודת מפתח ייחודי; לא בוצע שינוי.");
  const counts = {};
  let blankKeyRows = 0;
  let garbageRows = 0;
  let validRows = 0;
  let rowsWithDriveLink = 0;
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const key = String(row[docIdx] || "").trim();
    if (!key) {
      blankKeyRows++;
      continue;
    }
    if (/^(ללא[-_ ]?מספר|לא[-_ ]?מספר|test|ddw)/i.test(key)) {
      garbageRows++;
      continue;
    }
    validRows++;
    const normalized = workroomKey_(key);
    counts[normalized] = (counts[normalized] || 0) + 1;
    const linkFound = [
      ["כתובת הקובץ (URL)", "driveFileId", "scanFileId", "fileId", "מזהה קובץ Drive", "driveUrl", "driveLink", "fileUrl"],
      ["קישור חתום", "קישור לתעודה", "קישור סריקה", "קישור לקובץ סריקה", "קישור קובץ Drive", "קישור דרייב", "קישור לקובץ"]
    ].some(names => {
      const i = headerIndex_(headers, names);
      return i >= 0 && !!driveLinkFromCell_(row[i], formulas[r][i], rich[r][i]);
    }) || [11, 10, 19].some(i => row.length > i && !!driveLinkFromCell_(row[i], formulas[r][i], rich[r][i]));
    if (linkFound) rowsWithDriveLink++;
  }
  const duplicateKeys = Object.keys(counts).filter(key => counts[key] > 1);
  const duplicateRows = duplicateKeys.reduce((sum, key) => sum + counts[key] - 1, 0);
  const report = {
    sheetName: sheet.getName(),
    lastRow: sheet.getLastRow(),
    dataRows: Math.max(0, values.length - 1),
    blankKeyRows: blankKeyRows,
    obviousGarbageRows: garbageRows,
    validRowsIncludingDuplicates: validRows,
    uniqueCertificateKeys: Object.keys(counts).length,
    duplicateGroups: duplicateKeys.length,
    duplicateExtraRows: duplicateRows,
    rowsWithDriveLink: rowsWithDriveLink,
    duplicateExamples: duplicateKeys.slice(0, 20).map(key => ({ key: key, rows: counts[key] })),
    readOnly: true
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
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
    if (/^[A-Za-z0-9_-]{25,}$/.test(textValue)) return "https://drive.google.com/file/d/" + textValue + "/view";
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
  const matches = workroomFindRows_(sheet, noteId, headers, idIndex);
  if (!matches.length) return -1;
  if (matches.length > 1) {
    throw new Error("נמצאו " + matches.length + " שורות עם אותו מספר תעודה. לא בוצעה כתיבה כדי למנוע עדכון שורה שגויה.");
  }
  return matches[0].rowNum;
}


/* ------------------------------------------------------------------ */
/* Unified workroom API: stable keys, thread/task JSON, guarded writes */
/* ------------------------------------------------------------------ */

function workroomHeader_(headers, aliases, preferred) {
  return ensureHeader_(getInquirySheet_(), headers, aliases, preferred);
}

function workroomKey_(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, "");
}

function workroomParseJson_(value, fallback) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function workroomMessage_(role, text, action, attachments, replyToId) {
  return {
    id: "msg_" + new Date().getTime() + "_" + Math.random().toString(36).slice(2, 8),
    role: role,
    text: text,
    at: new Date().toISOString(),
    action: action || "replied",
    attachments: attachments || [],
    replyToId: replyToId || ""
  };
}

function workroomColumns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]
    .map(h => String(h || "").trim());
  const docIdx = headerIndex_(headers, ["מס' תעודת משלוח", "מס׳ תעודה", "מספר תעודה", "מספר ת.מ", "docNumber", "noteId", "id"]);
  if (docIdx < 0) throw new Error("לא נמצאה עמודת מפתח ייחודי למספר תעודה");
  return { headers: headers, docIdx: docIdx };
}

function workroomFindRows_(sheet, key, headers, docIdx) {
  const wanted = workroomKey_(key);
  if (!wanted) return [];
  const values = sheet.getDataRange().getValues();
  const found = [];
  for (let r = 1; r < values.length; r++) {
    if (workroomKey_(values[r][docIdx]) === wanted) found.push({ rowNum: r + 1, row: values[r] });
  }
  return found;
}

function workroomBestRow_(matches, headers) {
  if (!matches.length) return null;
  const score = (entry) => {
    const row = entry.row;
    let n = 0;
    const idx = (names) => headerIndex_(headers, names);
    [["threadJson"], ["taskJson"], ["סטטוס בירור", "status"], ["שם לקוח", "customer"], ["מזהה קובץ Drive", "driveFileId"], ["כתובת הקובץ (URL)", "driveUrl"]].forEach(names => {
      const i = idx(names);
      if (i >= 0 && String(row[i] || "").trim()) n += 2;
    });
    return n;
  };
  return matches.slice().sort((a, b) => score(b) - score(a) || b.rowNum - a.rowNum)[0];
}

function workroomUniqueRowOrError_(sheet, key, headers, docIdx) {
  const matches = workroomFindRows_(sheet, key, headers, docIdx);
  if (!matches.length) throw new Error("התעודה לא נמצאה לפי מפתח: " + key);
  if (matches.length > 1) {
    throw new Error("נמצאו " + matches.length + " שורות עם אותו מספר תעודה. לא בוצעה כתיבה כדי למנוע עדכון שורה שגויה; יש לבצע איחוד כפילויות לאחר גיבוי.");
  }
  return matches[0].rowNum;
}

function workroomStatusLabel_(raw) {
  const value = String(raw || "").trim();
  const map = {
    pending_rami: "ממתין לראמי",
    pending_harel: "ממתין לאישור הראל",
    returned_to_rami: "הוחזר לראמי",
    approved: "אושר",
    rejected: "נדחה"
  };
  return map[value] || value || "ממתין לטיפול";
}

function workroomReadRows_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length <= 1) return [];
  const formulas = range.getFormulas();
  const rich = range.getRichTextValues();
  const headers = values[0].map(h => String(h || "").trim());
  const idx = names => headerIndex_(headers, names);
  const docIdx = idx(["מס' תעודת משלוח", "מס׳ תעודה", "מספר תעודה", "מספר ת.מ", "docNumber", "noteId", "id"]);
  if (docIdx < 0) throw new Error("לא נמצאה עמודת מספר תעודה");
  const output = [];
  const grouped = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const docNumber = String(row[docIdx] || "").trim();
    // Ignore blank / obvious generated garbage keys. Never delete them here.
    if (!docNumber || /^(ללא[-_ ]?מספר|לא[-_ ]?מספר|test|ddw)/i.test(docNumber)) continue;
    const get = names => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i >= 0) {
          const value = String(row[i] == null ? "" : row[i]).trim();
          if (value) return value;
        }
      }
      return "";
    };
    const threadRaw = get(["threadJson", "היסטוריית בירור JSON"]);
    const taskRaw = get(["taskJson", "משימה JSON"]);
    let thread = workroomParseJson_(threadRaw, []);
    if (!Array.isArray(thread)) thread = [];
    if (!thread.length) {
      const legacyReply = get(["הסבר ומענה מראמי", "מענה ראמי", "ramiReply"]);
      if (legacyReply) thread = [workroomMessage_("rami", legacyReply, "replied")];
    }
    let task = workroomParseJson_(taskRaw, null);
    if (Array.isArray(task)) task = null;
    const driveCandidates = [];
    const addDrive = (names) => {
      const i = idx(names);
      if (i >= 0) driveCandidates.push(driveLinkFromCell_(row[i], formulas[r][i], rich[r][i]));
    };
    addDrive(["מזהה קובץ Drive", "driveFileId", "scanFileId", "fileId"]);
    addDrive(["כתובת הקובץ (URL)", "driveUrl", "driveLink", "fileUrl"]);
    addDrive(["קישור חתום", "קישור PDF חתום", "קישור סריקה חתומה", "signedUrl", "signedLink"]);
    addDrive(["קישור לתעודה", "קישור סריקה", "קישור לקובץ סריקה", "קישור קובץ Drive", "קישור דרייב", "קישור לקובץ"]);
    [11, 10, 19].forEach(i => { if (row.length > i) driveCandidates.push(driveLinkFromCell_(row[i], formulas[r][i], rich[r][i])); });
    const driveUrl = driveCandidates.find(v => v && (/drive\.google\.com|docs\.google\.com/i.test(v) || /^[A-Za-z0-9_-]{25,}$/.test(v))) || "";
    const fileId = extractDriveFileId_(driveUrl) || (/^[A-Za-z0-9_-]{25,}$/.test(driveUrl) ? driveUrl : "");
    const statusRaw = get(["workflowStatus", "סטטוס בירור", "סטטוס אישור", "status"]) || "pending_rami";
    const raw = {
      id: docNumber,
      docNumber: docNumber,
      customer: get(["שם לקוח", "customer", "customerName"]),
      customerNo: get(["מס' לקוח", "מס׳ לקוח", "מספר לקוח", "customerNo"]),
      address: get(["כתובת אספקה", "כתובת", "address"]),
      driver: get(["נהג", "נהג ורכב", "driver"]),
      status: statusRaw,
      issue: get(["תיאור החריגה / הטעות שזוהתה", "תיאור חריגה", "הערת אישור", "errorReason", "issue"]),
      aiAnalysis: get(["ניתוח AI וכתב יד", "ניתוח AI", "aiAnalysis"]),
      kind: get(["kind", "סוג בירור"]) || "other",
      thread: thread,
      task: task,
      scanFileId: fileId,
      fileId: fileId,
      driveUrl: driveUrl,
      updatedAt: get(["updatedAt", "עודכן בתאריך"]) || new Date().toISOString(),
      _rowNum: r + 1,
      _rowScore: [get(["שם לקוח", "customer"]), get(["תיאור החריגה / הטעות שזוהתה", "issue"]), driveUrl, threadRaw, taskRaw].filter(Boolean).length
    };
    const key = workroomKey_(docNumber);
    const old = grouped[key];
    if (!old || raw._rowScore > old._rowScore || (raw._rowScore === old._rowScore && raw._rowNum > old._rowNum)) grouped[key] = raw;
  }
  Object.keys(grouped).forEach(k => {
    const item = grouped[k];
    delete item._rowNum;
    delete item._rowScore;
    output.push(item);
  });
  return { headers: headers, inquiries: output };
}

const WORKROOM_CACHE_TTL_SECONDS = 45;
const WORKROOM_CACHE_CHUNK_CHARS = 30000;

function workroomCacheKey_(sheetName) {
  return "workroom:v1:" + String(sheetName || "default").replace(/[^A-Za-z0-9_-]/g, "_");
}

function workroomCacheRead_(baseKey) {
  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(baseKey + ":meta");
  if (!metaRaw) return null;
  try {
    const meta = JSON.parse(metaRaw);
    if (!meta || !Number.isInteger(meta.chunks) || meta.chunks < 1 || meta.chunks > 100) return null;
    let json = "";
    for (let i = 0; i < meta.chunks; i++) {
      const part = cache.get(baseKey + ":" + i);
      if (part == null) return null;
      json += part;
    }
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function workroomCacheWrite_(baseKey, value) {
  const cache = CacheService.getScriptCache();
  const json = JSON.stringify(value);
  const chunks = [];
  for (let i = 0; i < json.length; i += WORKROOM_CACHE_CHUNK_CHARS) {
    chunks.push(json.substring(i, i + WORKROOM_CACHE_CHUNK_CHARS));
  }
  if (!chunks.length) chunks.push("{}");
  try {
    for (let i = 0; i < chunks.length; i++) {
      cache.put(baseKey + ":" + i, chunks[i], WORKROOM_CACHE_TTL_SECONDS);
    }
    cache.put(baseKey + ":meta", JSON.stringify({ chunks: chunks.length }), WORKROOM_CACHE_TTL_SECONDS);
  } catch (err) {
    // Cache is an optimization only; a cache quota/size failure must not fail the API.
    cache.remove(baseKey + ":meta");
  }
}

function invalidateWorkroomSheetCache_() {
  const cache = CacheService.getScriptCache();
  const sheet = getInquirySheet_();
  const baseKey = workroomCacheKey_(sheet.getName());
  const metaRaw = cache.get(baseKey + ":meta");
  if (metaRaw) {
    try {
      const meta = JSON.parse(metaRaw);
      for (let i = 0; i < Number(meta.chunks || 0); i++) cache.remove(baseKey + ":" + i);
    } catch (err) {}
  }
  cache.remove(baseKey + ":meta");
  const notesKey = "notes:v1:" + MASTER_SHEET_ID;
  const notesMeta = cache.get(notesKey + ":meta");
  if (notesMeta) {
    try {
      const meta = JSON.parse(notesMeta);
      for (let i = 0; i < Number(meta.chunks || 0); i++) cache.remove(notesKey + ":" + i);
    } catch (err) {}
  }
  cache.remove(notesKey + ":meta");
}

function handleGetWorkroomInquiries_(params) {
  const sheet = getInquirySheet_();
  const baseKey = workroomCacheKey_(sheet.getName());
  let inquiries = workroomCacheRead_(baseKey);
  if (!inquiries) {
    const result = workroomReadRows_(sheet);
    inquiries = result.inquiries;
    workroomCacheWrite_(baseKey, inquiries);
  }
  const requestedStatus = String((params && params.status) || "").trim();
  if (requestedStatus) {
    const statuses = requestedStatus.split(",").map(s => s.trim()).filter(Boolean);
    inquiries = inquiries.filter(item => statuses.indexOf(String(item.status || "")) >= 0);
  }
  return jsonResponse({ success: true, inquiries: inquiries, cachedForSeconds: WORKROOM_CACHE_TTL_SECONDS });
}

function handleGetWorkroomInquiry_(body) {
  const key = String(body.inquiryId || body.id || body.noteId || "").trim();
  if (!key) return jsonResponse({ success: false, error: "חסר מזהה בירור" });
  const result = workroomReadRows_(getInquirySheet_());
  const wanted = workroomKey_(key);
  const inquiry = result.inquiries.find(i => workroomKey_(i.id) === wanted || workroomKey_(i.docNumber) === wanted) || null;
  return jsonResponse({ success: true, inquiry: inquiry });
}

function workroomWriteState_(sheet, rowNum, headers, state) {
  const threadIdx = ensureHeader_(sheet, headers, ["threadJson", "היסטוריית בירור JSON"], "threadJson");
  const taskIdx = ensureHeader_(sheet, headers, ["taskJson", "משימה JSON"], "taskJson");
  // Keep workflow state separate from legacy Hebrew approval/status columns.
  const statusIdx = ensureHeader_(sheet, headers, ["workflowStatus"], "workflowStatus");
  const updatedIdx = ensureHeader_(sheet, headers, ["updatedAt", "עודכן בתאריך"], "updatedAt");
  sheet.getRange(rowNum, threadIdx + 1).setValue(JSON.stringify(state.thread || []));
  sheet.getRange(rowNum, taskIdx + 1).setValue(state.task ? JSON.stringify(state.task) : "");
  sheet.getRange(rowNum, statusIdx + 1).setValue(state.status || "pending_rami");
  sheet.getRange(rowNum, updatedIdx + 1).setValue(new Date().toISOString());
}

function workroomGetState_(sheet, rowNum, headers) {
  const values = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  const threadIdx = headerIndex_(headers, ["threadJson", "היסטוריית בירור JSON"]);
  const taskIdx = headerIndex_(headers, ["taskJson", "משימה JSON"]);
  const legacyIdx = headerIndex_(headers, ["הסבר ומענה מראמי", "מענה ראמי", "ramiReply"]);
  let thread = threadIdx >= 0 ? workroomParseJson_(values[threadIdx], []) : [];
  if (!Array.isArray(thread)) thread = [];
  if (!thread.length && legacyIdx >= 0 && String(values[legacyIdx] || "").trim()) {
    thread = [workroomMessage_("rami", String(values[legacyIdx]), "replied")];
  }
  const task = taskIdx >= 0 ? workroomParseJson_(values[taskIdx], null) : null;
  const status = ["workflowStatus", "סטטוס בירור", "status"].map(name => {
    const i = headers.indexOf(name);
    return i >= 0 ? String(values[i] || "").trim() : "";
  }).find(Boolean) || "pending_rami";
  return { thread: thread, task: task && typeof task === "object" && !Array.isArray(task) ? task : null, status: status };
}

function workroomValidateReply_(text) {
  const reply = String(text || "").trim();
  if (reply.length < 3) throw new Error("המענה קצר מדי");
  if (reply.length > 2000) throw new Error("המענה ארוך מדי");
  if (/^ddw+$/i.test(reply) || /^(test|בדיקה בלבד|טסט)$/i.test(reply)) {
    throw new Error("המענה נראה כמו טקסט בדיקה ולא נשמר");
  }
  return reply;
}

function handleWorkroomRamiReply_(body) {
  const key = String(body.noteId || body.inquiryId || "").trim();
  const reply = workroomValidateReply_(body.text);
  if (!key) return jsonResponse({ success: false, error: "חסר מספר תעודה" });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getInquirySheet_();
    const { headers, docIdx } = workroomColumns_(sheet);
    const rowNum = workroomUniqueRowOrError_(sheet, key, headers, docIdx);
    const state = workroomGetState_(sheet, rowNum, headers);
    state.thread.push(workroomMessage_("rami", reply, "replied", [], String(body.replyToId || "")));
    workroomWriteState_(sheet, rowNum, headers, { thread: state.thread, task: state.task, status: "pending_harel" });
    const legacyIdx = ensureHeader_(sheet, headers, ["הסבר ומענה מראמי", "מענה ראמי", "ramiReply"], "הסבר ומענה מראמי");
    const prev = String(sheet.getRange(rowNum, legacyIdx + 1).getValue() || "").trim();
    const stamp = Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd/MM/yyyy HH:mm");
    sheet.getRange(rowNum, legacyIdx + 1).setValue(prev ? prev + "\n[" + stamp + "] ראמי: " + reply : "[" + stamp + "] ראמי: " + reply);
    SpreadsheetApp.flush();
  invalidateWorkroomSheetCache_();
    return jsonResponse({ success: true, inquiryId: key, status: "pending_harel" });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}


function handleWorkroomHarelReply_(body) {
  const key = String(body.noteId || body.inquiryId || "").trim();
  let reply;
  try { reply = workroomValidateReply_(body.text); }
  catch (err) { return jsonResponse({ success: false, error: String(err.message || err) }); }
  if (!key) return jsonResponse({ success: false, error: "חסר מספר תעודה" });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getInquirySheet_();
    const { headers, docIdx } = workroomColumns_(sheet);
    const rowNum = workroomUniqueRowOrError_(sheet, key, headers, docIdx);
    const state = workroomGetState_(sheet, rowNum, headers);
    state.thread.push(workroomMessage_("harel", reply, "replied", [], String(body.replyToId || "")));
    workroomWriteState_(sheet, rowNum, headers, { thread: state.thread, task: state.task, status: state.status });
    SpreadsheetApp.flush();
  invalidateWorkroomSheetCache_();
    return jsonResponse({ success: true, inquiryId: key, status: state.status });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function handleWorkroomHarelDecision_(body) {
  const key = String(body.noteId || body.inquiryId || "").trim();
  const decision = String(body.decision || "");
  if (!key) return jsonResponse({ success: false, error: "חסר מזהה תעודה" });
  if (["approve", "reject", "return"].indexOf(decision) < 0) return jsonResponse({ success: false, error: "החלטה לא תקינה" });
  const reason = String(body.reason || "").trim();
  if (decision === "return" && reason.length < 3) return jsonResponse({ success: false, error: "חובה למלא מה חסר בהחזרה לראמי" });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getInquirySheet_();
    const { headers, docIdx } = workroomColumns_(sheet);
    const rowNum = workroomUniqueRowOrError_(sheet, key, headers, docIdx);
    const state = workroomGetState_(sheet, rowNum, headers);
    const text = String(body.text || "").trim();
    let status = "pending_harel";
    let task = state.task;
    if (decision === "approve") {
      status = "approved";
      if (task && task.status === "open") task.status = "done";
      state.thread.push(workroomMessage_("harel", text || "התעודה אושרה.", "approved"));
    } else if (decision === "reject") {
      status = "rejected";
      if (task && task.status === "open") task.status = "cancelled";
      state.thread.push(workroomMessage_("harel", text || reason || "התעודה נדחתה.", "rejected"));
    } else {
      status = "returned_to_rami";
      task = {
        id: "task_" + new Date().getTime() + "_" + Math.random().toString(36).slice(2, 8),
        inquiryId: key,
        noteId: key,
        status: "open",
        assignedTo: "rami",
        createdBy: "harel",
        reason: reason,
        dueAt: body.dueAt || new Date(Date.now() + 4 * 3600000).toISOString(),
        nudgeEveryMin: Math.max(15, Number(body.nudgeEveryMin) || 60),
        nudgeCount: 0,
        canvasAnnotationUrl: String(body.annotationUrl || ""),
        sourceFileId: String(body.fileId || ""),
        createdAt: new Date().toISOString()
      };
      state.thread.push(workroomMessage_("harel", "הוחזר לראמי. מה חסר: " + reason + (text ? "\\n" + text : ""), "returned_to_rami"));
    }
    workroomWriteState_(sheet, rowNum, headers, { thread: state.thread, task: task, status: status });
    SpreadsheetApp.flush();
  invalidateWorkroomSheetCache_();
    return jsonResponse({ success: true, inquiryId: key, status: status, task: task });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function handleWorkroomHarelAssign_(body) {
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return jsonResponse({ success: false, error: "חובה למלא מה חסר" });
  body.decision = "return";
  body.text = body.text || "נפתחה משימת המשך לראמי";
  return handleWorkroomHarelDecision_(body);
}

function handleGetRamiInquiries() {
  const sheet = getInquirySheet_();
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  if (!values.length) return jsonResponse({ success: true, inquiries: [] });
  // Read formulas and rich-text links too: some Drive links are attached to cell text,
  // rather than stored as the visible cell value.
  const formulas = dataRange.getFormulas();
  const richTextValues = dataRange.getRichTextValues();
  const headers = values[0].map(h => String(h || "").trim());
  const idx = (names) => headerIndex_(headers, names);
  const docIdx = idx(["מס' תעודת משלוח", "מס׳ תעודה", "מספר תעודה", "מספר ת.מ", "docNumber", "noteId", "id"]);
  if (docIdx < 0) return jsonResponse({ success: false, error: "לא נמצאה עמודת מספר תעודה" });
  const linkIdx = idx(["כתובת הקובץ (URL)", "driveFileId", "scanFileId", "fileId", "מזהה קובץ Drive", "driveUrl", "driveLink", "fileUrl", "קישור חתום", "קישור לתעודה", "קישור סריקה", "קישור לקובץ סריקה", "קישור קובץ Drive", "קישור דרייב", "קישור לקובץ"]);
  const signedIdx = idx(["קישור חתום", "קישור PDF חתום", "קישור סריקה חתומה", "signedUrl", "signedLink"]);
  const inquiries = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const docNumber = String(row[docIdx] || "").trim();
    if (!docNumber || /^(ללא[-_ ]?מספר|לא[-_ ]?מספר|test|ddw)/i.test(docNumber)) continue;
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
    const headerDriveLink = [
      ["כתובת הקובץ (URL)", "driveFileId", "scanFileId", "fileId", "מזהה קובץ Drive", "driveUrl", "driveLink", "fileUrl"],
      ["קישור לתעודה", "קישור סריקה", "קישור לקובץ סריקה", "קישור קובץ Drive", "קישור דרייב", "קישור לקובץ"]
    ].map(names => {
      const i = idx(names);
      return i >= 0 ? driveLinkFromCell_(row[i], formulas[r][i], richTextValues[r][i]) : "";
    }).find(Boolean) || "";
    const signedLink = signedIdx >= 0
      ? driveLinkFromCell_(row[signedIdx], formulas[r][signedIdx], richTextValues[r][signedIdx])
      : "";
    // Actual scan links may be stored in K or T without a recognized header.
    const columnKLink = row.length > 10
      ? driveLinkFromCell_(row[10], formulas[r][10], richTextValues[r][10])
      : "";
    const columnTLink = row.length > 19
      ? driveLinkFromCell_(row[19], formulas[r][19], richTextValues[r][19])
      : "";
    const columnLLink = row.length > 11
      ? driveLinkFromCell_(row[11], formulas[r][11], richTextValues[r][11])
      : "";
    const driveUrl = headerDriveLink || signedLink || columnLLink || columnKLink || columnTLink;
    const fileId = extractDriveFileId_(driveUrl);
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
      status: workroomStatusLabel_(get(["workflowStatus", "סטטוס בירור", "סטטוס אישור", "status"])),
      harelApproval: get(["אושר ע״י הראל", "אישור הראל", "harelApproval"]),
      fileId: fileId,
      driveUrl: driveUrl,
      driveLink: driveUrl,
      rounds: [],
      _score: [driveUrl, get(["שם לקוח", "customer", "customerName"]), get(["תיאור החריגה / הטעות שזוהתה", "תיאור חריגה", "errorReason", "issue"]), get(["ניתוח AI וכתב יד", "ניתוח AI", "aiAnalysis"]), get(["הסבר ומענה מראמי", "מענה ראמי", "ramiReply"])].filter(Boolean).length,
    });
  }
  const unique = {};
  inquiries.forEach(item => {
    const key = workroomKey_(item.docNumber);
    if (!key) return;
    if (!unique[key] || Number(item._score || 0) > Number(unique[key]._score || 0)) unique[key] = item;
  });
  const deduped = Object.keys(unique).map(key => {
    const item = unique[key];
    delete item._score;
    return item;
  });
  return jsonResponse({ success: true, inquiries: deduped });
}
function handleSubmitRamiReply(body) {
  const noteId = String(body.noteId || "").trim();
  let reply = "";
  try { reply = workroomValidateReply_(body.text); }
  catch (err) { return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) }); }
  if (!noteId) return jsonResponse({ success: false, error: "חסר מספר תעודה" });

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
  invalidateWorkroomSheetCache_();
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
  invalidateWorkroomSheetCache_();
  return jsonResponse({
    success: true,
    noteId: noteId,
    driveUrl: compositeFile.getUrl(),
    annotationUrl: layerFile.getUrl(),
    metadataUrl: jsonFile.getUrl(),
  });
}
