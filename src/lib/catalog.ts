/**
 * קטלוג לוגיסטי מטאב "מילון_לוגיסטי".
 * לא מתייחסים לערך כמאומת רק משום שהוא קיים: נדרשות עמודות האימות בגיליון.
 */

export type DepositKind = "bale" | "pallet" | "blockPallet" | "drum";
export type WeightStatus = "verified" | "unknown" | "not_applicable";

export type CatalogItem = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  slang: string[];
  depositKind: DepositKind | null;
  perPallet: number | null;
  weightKg: number | null;
  weightStatus: WeightStatus;
  depositStatus: "verified" | "unknown";
  isDepositSku: boolean;
  rows: number[];
  issues: string[];
  conflict: boolean;
};

export type RawCatalogRow = Record<string, string | number | boolean | null | undefined> & { _row?: number };

export const DEPOSIT_SKU: Record<DepositKind, string> = {
  bale: "60002",
  pallet: "60060",
  blockPallet: "60006",
  drum: "60004",
};

const COL = {
  sku: "מק״ט ראשי (SKU)",
  legacySku: 'מק"ט (SKU)',
  name: "שם מוצר רשמי (קומקס)",
  category: "קטגוריה לוגיסטית",
  unit: "יחידת מידה",
  slang: "סלנג ומילות מפתח לנרמול AI",
  deposit: "סיווג וחישוב פקדונות",
  weight: "משקל יח' (ק\"ג)",
  weightStatus: "סטטוס משקל",
  depositStatus: "סיווג פקדון מאומת",
  primarySku: "מק״ט ראשי",
} as const;

const s = (v: unknown) => String(v ?? "").trim();
const rowSku = (row: RawCatalogRow) => s(row[COL.sku]) || s(row[COL.legacySku]);
const truthyStatus = (v: unknown) => ["מאומת", "verified", "כן", "true", "1"].includes(s(v).toLowerCase());

function parseDeposit(raw: string): { kind: DepositKind | null; perPallet: number | null; issue?: string } {
  const t = raw.trim();
  if (!t) return { kind: null, perPallet: null, issue: "סיווג פקדון חסר" };
  if (t === "ללא") return { kind: null, perPallet: null };
  if (t.includes("60002") || t.startsWith("בלה")) return { kind: "bale", perPallet: null };
  if (t.includes("60004") || t.startsWith("חבית") || t.includes("פקדון חבית")) return { kind: "drum", perPallet: null };
  if (t.includes("60060") || t.startsWith("משטח סבן")) {
    const n = t.match(/\((\d+)\s*שקים\)/)?.[1];
    return n
      ? { kind: "pallet", perPallet: Number(n) }
      : { kind: "pallet", perPallet: null, issue: "חסרה כמות שקים למשטח" };
  }
  if (t.includes("60006") || t.startsWith("משטח בלוקים") || t.includes("פקדון משטח בלוק")) {
    const m = t.match(/\((\d+)\s*(?:יח|בלוקים)/);
    return m
      ? { kind: "blockPallet", perPallet: Number(m[1]) }
      : { kind: "blockPallet", perPallet: null, issue: "כמות בלוקים למשטח לא חד־משמעית" };
  }
  if (t.includes("פקדון משטח עץ")) return { kind: "pallet", perPallet: null, issue: "חסרה כמות שקים למשטח" };
  if (t.includes("פקדון שק גדול")) return { kind: "bale", perPallet: null };
  return { kind: null, perPallet: null, issue: `סיווג פקדון לא מוכר: "${t}"` };
}

function buildOne(row: RawCatalogRow, hasWeightStatusColumn: boolean, hasDepositStatusColumn: boolean): CatalogItem {
  const rawDeposit = s(row[COL.deposit]);
  const dep = parseDeposit(rawDeposit);
  const category = s(row[COL.category]);
  const sku = rowSku(row);
  const isDepositSku = category.includes("מק״ט פקדון") || Object.values(DEPOSIT_SKU).includes(sku);
  const wRaw = s(row[COL.weight]);
  const w = Number(wRaw.replace(/,/g, ""));
  const positiveWeight = wRaw !== "" && Number.isFinite(w) && w > 0;
  const weightVerified = hasWeightStatusColumn && truthyStatus(row[COL.weightStatus]);
  const weightNotApplicable = isDepositSku || category.includes("הובל");
  const depositVerified = hasDepositStatusColumn && truthyStatus(row[COL.depositStatus]);
  const issues: string[] = [];

  if (dep.issue) issues.push(dep.issue);
  if (!hasDepositStatusColumn) issues.push("חסרה עמודת 'סיווג פקדון מאומת'");
  else if (!depositVerified) issues.push("סיווג הפקדון טרם סומן כמאומת");
  if (!weightNotApplicable && !positiveWeight) issues.push("משקל חסר או 0");
  if (!weightNotApplicable && positiveWeight && !hasWeightStatusColumn) issues.push("חסרה עמודת 'סטטוס משקל'");
  else if (!weightNotApplicable && positiveWeight && !weightVerified) issues.push("המשקל טרם סומן כמאומת");

  return {
    sku,
    name: s(row[COL.name]),
    category,
    unit: s(row[COL.unit]),
    slang: s(row[COL.slang]).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean),
    depositKind: dep.kind,
    perPallet: dep.perPallet,
    weightKg: positiveWeight && weightVerified ? w : null,
    weightStatus: weightNotApplicable ? "not_applicable" : weightVerified && positiveWeight ? "verified" : "unknown",
    depositStatus: depositVerified ? "verified" : "unknown",
    isDepositSku,
    rows: typeof row._row === "number" ? [row._row] : [],
    issues,
    conflict: false,
  };
}

