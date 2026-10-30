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

export function buildLogisticsFindings(\n  note: DeliveryNote,\n  comaxItems: Array<{ sku: string; name?: string; qty: number; unit?: string }> = [],\n): LogisticsFinding[] {
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
    const comaxMatch = sku ? comaxItems.find((source) => normalize(source.sku) === sku) : undefined;\n    const safeOrdered = note.live\n      ? (comaxMatch && Number.isFinite(Number(comaxMatch.qty)) ? Number(comaxMatch.qty) : null)\n      : (Number.isFinite(Number(item.ordered)) ? Number(item.ordered) : null);
    const isTransport = /הובל|מנוף|משלוח|הובלה|הובלות/i.test(normalize(item.name));
    const id = `item:${sku || normalize(item.name).toLowerCase().replace(/\s+/g, "-") || index}`;

    if (note.live && !comaxItems.length) {
      findings.push({
        id: `${id}:live-order-crosscheck`,
        category: "quantity",
        title: `${title} — לא ניתן להשוות להזמנה`,
        detail: "מניפסט קומקס לא נטען; הכמות בתעודה אינה יכולה לשמש ככמות ההזמנה.",
        observed: String(item.qty ?? "לא ידוע"),
        sourceRequired: "הזמנת קומקס מלאה עם מק״ט, כמות ויחידת מידה",
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

    if (note.live && comaxItems.length > 0 && sku && !comaxMatch) {\n      findings.push({\n        id: `${id}:not-in-order`,\n        category: "quantity",\n        title: `${title} — פריט לא מופיע בהזמנה`,\n        detail: "המק״ט מופיע בתעודת המשלוח אך לא נמצא במניפסט הזמנת קומקס.",\n        observed: String(item.qty ?? "לא ידוע"),\n        sourceRequired: "בדיקת שורת הפריט בתעודה ובהזמנת קומקס",\n        severity: "blocker",\n      });\n    }\n\n    if (safeQty === null || safeOrdered === null) {
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

  if (note.live && comaxItems.length > 0) {
    const deliverySkus = new Set(items.map((item) => extractSku(item.name, item.sku)).filter(Boolean));
    comaxItems.forEach((source) => {
      const sourceSku = normalize(source.sku);
      if (!sourceSku || deliverySkus.has(sourceSku)) return;
      findings.push({
        id: `order-item:${sourceSku}:missing-from-note`,
        category: "quantity",
        title: `מק״ט ${sourceSku} — חסר בתעודת המשלוח`,
        detail: "הפריט מופיע בהזמנת קומקס אך לא זוהה בתעודת המשלוח.",
        expected: String(source.qty),
        observed: "לא מופיע בתעודה",
        sourceRequired: "הזמנת קומקס מול כל שורות תעודת המשלוח",
        severity: "blocker",
      });
    });
  }

  // פיקדון הוא בדיקה אחת לכל מק״ט: נתונים חסרים, פער והצלבה מוצגים יחד.
  const deposits = [
    { sku: "60002", label: "בלות פיקדון", data: note.deposits?.bales60002 },
    { sku: "60060", label: "משטחי עץ / פיקדון", data: note.deposits?.pallets60060 },
  ];
  deposits.forEach(({ sku, label, data }) => {
    const hasDelivered = data?.delivered !== undefined && data?.delivered !== null && String(data.delivered).trim() !== "";
    const hasBilled = data?.billed !== undefined && data?.billed !== null && String(data.billed).trim() !== "";
    const delivered = hasDelivered ? Number(data?.delivered) : NaN;
    const billed = hasBilled ? Number(data?.billed) : NaN;
    const missing = !data || !hasDelivered || !hasBilled;
    const invalid = !missing && (!Number.isFinite(delivered) || !Number.isFinite(billed));
    const mismatch = !missing && !invalid && delivered !== billed;
    const independentCheck = Boolean(note.live);
    if (!missing && !invalid && !mismatch && !independentCheck) return;
    const details: string[] = [];
    if (missing) details.push("נתוני כמות שסופקה ו/או כמות שחויבה חסרים. אין להסיק שכמות חסרה היא אפס.");
    if (invalid) details.push("כמות הפיקדון או החיוב אינה מספרית.");
    if (mismatch) details.push(String(delivered) + " נרשמו כסופקו לעומת " + String(billed) + " שנרשמו כחיוב; פער: " + String(delivered - billed) + ".");
    if (independentCheck) details.push("נדרשת הצלבה עצמאית בין תנועת אספקת הפיקדון לבין תנועת חיוב/זיכוי ממקור נפרד.");
    findings.push({
      id: "deposit:" + sku + ":audit",
      category: "deposit",
      title: label + " (" + sku + ") — " + (missing ? "נתונים חסרים" : mismatch ? "פער פיקדון" : invalid ? "נתון לא תקין" : "הצלבה עצמאית נדרשת"),
      detail: details.join(" "),
      expected: hasBilled && Number.isFinite(billed) ? String(billed) : undefined,
      observed: hasDelivered && Number.isFinite(delivered) ? String(delivered) : undefined,
      sourceRequired: "תנועת אספקת פיקדון ותנועת חיוב/זיכוי ממקור נפרד, עם מספר אסמכתא ותאריך, המקושרות לאותה תעודה",
      severity: "blocker",
    });
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
