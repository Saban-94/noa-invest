export type Yard = "מחסן 4 החרש 10" | "מחסן 1 התלמיד 6";
export type AuditStatus = "ok" | "warn" | "fail";

export type Driver = {
  id: string;
  name: string;
  phone: string;
  truck: string;
};

export type DeliveryItem = {
  name: string;
  /** SKU from the source sheet, when supplied separately from the display name. */
  sku?: string;
  qty: number;
  ordered: number;
  price?: number;
  weightKg: number;
  unit: string;
  deposit?: number;
};

export type DeliveryNote = {
  id: string;
  customer: string;
  date: string;
  items: DeliveryItem[];
  deposits?: {
    bales60002?: { delivered: number; billed: number };
    pallets60060?: { delivered: number; billed: number };
  };
  gps?: { status: AuditStatus; note: string };
  comaxOrder?: string;
  customerNo?: string;
  siteAddress?: string;
  yard?: Yard;
  driver?: string;
  craneTime?: string;
  signedBy?: string;
  driveUrl?: string;
  billingStatus?: string;
  scans?: string[];
  scanImage?: string;
  /** מזהה קובץ ה-Drive של הסריקה (נתון חי מהגיליון) */
  fileId?: string;
  /** קישור ל-PDF החתום בתיקיית הלקוח, אם כבר נחתם */
  signedUrl?: string;
  noteStage?: "pending_rami" | "returned_to_rami" | "pending_harel" | "pending_harel_reply" | "final";
  /** true = נקרא מהגיליון החי; כמויות/פקדונות/איתוראן עדיין לא הוצלבו */
  live?: boolean;
};

export type Order = {
  id: string;
  customer: string;
  customerNo: string;
  phone: string;
  address: string;
  date: string;
  window: string;
  yard: Yard;
  driverId: string | null;
  driverName: string;
  status: "פתוחה" | "בהעמסה" | "בדרך" | "סופק" | "הועבר לתעודת משלוח";
  items: { name: string; qty: number; unit: string; weightKg: number; deposit?: boolean }[];
  notes: string;
  weightTons: number;
  wazeLink: string;
  depositBales: string;
  depositPallets: string;
};

export type GpsRecord = {
  id: string;
  driverId: string;
  lat: number;
  lng: number;
  speed: number;
  status: string;
  updatedAt: string;
};

export const DRIVERS: Driver[] = [
  { id: "hikmat", name: "חכמת מנוף", phone: "050-0000000", truck: "מנוף 18000 (מרצדס 615-41-002)" },
  { id: "ali", name: "עלי משאית", phone: "050-1111111", truck: "משאית שטוחה 818000" },
];

