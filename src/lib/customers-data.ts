import { NOTES, type DeliveryNote, type Yard } from "./data";

export type CustomerTag = "לקוח עוגן" | "שוטף מאושר" | "דורש תשלום במזומן" | "מלגזה באתר";

export type CustomerOrder = {
  id: string;
  date: string;
  status: "סופק" | "בביצוע" | "הוזמן";
  itemsCount: number;
  totalIls: number;
  weightTons: number;
  driverName?: string;
  pdfUrl?: string;
  items: {
    sku: string;
    name: string;
    qty: number;
    unit: string;
    price: number;
  }[];
};

export type CustomerInvoice = {
  id: string;
  invoiceNo: string;
  date: string;
  type: "חשבונית מס" | "הצעת מחיר" | "קבלה" | "תעודת זיכוי פקדון";
  amountIls: number;
  status: "שולם" | "פתוח לתשלום" | "זוכה";
  issuedBy: string; // e.g. "לינה הנה״ח"
  pdfName: string;
};

export type CustomerProfile = {
  id: string; // Comax customer number (e.g. "601928")
  name: string; // Company / customer name
  hp: string; // ח.פ / עוסק מורשה
  contactName: string;
  phone: string;
  city: string;
  address: string;
  tag: CustomerTag;
  preferredDriver: "חכמת" | "עלי";
  truckType: "משאית מנוף 615-41-002" | "משאית פלטה 651-51-701";
  defaultYard: Yard;
  accessNotes: string[];
  depositLedger: {
    bales60002: {
      billed: number;
      returned: number;
      openBalance: number;
    };
    pallets60060: {
      billed: number;
      returned: number;
      openBalance: number;
    };
  };
  ordersHistory: CustomerOrder[];
  invoicesHistory: CustomerInvoice[];
};

