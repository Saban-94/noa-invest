import type { SheetNote } from "../notes-api.functions";

export interface GalyaDeliveryNote {
  noteId: string;
  docDate: string;
  docTime: string;
  docNumber: string;
  comaxOrder: string;
  customerNo: string;
  customerName: string;
  deliveryAddress: string;
  driverName: string;
  truckPlate: string;
  fileId: string;
  driveUrl: string;
  itemsSummary: string;
  depositsText: string;
  craneTimeRaw: string;
  extractStatus: string;
  approvalStatus: string;
  signedUrl: string;
  ramiApprovedAt: string;
  harelApprovedAt: string;
}

/**
 * ממיר שורת גיליון (SheetNote) למבנה נתוני גליה מנומל
 */
export function sheetNoteToGalya(note: SheetNote): GalyaDeliveryNote {
  // המרת תאריך מ-YYYY-MM-DD ל-DD/MM/YYYY אם נדרש
  let formattedDate = note.date || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
    const [y, m, d] = formattedDate.split("-");
    formattedDate = `${d}/${m}/${y}`;
  }

  // סיכום פריטים
  const itemsSummary = (note.items || [])
    .map(item => `${item.qty} ${item.unit || ""} ${item.name || ""}`.trim())
    .join(" + ");

  return {
    noteId: note.id || note.docNumber || "",
    docDate: formattedDate,
    docTime: note.time || "",
    docNumber: note.docNumber || "",
    comaxOrder: note.comaxOrder || "",
    customerNo: note.customerNo || "",
    customerName: note.customer || "",
    deliveryAddress: note.address || "",
    driverName: note.driver || "",
    truckPlate: note.truck || "",
    fileId: note.fileId || "",
    driveUrl: note.driveUrl || "",
    itemsSummary,
    depositsText: note.depositsText || "",
    craneTimeRaw: note.craneNotes || "",
    extractStatus: note.extractStatus || "OK",
    approvalStatus: note.approvalStatus || "",
    signedUrl: note.signedUrl || "",
    ramiApprovedAt: note.ramiApprovedAt || "",
    harelApprovedAt: note.harelApprovedAt || ""
  };
}