export const BASE: DeliveryNote[] = [
  {
    id: "6715766",
    comaxOrder: "6215960",
    customer: "א.ערן אזולאי",
    customerNo: "632122",
    date: "13/10/2026",
    siteAddress: "נח 3, תל אביב",
    yard: "מחסן 4 החרש 10",
    driver: "חכמת 615-41-002",
    items: [
      {
        name: "ריצופית אפור 181 25 ק״ג כרמית",
        qty: 240,
        ordered: 240,
        price: 28,
        weightKg: 25,
        unit: "שק",
      },
      {
        name: "פורצלן 60/60 אפור 1.44 מ״ר",
        qty: 175,
        ordered: 175,
        price: 42,
        weightKg: 28,
        unit: "מ״ר",
      },
      { name: "סרם 255 SIKA 25 ק״ג", qty: 20, ordered: 20, price: 85, weightKg: 25, unit: "שק" },
      {
        name: "הובלת מנוף תל אביב מרכז",
        qty: 1,
        ordered: 1,
        price: 650,
        weightKg: 0,
        unit: "משלוח",
      },
      {
        name: "משטח סבן פקדון (60060)",
        qty: 1,
        ordered: 1,
        price: 60,
        weightKg: 25,
        unit: "משטח",
        deposit: 60,
      },
    ],
    deposits: {
      bales60002: { delivered: 0, billed: 0 },
      pallets60060: { delivered: 1, billed: 1 },
    },
    gps: { status: "ok", note: "40 דק׳ מנוף — אומת באיתוראן (נח 3, תל אביב)" },
    signedBy: "מאסרוה ראמי חתם ✅",
    craneTime: "40 דק׳ מנוף",
    driveUrl: "https://drive.google.com/file/d/152tuyGDT7blVAKfTy4L4k3aAUedVyza7/view?usp=drivesdk",
    scans: [
      "https://drive.google.com/thumbnail?id=152tuyGDT7blVAKfTy4L4k3aAUedVyza7&sz=w1600",
      "https://drive.google.com/file/d/152tuyGDT7blVAKfTy4L4k3aAUedVyza7/preview",
    ],
    scanImage: "https://drive.google.com/thumbnail?id=152tuyGDT7blVAKfTy4L4k3aAUedVyza7&sz=w1600",
  },
  {
    id: "6714850",
    comaxOrder: "6215974",
    customer: "זבולון-עדירן / וייס",
    customerNo: "607146",
    date: "13/10/2026",
    siteAddress: "הורדים 19, סביון",
    yard: "מחסן 4 החרש 10",
    driver: "חכמת (מרצדס 615-41-002)",
    items: [
      {
        name: "חול מחצבה (בלה)",
        qty: 3,
        ordered: 3,
        price: 180,
        weightKg: 1000,
        unit: "בלה",
        deposit: 45,
      },
      { name: "לוחות דנסגלאס 12.5", qty: 25, ordered: 25, price: 95, weightKg: 30, unit: "לוח" },
      { name: "פרופיל 70 סבן", qty: 60, ordered: 60, price: 18, weightKg: 1.5, unit: "יח׳" },
    ],
    deposits: {
      bales60002: { delivered: 3, billed: 3 },
      pallets60060: { delivered: 0, billed: 0 },
    },
    gps: { status: "ok", note: "26 דק׳ מנוף — אומת באיתוראן (08:28–08:58)" },
    signedBy: "יוסף חתם ✅",
    craneTime: "26 דק׳ מנוף",
    driveUrl: "https://drive.google.com/file/d/1b5xqV44a4HJ7HVjd8PZw6UVjim6uvGd7/view",
    scans: ["https://drive.google.com/thumbnail?id=1b5xqV44a4HJ7HVjd8PZw6UVjim6uvGd7&sz=w1600"],
    scanImage: "https://drive.google.com/thumbnail?id=1b5xqV44a4HJ7HVjd8PZw6UVjim6uvGd7&sz=w1600",
  },
  {
    id: "6714848",
    comaxOrder: "6215976",
    customer: "כלו עבודות עפר בע״מ",
    customerNo: "510286",
    date: "13/10/2026",
    siteAddress: "ת.דלק פז, חגור",
    yard: "מחסן 4 החרש 10",
    driver: "חכמת (מרצדס 615-41-002)",
    items: [
      {
        name: "חול מחצבה (בלה)",
        qty: 2,
        ordered: 2,
        price: 180,
        weightKg: 1000,
        unit: "בלה",
        deposit: 45,
      },
      {
        name: "סומסום שק גדול (בלה)",
        qty: 2,
        ordered: 2,
        price: 190,
        weightKg: 1000,
        unit: "בלה",
        deposit: 45,
      },
      { name: "מלט 50 ק״ג נשר", qty: 8, ordered: 8, price: 32, weightKg: 50, unit: "שק" },
    ],
    deposits: {
      bales60002: { delivered: 4, billed: 4 },
      pallets60060: { delivered: 1, billed: 1 },
    },
    gps: { status: "ok", note: "24 דק׳ מנוף — אומת באיתוראן (09:38–10:06)" },
    signedBy: "אבי כלו חתם ✅",
    craneTime: "24 דק׳ מנוף",
    driveUrl: "https://drive.google.com/file/d/10gtPLlloBM8vivDCKoH-QTIGdv5W6Wb1/view",
    scans: ["https://drive.google.com/thumbnail?id=10gtPLlloBM8vivDCKoH-QTIGdv5W6Wb1&sz=w1600"],
    scanImage: "https://drive.google.com/thumbnail?id=10gtPLlloBM8vivDCKoH-QTIGdv5W6Wb1&sz=w1600",
  },
  {
    id: "6714840",
    comaxOrder: "6215980",
    customer: "פלמר מערכות בנין בע״מ",
    customerNo: "617051",
    date: "14/10/2026",
    siteAddress: "גן השקמים 6, סביון",
    yard: "מחסן 4 החרש 10",
    driver: "חכמת (מרצדס 615-41-002)",
    items: [
      {
        name: "חול מחצבה (בלה)",
        qty: 4,
        ordered: 4,
        price: 180,
        weightKg: 1000,
        unit: "בלה",
        deposit: 45,
      },
      {
        name: "סומסום נקי (בלה)",
        qty: 4,
        ordered: 4,
        price: 190,
        weightKg: 1000,
        unit: "בלה",
        deposit: 45,
      },
    ],
    deposits: {
      bales60002: { delivered: 8, billed: 8 },
      pallets60060: { delivered: 0, billed: 0 },
    },
    gps: { status: "ok", note: "35 דק׳ מנוף — אומת באיתוראן" },
    signedBy: "רשוואן חתם ✅",
    craneTime: "35 דק׳ מנוף",
    driveUrl: "https://drive.google.com/file/d/1b5xqV44a4HJ7HVjd8PZw6UVjim6uvGd7/view",
    scans: ["https://drive.google.com/thumbnail?id=1b5xqV44a4HJ7HVjd8PZw6UVjim6uvGd7&sz=w1600"],
    scanImage: "https://drive.google.com/thumbnail?id=1b5xqV44a4HJ7HVjd8PZw6UVjim6uvGd7&sz=w1600",
  },
];

