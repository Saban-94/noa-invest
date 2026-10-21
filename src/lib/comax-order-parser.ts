import { z } from "zod";

const ItemSchema = z.object({
  lineIndex: z.number().int().nonnegative(),
  sku: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number(),
  unitWeightKg: z.number().nonnegative(),
  totalWeightKg: z.number(),
  isDeposit: z.boolean(),
});

export const ComaxOrderItemSchema = ItemSchema;

export const ComaxOrderSchema = z.object({
  orderNumber: z.string().regex(/^\d+$/),
  orderDateTime: z.string(),
  copyNumber: z.string().optional(),
  companyVatId: z.string(),
  customerName: z.string(),
  customerId: z.string(),
  deliveryAddress: z.string(),
  city: z.string(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  warehouse: z.enum(["מחסן 4 החרש 10", "מחסן 1 התלמיד 6"]),
  agent: z.string().optional(),
  items: z.array(ItemSchema),
  deposits: z.object({
    bigBagsRequired: z.number(),
    bigBagsFound: z.number(),
    palletsRequired: z.number(),
    palletsFound: z.number(),
    blocksPalletsRequired: z.number(),
    blocksPalletsFound: z.number(),
  }),
  warnings: z.array(z.string()),
});

export type ComaxOrder = z.infer<typeof ComaxOrderSchema>;

export const ComaxOrderSummary = ComaxOrderSchema.pick({
  orderNumber: true,
  customerName: true,
  customerId: true,
  deliveryAddress: true,
  items: true,
  deposits: true,
  warnings: true,
});

export type ComaxParseOptions = { text: string; catalog?: Record<string, number> };

const num = (s: string | undefined) => Number((s ?? "0").replace(/,/g, ""));

const field = (text: string, labels: string[]) => {
  const line = text.split(/\r?\n/).find((l) => labels.some((x) => l.includes(x)));
  return line?.split(/[:：]/).slice(1).join(":").trim() ?? "";
};

const depositSku = (sku: string) => ["60002", "60060", "60006"].includes(sku);

export function parseComaxOrder({ text, catalog = {} }: ComaxParseOptions): ComaxOrder {
  const orderNumber =
    text.match(/(?:מספר הזמנה|הזמנה)\D{0,10}(\d{6,})/)?.[1] ?? text.match(/\b62\d{5}\b/)?.[0] ?? "";

  const customerMatch = text.match(/([^\n()]+)\s*\((\d{5,})\)/);
  const warehouse = text.includes("התלמיד") ? "מחסן 1 התלמיד 6" : "מחסן 4 החרש 10";

  const items = text
    .split(/\r?\n/)
    .map((line, lineIndex) => {
      const m = line.match(
        /^\s*(\d+)\s+(\d{4,6})\s+(.+?)\s+(שק|בלה(?:\s*\/\s*שק גד)?|משטח|יח['׳]|דלי)\s+(-?\d+(?:\.\d+)?)\s*$/,
      );
      if (!m) return null;

      const [, , sku, name, unit, quantity] = m;
      const unitWeightKg =
        catalog[sku] ?? (name.includes("25") ? 25 : name.includes("50") ? 50 : 0);

      return {
        lineIndex,
        sku,
        name: name.trim(),
        unit,
        quantity: num(quantity),
        unitWeightKg,
        totalWeightKg: num(quantity) * unitWeightKg,
        isDeposit: depositSku(sku) || /פקדון|סטורנו/i.test(name),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const bigBagsRequired = items
    .filter((i) => !i.isDeposit && /חול|סומסום|כוכר|טיח|טיט|לבן/i.test(i.name))
    .reduce((s, i) => s + Math.max(0, i.quantity), 0);

  const cementSacks = items
    .filter((i) => !i.isDeposit && (i.sku === "10002" || /מלט|דבק|טיח/i.test(i.name)))
    .reduce((s, i) => s + Math.max(0, i.quantity), 0);

  const blocks = items
    .filter((i) => !i.isDeposit && /בלוק/i.test(i.name))
    .reduce((s, i) => s + Math.max(0, i.quantity), 0);

  const found = (skus: string[]) =>
    items.filter((i) => skus.includes(i.sku)).reduce((s, i) => s + Math.max(0, i.quantity), 0);

  const deposits = {
    bigBagsRequired,
    bigBagsFound: found(["60002"]),
    palletsRequired: Math.ceil(cementSacks / 40),
    palletsFound: found(["60060"]),
    blocksPalletsRequired: Math.ceil(blocks / 75),
    blocksPalletsFound: found(["60006"]),
  };

  const warnings: string[] = [];
  if (deposits.bigBagsRequired !== deposits.bigBagsFound)
    warnings.push(
      `פקדון בלה 60002: נדרש ${deposits.bigBagsRequired}, נמצא ${deposits.bigBagsFound}`,
    );
  if (deposits.palletsRequired !== deposits.palletsFound)
    warnings.push(
      `פקדון משטחים 60060: נדרש ${deposits.palletsRequired}, נמצא ${deposits.palletsFound}`,
    );
  if (deposits.blocksPalletsRequired !== deposits.blocksPalletsFound)
    warnings.push(
      `פקדון משטחי בלוקים 60006: נדרש ${deposits.blocksPalletsRequired}, נמצא ${deposits.blocksPalletsFound}`,
    );

  const result = {
    orderNumber,
    orderDateTime:
      field(text, ["תאריך", "שעה"]) || new Date().toISOString().slice(0, 16).replace("T", " "),
    copyNumber: text.match(/העתק\s*\d+/)?.[0],
    companyVatId: text.match(/512001678/)?.[0] ?? "",
    customerName: customerMatch?.[1]?.trim() ?? field(text, ["לקוח"]),
    customerId: customerMatch?.[2] ?? "",
    deliveryAddress: field(text, ["כתובת אספקה", "כתובת משלוח", "אתר"]),
    city: field(text, ["עיר"]),
    contactName: field(text, ["איש קשר"]),
    contactPhone: text.match(/(?:05\d[- ]?\d{7})/)?.[1],
    warehouse,
    agent: field(text, ["סוכן", "מפיק"]),
    items,
    deposits,
    warnings,
  };

  return ComaxOrderSchema.parse(result);
}

export function reconcileDeposits(
  items: Array<Pick<z.infer<typeof ItemSchema>, "sku" | "name" | "quantity">>,
) {
  return parseComaxOrder({
    text: items.map((i, n) => `${n + 1} ${i.sku} ${i.name} יח' ${i.quantity}`).join("\n"),
  }).deposits;
}

export type { z };

export const ComaxOrderSummarySchema = ComaxOrderSummary;
export type ComaxOrderSummary = z.infer<typeof ComaxOrderSummary>;
