import type { DeliveryNote } from "@/lib/data";

export type LogisticsFinding = {
  id: string;
  category: "quantity" | "deposit" | "transport" | "source" | "tracking";
  title: string;
  detail: string;
  expected?: string;
  observed?: string;
  sourceRequired: string;
  severity: "blocker" | "review";
};

const normalize = (value: unknown) =>
  String(value ?? "").normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim();

function extractSku(name: string, explicitSku?: string): string | undefined {
  // A separate source-sheet SKU is authoritative; otherwise only accept an explicit numeric token.
  const supplied = normalize(explicitSku);
  if (/^\d{4,10}$/.test(supplied)) return supplied;
  return normalize(name).match(/(?:מק["״']?ט\s*)?(\d{5,8})/)?.[1];
}

export function buildLogisticsFindings(note: DeliveryNote): LogisticsFinding[] {
  const findings: LogisticsFinding[] = [];
  const items = Array.isArray(note.items) ? note.items : [];

  if (note.live) {
    findings.push({
      id: "source:live",
      category: "source",
      title: "הצלבת מקור נדרשת",
      detail: "הנתונים נטענו מהגיליון החי אך עדיין לא הוצלבו מול הזמנת המקור/קומקס ומסמך ה-PDF.",
      sourceRequired: "מספר הזמנה ומסמך PDF מקוריים, כולל עמוד ושורת ראיה",
      severity: "blocker",
    });
  }

  if (!note.comaxOrder) {
    findings.push({
      id: "source:order",
      category: "source",
      title: "מספר הזמנה חסר",
      detail: "לא קיים מזהה הזמנה להשוואה חד-משמעית.",
      sourceRequired: "הזמנת קומקס או מסמך הזמנה מאושר",
      severity: "blocker",
    });
  }

  if (!note.fileId && !note.driveUrl && !note.scanImage && !(note.scans?.length)) {
    findings.push({
      id: "source:document",
      category: "source",
      title: "מסמך מקור לא מקושר",
      detail: "לא נמצא קישור סריקה/מסמך ברשומת התעודה.",
      sourceRequired: "PDF המקור או קישור Drive תקין",
      severity: "blocker",
    });
  }

  items.forEach((item, index) => {
    const sku = extractSku(item.name, item.sku);
    const title = sku ? `מק״ט ${sku}` : item.name || `שורה ${index + 1}`;
    const safeQty = Number.isFinite(Number(item.qty)) ? Number(item.qty) : null;
    const safeOrdered = Number.isFinite(Number(item.ordered)) ? Number(item.ordered) : null;
    const isTransport = /הובל|מנוף|משלוח|הובלה|הובלות/i.test(normalize(item.name));
    const id = `item:${sku || normalize(item.name).toLowerCase().replace(/\s+/g, "-") || index}`;

    if (note.live) {
      findings.push({
        id: `${id}:live-order-crosscheck`,
        category: "quantity",
        title: `${title} — כמות הזמנה לא הוצלבה`,
        detail: "בנתון החי הכמות הצפויה אינה מגיעה מהזמנה נפרדת. אין להסיק שהכמות תואמת רק משום שהשדות המקומיים זהים.",
        expected: "כמות מהזמנת המקור",
        observed: String(item.qty ?? "לא ידוע"),
        sourceRequired: "הזמנת קומקס ותעודת PDF, אותו מק״ט ויחידת מידה",
        severity: "blocker",
      });
      findings.push({
        id: `${id}:catalog-crosscheck`,
        category: "source",
        title: `${title} — אימות מק״ט מול קטלוג`,
        detail: "אין כרגע חיבור לקטלוג מק״טים מוסמך. התאמה מספרית/טקסטואלית בלבד אינה מאשרת שהמק״ט קיים, פעיל ומתאים לפריט.",
        expected: sku || "מק״ט מקור חסר",
        observed: item.name,
        sourceRequired: "קטלוג מק״טים פעיל של קומקס ותיאור פריט תואם",
        severity: "blocker",
      });
    }

    if (!sku) {
      findings.push({
        id: `${id}:sku`,
        category: isTransport ? "transport" : "source",
        title: `${title} — מק״ט לא זוהה`,
        detail: "לא ניתן להוכיח התאמה לפי מק״ט מתוך שם הפריט בלבד. אין לבצע התאמה אוטומטית על בסיס דמיון בשם.",
        expected: "מק״ט מדויק בהזמנה",
        observed: item.name,
        sourceRequired: "שורת הזמנה ושורת תעודה עם מק״ט מפורש",
        severity: "blocker",
      });
    }

    if (safeQty === null || safeOrdered === null) {
      findings.push({
        id: `${id}:quantity-missing`,
        category: "quantity",
        title: `${title} — כמות לא תקינה`,
        detail: "אחת הכמויות חסרה או אינה מספרית.",
        expected: String(item.ordered ?? "לא ידוע"),
        observed: String(item.qty ?? "לא ידוע"),
        sourceRequired: "שורת הכמות בהזמנה ובתעודת המשלוח",
        severity: "blocker",
      });
    } else if (safeQty !== safeOrdered) {
      findings.push({
        id: `${id}:quantity`,
        category: isTransport ? "transport" : "quantity",
        title: `${title} — פער כמות`,
        detail: `הכמות בתעודה ${safeQty}; הכמות בהזמנה ${safeOrdered}; הפרש (תעודה פחות הזמנה): ${safeQty - safeOrdered}.`,
        expected: String(safeOrdered),
        observed: String(safeQty),
        sourceRequired: isTransport
          ? "הזמנת הובלה/שירות ותיעוד ביצוע, כולל תאריך ורכב"
          : "שורת ההזמנה ושורת התעודה באותו מק״ט ובאותה יחידת מידה",
        severity: "blocker",
      });
    }

    if (isTransport) {
      findings.push({
        id: `${id}:transport-sku-validity`,
        category: "transport",
        title: `${title} — תוקף מק״ט הובלה לא אומת`,
        detail: "אין למערכת קטלוג מק״טים מוסמך זמין להשוואה. מספר שנראה תקין תחבירית אינו הוכחה שהמק״ט פעיל או מתאים לשירות.",
        expected: sku || "מק״ט הובלה חסר",
        observed: item.name,
        sourceRequired: "קטלוג מק״טים/שירותים מאושר של קומקס עם תאריך עדכון",
        severity: "blocker",
      });
      findings.push({
        id: `${id}:transport-proof`,
        category: "transport",
        title: `${title} — אימות ביצוע הובלה`,
        detail: "שורת שירות/הובלה נבדקת בנפרד מפריטי חומר. עצם קיומה בתעודה אינו מוכיח שההובלה בוצעה.",
        expected: note.comaxOrder || "הזמנה חסרה",
        observed: note.driver || "לא משויך נהג",
        sourceRequired: "מספר הזמנת הובלה, נהג/רכב, מועד ביצוע ואסמכתת ביצוע",
        severity: "blocker",
      });
    }
  });

  const deposits = [
    { sku: "60002", label: "בלות פיקדון", data: note.deposits?.bales60002 },
    { sku: "60060", label: "משטחי עץ / פיקדון", data: note.deposits?.pallets60060 },
  ];
  deposits.forEach(({ sku, label, data }) => {
    if (note.live) {
      findings.push({
        id: `deposit:${sku}:live-crosscheck`,
        category: "deposit",
        title: `${label} (${sku}) — הצלבה עצמאית נדרשת`,
        detail: "רשומת הגיליון אינה מספקת שתי תנועות עצמאיות של אספקה וחיוב/זיכוי. אין להסיק התאמה מכך ששני הערכים נגזרו מאותו טקסט.",
        sourceRequired: "תנועת פיקדון באספקה וגם תנועת חיוב/זיכוי ממקור נפרד, שתיהן מקושרות לתעודה",
        severity: "blocker",
      });
    }
    if (!data) {
      findings.push({
        id: `deposit:${sku}:missing`,
        category: "deposit",
        title: `${label} (${sku}) — נתוני פיקדון חסרים`,
        detail: "אין נתון מספק/מחויב ברשומת התעודה. אין להסיק שכמות היא אפס.",
        sourceRequired: "תנועת פיקדון, תעודת משלוח ורישום חיוב/זיכוי",
        severity: "blocker",
      });
      return;
    }
    const delivered = Number(data.delivered);
    const billed = Number(data.billed);
    if (!Number.isFinite(delivered) || !Number.isFinite(billed)) {
      findings.push({
        id: `deposit:${sku}:invalid`,
        category: "deposit",
        title: `${label} (${sku}) — נתון לא תקין`,
        detail: "כמות הפיקדון או החיוב אינה מספרית.",
        sourceRequired: "רישום פיקדון וחיוב ממקור מוסמך",
        severity: "blocker",
      });
    } else if (delivered !== billed) {
      findings.push({
        id: `deposit:${sku}:mismatch`,
        category: "deposit",
        title: `${label} (${sku}) — פער פיקדון`,
        detail: `${delivered} נרשמו כסופקו לעומת ${billed} שנרשמו כחיוב; פער: ${delivered - billed}.`,
        expected: String(billed),
        observed: String(delivered),
        sourceRequired: "תנועת פיקדון ותנועת חיוב/זיכוי המתייחסות לאותה תעודה",
        severity: "blocker",
      });
    }
  });

  if (!note.gps || note.gps.status !== "ok" || note.live) {
    findings.push({
      id: "tracking:transport",
      category: "tracking",
      title: "אימות נהג/רכב/ביצוע חסר",
      detail: note.gps?.note || "לא קיים אימות איתוראן/ביצוע ברשומה.",
      sourceRequired: "רישום איתוראן או מקור צי מאומת עם חותמת זמן וקישור לתעודה",
      severity: "blocker",
    });
  }

  return findings;
}

export function isLogisticsAuditComplete(
  findings: LogisticsFinding[],
  evidenceByFinding: Record<string, string>,
): boolean {
  return findings.length > 0 &&
    findings.every((finding) => normalize(evidenceByFinding[finding.id]).length >= 12);
}