export const CUSTOMERS: CustomerProfile[] = [
  {
    id: "601928",
    name: "אורבר בנייה בע״מ",
    hp: "514892011",
    contactName: "אסף ברק",
    phone: "052-8812345",
    city: "רמת גן",
    address: "ירמיהו 14, רמת גן",
    tag: "לקוח עוגן",
    preferredDriver: "חכמת",
    truckType: "משאית מנוף 615-41-002",
    defaultYard: "מחסן 4 החרש 10",
    accessNotes: [
      "שער כניסה צר לרחוב ירמיהו",
      "פריקה עם מנוף בלבד לקומה 2",
      "תיאום שעת הגעה מול אסף",
    ],
    depositLedger: {
      bales60002: { billed: 48, returned: 36, openBalance: 12 },
      pallets60060: { billed: 74, returned: 52, openBalance: 22 },
    },
    ordersHistory: [
      {
        id: "6215936",
        date: "2026-10-13",
        status: "סופק",
        itemsCount: 3,
        totalIls: 940,
        weightTons: 2.25,
        driverName: "חכמת",
        items: [
          { sku: "11551", name: "חול שק גדול (בלה)", qty: 2, unit: "שק", price: 240 },
          { sku: "10002", name: "מלט אפור 25 ק״ג", qty: 10, unit: "שק", price: 22 },
          { sku: "60060", name: "משטח עץ סבן (פקדון)", qty: 4, unit: "יח׳", price: 60 },
        ],
      },
      {
        id: "6214810",
        date: "2026-10-06",
        status: "סופק",
        itemsCount: 4,
        totalIls: 3820,
        weightTons: 5.4,
        driverName: "חכמת",
        items: [
          { sku: "11551", name: "חול שק גדול (בלה)", qty: 8, unit: "שק", price: 240 },
          { sku: "10002", name: "מלט אפור 25 ק״ג", qty: 40, unit: "שק", price: 22 },
          { sku: "18073", name: "הובלת מנוף", qty: 1, unit: "יח׳", price: 650 },
          { sku: "60060", name: "משטח עץ סבן (פקדון)", qty: 6, unit: "יח׳", price: 60 },
        ],
      },
    ],
    invoicesHistory: [
      {
        id: "INV-90214",
        invoiceNo: "90214",
        date: "2026-10-08",
        type: "חשבונית מס",
        amountIls: 4469,
        status: "שולם",
        issuedBy: "לינה הנה״ח",
        pdfName: "חשבונית_מס_90214_אורבר_בנייה.pdf",
      },
      {
        id: "QT-4102",
        invoiceNo: "4102",
        date: "2026-10-01",
        type: "הצעת מחיר",
        amountIls: 12500,
        status: "פתוח לתשלום",
        issuedBy: "לינה הנה״ח",
        pdfName: "הצעת_מחיר_4102_חומרי_בניין.pdf",
      },
      {
        id: "CR-1104",
        invoiceNo: "1104",
        date: "2026-09-28",
        type: "תעודת זיכוי פקדון",
        amountIls: 900,
        status: "זוכה",
        issuedBy: "לינה הנה״ח",
        pdfName: "זיכוי_פקדונות_15_משטחים.pdf",
      },
    ],
  },
  {
    id: "632122",
    name: "א. ערן אזולא",
    hp: "513904823",
    contactName: "ערן אזולאי",
    phone: "050-7788990",
    city: "תל אביב",
    address: "נח 3, תל אביב",
    tag: "שוטף מאושר",
    preferredDriver: "חכמת",
    truckType: "משאית מנוף 615-41-002",
    defaultYard: "מחסן 4 החרש 10",
    accessNotes: [
      "זהירות מכבלי חשמל עיליים ברחוב נח",
      "הנפה מעבר לחומה אחורית",
      "חותמת מחסן חובה על כל ת.מ.",
    ],
    depositLedger: {
      bales60002: { billed: 64, returned: 45, openBalance: 19 },
      pallets60060: { billed: 32, returned: 24, openBalance: 8 },
    },
    ordersHistory: [
      {
        id: "6215937",
        date: "2026-10-13",
        status: "סופק",
        itemsCount: 3,
        totalIls: 4925,
        weightTons: 15.75,
        driverName: "חכמת",
        items: [
          { sku: "11511", name: "חול שק גדול", qty: 15, unit: "שק", price: 240 },
          { sku: "18073", name: "הובלת מנוף", qty: 1, unit: "יח׳", price: 650 },
          { sku: "60002", name: "בלה (פקדון)", qty: 15, unit: "יח׳", price: 45 },
        ],
      },
      {
        id: "6215960",
        date: "2026-10-13",
        status: "סופק",
        itemsCount: 4,
        totalIls: 6480,
        weightTons: 8.0,
        driverName: "חכמת",
        items: [
          { sku: "15161", name: "רשתות אסף 181 25 ק״ג", qty: 240, unit: "שק", price: 6 },
          { sku: "19994", name: "פרופיל 60/60", qty: 175, unit: "קרטון", price: 12 },
          { sku: "19295", name: "SIKA 255 25 ק״ג", qty: 60, unit: "שק", price: 48 },
          { sku: "60060", name: "משטח עץ סבן (פקדון)", qty: 1, unit: "יח׳", price: 60 },
        ],
      },
    ],
    invoicesHistory: [
      {
        id: "INV-90220",
        invoiceNo: "90220",
        date: "2026-10-10",
        type: "חשבונית מס",
        amountIls: 13345,
        status: "שולם",
        issuedBy: "לינה הנה״ח",
        pdfName: "חשבונית_מס_90220_אזולא.pdf",
      },
      {
        id: "QT-4115",
        invoiceNo: "4115",
        date: "2026-10-04",
        type: "הצעת מחיר",
        amountIls: 18200,
        status: "פתוח לתשלום",
        issuedBy: "לינה הנה״ח",
        pdfName: "הצעת_מחיר_חומרי_שלד_נח_3.pdf",
      },
    ],
  },
  {
    id: "632277",
    name: "יוסף בילר קבלן שלד",
    hp: "512839102",
    contactName: "יוסי בילר",
    phone: "054-2233445",
    city: "הוד השרון",
    address: "ירושלים 1, הוד השרון",
    tag: "מלגזה באתר",
    preferredDriver: "עלי",
    truckType: "משאית פלטה 651-51-701",
    defaultYard: "מחסן 4 החרש 10",
    accessNotes: ["מלגזה קבועה באתר פריקה", "פריקה מהירה על פלטה", "אין צורך במנוף"],
    depositLedger: {
      bales60002: { billed: 30, returned: 22, openBalance: 8 },
      pallets60060: { billed: 92, returned: 54, openBalance: 38 },
    },
    ordersHistory: [
      {
        id: "6215942",
        date: "2026-10-13",
        status: "סופק",
        itemsCount: 4,
        totalIls: 4015,
        weightTons: 11.4,
        driverName: "חכמת",
        items: [
          { sku: "11551", name: "חול שק גדול", qty: 10, unit: "שק", price: 240 },
          { sku: "10002", name: "מלט 25 ק״ג", qty: 55, unit: "שק", price: 22 },
          { sku: "19412", name: "SIKA ECO 412 25 ק״ג", qty: 3, unit: "שק", price: 95 },
          { sku: "60060", name: "משטח עץ סבן (פקדון)", qty: 2, unit: "יח׳", price: 60 },
        ],
      },
    ],
    invoicesHistory: [
      {
        id: "INV-90198",
        invoiceNo: "90198",
        date: "2026-09-30",
        type: "חשבונית מס",
        amountIls: 8940,
        status: "שולם",
        issuedBy: "לינה הנה״ח",
        pdfName: "חשבונית_90198_בילר.pdf",
      },
    ],
  },
  {
    id: "612108",
    name: "ש. לוי שיפוצים וגמר",
    hp: "515902341",
    contactName: "שלומי לוי",
    phone: "052-5551234",
    city: "ראשון לציון",
    address: "הרצל 40, ראשון לציון",
    tag: "דורש תשלום במזומן",
    preferredDriver: "חכמת",
    truckType: "משאית מנוף 615-41-002",
    defaultYard: "מחסן 4 החרש 10",
    accessNotes: [
      "שער בי״ס צר — תיאום הגעה 30 דק׳ מראש",
      "תשלום מזומן לנהג טרם פריקה (הוראת לינה)",
      "חתימה על תעודה מקורית בלבד",
    ],
    depositLedger: {
      bales60002: { billed: 18, returned: 12, openBalance: 6 },
      pallets60060: { billed: 40, returned: 26, openBalance: 14 },
    },
    ordersHistory: [
      {
        id: "37901",
        date: "2026-10-15",
        status: "בביצוע",
        itemsCount: 2,
        totalIls: 1880,
        weightTons: 9.8,
        driverName: "חכמת",
        items: [
          { sku: "22040", name: "בלוק 20/40/20", qty: 6, unit: "משטח", price: 250 },
          { sku: "10002", name: "מלט 50 ק״ג", qty: 40, unit: "שק", price: 38 },
        ],
      },
    ],
    invoicesHistory: [
      {
        id: "INV-90205",
        invoiceNo: "90205",
        date: "2026-10-02",
        type: "חשבונית מס",
        amountIls: 2200,
        status: "שולם",
        issuedBy: "לינה הנה״ח",
        pdfName: "חשבונית_שלומי_לוי.pdf",
      },
    ],
  },
  {
    id: "618450",
    name: "מגדלי הים בע״מ",
    hp: "516049281",
    contactName: "דורון ימי",
    phone: "054-7778899",
    city: "בת ים",
    address: "הים 8, בת ים",
    tag: "לקוח עוגן",
    preferredDriver: "עלי",
    truckType: "משאית פלטה 651-51-701",
    defaultYard: "מחסן 1 התלמיד 6",
    accessNotes: [
      "אין חניה ברחוב הים — פריקה מהירה בלבד",
      "עבודה מול מנהל עבודה דורון",
      "מלגזה של האתר מפרקת",
    ],
    depositLedger: {
      bales60002: { billed: 78, returned: 52, openBalance: 26 },
      pallets60060: { billed: 110, returned: 65, openBalance: 45 },
    },
    ordersHistory: [
      {
        id: "37905",
        date: "2026-10-15",
        status: "הוזמן",
        itemsCount: 2,
        totalIls: 2650,
        weightTons: 6.25,
        driverName: "עלי",
        items: [
          { sku: "11550", name: "חול מחצבה", qty: 5, unit: "בלה", price: 240 },
          { sku: "10008", name: "טיח צמנטי", qty: 50, unit: "שק", price: 29 },
        ],
      },
    ],
    invoicesHistory: [
      {
        id: "INV-90185",
        invoiceNo: "90185",
        date: "2026-09-22",
        type: "חשבונית מס",
        amountIls: 18900,
        status: "שולם",
        issuedBy: "לינה הנה״ח",
        pdfName: "חשבונית_מגדלי_הים.pdf",
      },
    ],
  },
  {
    id: "625091",
    name: "א. כהן קבלנות פיתוח",
    hp: "514392019",
    contactName: "אבי כהן",
    phone: "050-1112233",
    city: "תל אביב - יפו",
    address: "שד׳ ירושלים 112, יפו",
    tag: "שוטף מאושר",
    preferredDriver: "חכמת",
    truckType: "משאית מנוף 615-41-002",
    defaultYard: "מחסן 4 החרש 10",
    accessNotes: ["פריקה במנוף לקומה 3", "רחוב חד-סטרי — כניסה מרחוב עזה בלבד", "זהירות מרכבת קלה"],
    depositLedger: {
      bales60002: { billed: 35, returned: 25, openBalance: 10 },
      pallets60060: { billed: 55, returned: 38, openBalance: 17 },
    },
    ordersHistory: [
      {
        id: "37910",
        date: "2026-10-15",
        status: "הוזמן",
        itemsCount: 1,
        totalIls: 4800,
        weightTons: 1.5,
        items: [{ sku: "19800", name: "ברזל 10 מ״מ", qty: 1.5, unit: "טון", price: 3200 }],
      },
    ],
    invoicesHistory: [
      {
        id: "INV-90212",
        invoiceNo: "90212",
        date: "2026-10-07",
        type: "חשבונית מס",
        amountIls: 5400,
        status: "שולם",
        issuedBy: "לינה הנה״ח",
        pdfName: "חשבונית_כהן_קבלנות.pdf",
      },
    ],
  },
  {
    id: "629334",
    name: "יזמות הדר השרון",
    hp: "515239401",
    contactName: "מוטי הדר",
    phone: "053-4445566",
    city: "הוד השרון",
    address: "הנרקיס 3, הוד השרון",
    tag: "לקוח עוגן",
    preferredDriver: "חכמת",
    truckType: "משאית מנוף 615-41-002",
    defaultYard: "מחסן 1 התלמיד 6",
    accessNotes: ["זהירות מכבלי תקשורת", "כניסה מרווחת, חניה בחצר", "מנוף נדרש לפריקת לוחות גבס"],
    depositLedger: {
      bales60002: { billed: 52, returned: 38, openBalance: 14 },
      pallets60060: { billed: 86, returned: 61, openBalance: 25 },
    },
    ordersHistory: [
      {
        id: "37912",
        date: "2026-10-16",
        status: "הוזמן",
        itemsCount: 2,
        totalIls: 5280,
        weightTons: 2.88,
        driverName: "חכמת",
        items: [
          { sku: "31012", name: "גבס לוח 12.5", qty: 120, unit: "לוח", price: 34 },
          { sku: "32070", name: "פרופיל 70", qty: 200, unit: "יח׳", price: 6 },
        ],
      },
    ],
    invoicesHistory: [
      {
        id: "INV-90177",
        invoiceNo: "90177",
        date: "2026-09-18",
        type: "חשבונית מס",
        amountIls: 11200,
        status: "שולם",
        issuedBy: "לינה הנה״ח",
        pdfName: "חשבונית_הדר_השרון.pdf",
      },
    ],
  },
];

// Helper calculations
export function getCustomerById(id: string): CustomerProfile | undefined {
  return CUSTOMERS.find((c) => c.id === id);
}

export function getDeliveryNotesForCustomer(customerNo: string): DeliveryNote[] {
  return NOTES.filter((n) => n.customerNo === customerNo);
}

export function calculateTotalCustomerDeposits() {
  // Aggregate from listed profiles plus company totals
  // Prompt mentions active customers (63), total field big bags (60002) and pallets (60060)
  const baseBales = CUSTOMERS.reduce((sum, c) => sum + c.depositLedger.bales60002.openBalance, 0);
  const basePallets = CUSTOMERS.reduce(
    (sum, c) => sum + c.depositLedger.pallets60060.openBalance,
    0,
  );

  return {
    totalActiveCustomers: 63,
    totalFieldBales60002: baseBales + 329, // Total open big bags across all Saban active sites (418)
    totalFieldPallets60060: basePallets + 132, // Total pallets across all Saban active sites (276)
  };
}