export type Catalog = { items: Map<string, CatalogItem>; conflicts: string[]; totalRows: number };

/** כפילויות סותרות נחסמות. מיפוי למק"ט ראשי דורש ערך מפורש; לא מנחשים שורה פעילה. */
export function buildCatalog(rows: RawCatalogRow[]): Catalog {
  const items = new Map<string, CatalogItem>();
  const conflicts: string[] = [];
  const hasWeightStatusColumn = rows.some((r) => Object.prototype.hasOwnProperty.call(r, COL.weightStatus));
  const hasDepositStatusColumn = rows.some((r) => Object.prototype.hasOwnProperty.call(r, COL.depositStatus));

  for (const row of rows) {
    const originalSku = rowSku(row);
    const separatePrimarySku = s(row[COL.primarySku]);
    const sku = separatePrimarySku || originalSku;
    if (!sku) continue;
    const it = buildOne({ ...row, [COL.sku]: sku }, hasWeightStatusColumn, hasDepositStatusColumn);
    const prev = items.get(sku);
    if (!prev) {
      items.set(sku, it);
      continue;
    }

    const same =
      prev.depositKind === it.depositKind &&
      prev.perPallet === it.perPallet &&
      prev.weightKg === it.weightKg &&
      prev.weightStatus === it.weightStatus &&
      prev.depositStatus === it.depositStatus &&
      prev.isDepositSku === it.isDepositSku;
    prev.rows.push(...it.rows);
    if (!same) {
      if (!prev.conflict) conflicts.push(sku);
      prev.conflict = true;
      if (!prev.issues.includes("מק״ט כפול עם נתונים סותרים")) prev.issues.push("מק״ט כפול עם נתונים סותרים");
    }
  }
  return { items, conflicts, totalRows: rows.length };
}

export type OrderLine = { sku: string; qty: number };
export type DepositCheck = {
  required: Record<string, number>;
  unresolved: { sku: string; reason: string }[];
  complete: boolean;
};

export function expectedDeposits(lines: OrderLine[], cat: Catalog): DepositCheck {
  const required: Record<string, number> = {};
  const unresolved: DepositCheck["unresolved"] = [];
  const palletUnits = new Map<string, number>();
  const add = (k: string, n: number) => (required[k] = (required[k] ?? 0) + n);

  for (const l of lines) {
    if (Object.values(DEPOSIT_SKU).includes(l.sku)) continue;
    const it = cat.items.get(l.sku);
    if (!it) { unresolved.push({ sku: l.sku, reason: "מק״ט לא בקטלוג" }); continue; }
    if (it.conflict) { unresolved.push({ sku: l.sku, reason: "מק״ט כפול סותר בטאב" }); continue; }
    if (it.isDepositSku) continue;
    if (it.depositStatus !== "verified") { unresolved.push({ sku: l.sku, reason: "סיווג הפקדון לא אומת" }); continue; }
    if (it.issues.some((x) => x.includes("סיווג פקדון חסר") || x.includes("סיווג פקדון לא מוכר"))) {
      unresolved.push({ sku: l.sku, reason: "סיווג הפקדון חסר או לא מוכר" }); continue;
    }
    if (!it.depositKind) continue;
    if (it.depositKind === "bale") add(DEPOSIT_SKU.bale, l.qty);
    else if (it.depositKind === "drum") add(DEPOSIT_SKU.drum, l.qty);
    else if (!it.perPallet) unresolved.push({ sku: l.sku, reason: "חסרה כמות למשטח" });
    else {
      const key = `${it.depositKind}|${it.perPallet}`;
      palletUnits.set(key, (palletUnits.get(key) ?? 0) + l.qty);
    }
  }
  for (const [key, units] of palletUnits) {
    const [kind, per] = key.split("|") as [DepositKind, string];
    add(DEPOSIT_SKU[kind], Math.ceil(units / Number(per)));
  }
  return { required, unresolved, complete: unresolved.length === 0 };
}

export type WeightResult = { knownKg: number; unknown: { sku: string; reason: string }[]; complete: boolean };
export function orderWeight(lines: OrderLine[], cat: Catalog): WeightResult {
  let knownKg = 0;
  const unknown: WeightResult["unknown"] = [];
  for (const l of lines) {
    const it = cat.items.get(l.sku);
    if (!it) unknown.push({ sku: l.sku, reason: "מק״ט לא בקטלוג" });
    else if (it.conflict) unknown.push({ sku: l.sku, reason: "מק״ט כפול סותר בטאב" });
    else if (it.weightStatus === "unknown") unknown.push({ sku: l.sku, reason: "משקל חסר או לא מאומת" });
    else if (it.weightKg !== null) knownKg += it.weightKg * l.qty;
  }
  return { knownKg, unknown, complete: unknown.length === 0 };
}

export function catalogHealth(cat: Catalog) {
  const all = [...cat.items.values()];
  return {
    totalRows: cat.totalRows,
    uniqueSkus: all.length,
    conflicts: cat.conflicts.length,
    depositItemsWithoutWeight: all.filter((i) => i.depositKind && !i.isDepositSku && i.weightStatus === "unknown").length,
    depositItemsWithoutPalletSize: all.filter((i) => (i.depositKind === "pallet" || i.depositKind === "blockPallet") && !i.perPallet).length,
    unverifiedDepositClassifications: all.filter((i) => !i.isDepositSku && i.depositStatus !== "verified").length,
  };
}
