import { createServerFn } from "@tanstack/react-start";
import { gasGet } from "./notes-api.functions";
import { buildCatalog, catalogHealth, type RawCatalogRow } from "./catalog";

const TTL_MS = 5 * 60_000;
let cache: { at: number; rows: RawCatalogRow[] } | null = null;

async function loadRows(force = false): Promise<RawCatalogRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const data = await gasGet({ action: "getCatalog" });
  if (!Array.isArray(data.rows)) throw new Error("getCatalog לא החזיר רשימת שורות");
  const rows = data.rows as RawCatalogRow[];
  cache = { at: Date.now(), rows };
  return rows;
}

/** שגיאה אמיתית אם הפעולה אינה זמינה; אין נפילה לנתונים מנוחשים. */
export const catalogHealthFn = createServerFn({ method: "POST" }).handler(async () => {
  const rows = await loadRows(true);
  return catalogHealth(buildCatalog(rows));
});