export const NOTES = BASE;

export const GPS_RECORDS: GpsRecord[] = [
  {
    id: "gps-1",
    driverId: "hikmat",
    lat: 32.15,
    lng: 34.88,
    speed: 45,
    status: "בנסיעה",
    updatedAt: "08:05",
  },
  {
    id: "gps-2",
    driverId: "ali",
    lat: 32.11,
    lng: 34.85,
    speed: 0,
    status: "עמידה",
    updatedAt: "08:00",
  },
];

export const noteWeightKg = (n?: DeliveryNote) =>
  (n?.items || []).reduce((s, i) => s + (i.qty || 0) * (i.weightKg || 0), 0);
export const noteWeightTons = (n?: DeliveryNote) => noteWeightKg(n) / 1000;
export const noteItemsCount = (n?: DeliveryNote) =>
  (n?.items || []).reduce((s, i) => s + (i.qty || 0), 0);
export const noteTotal = (n?: DeliveryNote) => noteWeightKg(n); // deprecated alias pointing to weight
export const driverOf = (id: string) => DRIVERS.find((d) => d.id === id)!;

export function auditNote(n?: DeliveryNote): {
  status: AuditStatus;
  findings: { status: AuditStatus; text: string }[];
} {
  const findings: { status: AuditStatus; text: string }[] = [];
  if (!n) return { status: "ok", findings: [{ status: "ok", text: "תעודה בטעינה" }] };
  if (n.live) {
    findings.push({
      status: "warn",
      text: "טרם הוצלב מול קומקס/איתוראן",
    });
    const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
    const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };
    if (b.delivered) {
      findings.push({
        status: "warn",
        text: `בלות פקדון 60002: ${b.delivered} (טרם הוצלבו מול חיוב)`,
      });
    }
    if (p.delivered) {
      findings.push({
        status: "warn",
        text: `משטחי עץ 60060: ${p.delivered} (טרם הוצלבו מול חיוב)`,
      });
    }
    return { status: "warn", findings };
  }
  (n.items || []).forEach((i) => {
    if (i.qty !== i.ordered)
      findings.push({
        status: "warn",
        text: `${i.name}: סופק ${i.qty} מול ${i.ordered} בהזמנת קומקס`,
      });
  });
  const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
  const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };
  if (b.delivered !== b.billed)
    findings.push({
      status: "fail",
      text: `בלות פקדון 60002: ${b.delivered} סופקו, ${b.billed} חויבו`,
    });
  else if (b.delivered)
    findings.push({ status: "ok", text: `בלות 60002 תואמות 1:1 (${b.delivered})` });
  if (p.delivered !== p.billed)
    findings.push({
      status: "fail",
      text: `משטחי עץ 60060: ${p.delivered} סופקו, ${p.billed} חויבו`,
    });
  else if (p.delivered)
    findings.push({ status: "ok", text: `משטחי 60060 תואמים 1:1 (${p.delivered})` });
  if (n.gps) findings.push({ status: n.gps.status, text: `איתוראן: ${n.gps.note}` });
  if (!findings.some((f) => f.status !== "ok"))
    findings.unshift({ status: "ok", text: "כמויות תואמות להזמנת קומקס" });
  const status: AuditStatus = findings.some((f) => f.status === "fail")
    ? "fail"
    : findings.some((f) => f.status === "warn")
      ? "warn"
      : "ok";
  return { status, findings };
}

export const ORDERS: Order[] = [];

export function fetchNotes(): DeliveryNote[] {
  return NOTES;
}

export function fetchLiveOrders(): Order[] {
  return ORDERS;
}

export function fetchGps(): GpsRecord[] {
  return GPS_RECORDS;
}

export const ils = (n: number) => "₪" + n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
export const fmtDate = (d: string) => d.split("-").reverse().join("/");
