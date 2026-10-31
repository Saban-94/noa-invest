/**
 * NoaMessageBody — מענה מקצועי בצ׳אט:
 * עברית מסודרת, כותרות בולטות, טבלאות מודרניות, בלי סימני markdown.
 * ללא תלות ב-GAS.
 */
import { Fragment } from "react";

function cleanText(raw: string): string {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/[*_#`]+/g, "")
    .replace(/\u200f|\u200e/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikePipeTable(block: string): boolean {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const pipe = lines.filter((l) => (l.match(/\|/g) || []).length >= 2);
  return pipe.length >= 2 && pipe.length >= lines.length * 0.6;
}

function looksLikeKvList(block: string): boolean {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const kv = lines.filter((l) => /[:：]/.test(l) && l.length < 120);
  return kv.length >= 2 && kv.length >= lines.length * 0.7;
}

function parsePipeTable(block: string): { headers: string[]; rows: string[][] } | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?\s*-{2,}/.test(l.replace(/\|/g, "")));
  if (lines.length < 2) return null;
  const split = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split).filter((r) => r.some(Boolean));
  if (!headers.length || !rows.length) return null;
  return { headers, rows };
}

function parseKvRows(block: string): { headers: string[]; rows: string[][] } {
  const rows = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.+?)\s*[:：]\s*(.+)$/);
      if (!m) return [l, ""];
      return [m[1].trim(), m[2].trim()];
    });
  return { headers: ["שדה", "ערך"], rows };
}

const HEADER_COLORS = [
  "from-emerald-500/20 to-teal-500/10 text-emerald-300 border-emerald-400/30",
  "from-sky-500/20 to-blue-500/10 text-sky-300 border-sky-400/30",
  "from-violet-500/20 to-purple-500/10 text-violet-300 border-violet-400/30",
  "from-amber-500/20 to-orange-500/10 text-amber-200 border-amber-400/30",
  "from-rose-500/15 to-pink-500/10 text-rose-200 border-rose-400/25",
];

function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 56) return false;
  if (/[.!?。]$/.test(t)) return false;
  if (/^\d+[.)]\s/.test(t)) return false;
  if ((t.match(/,/g) || []).length > 2) return false;
  return true;
}

function ModernTable({
  headers,
  rows,
  light,
}: {
  headers: string[];
  rows: string[][];
  light?: boolean;
}) {
  return (
    <div
      className={`my-3 overflow-hidden rounded-2xl border shadow-sm ${
        light
          ? "border-slate-200 bg-white"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[240px] border-collapse text-right text-sm sm:text-base">
          <thead>
            <tr
              className={
                light
                  ? "bg-slate-100 text-slate-700"
                  : "bg-gradient-to-l from-emerald-500/15 to-sky-500/10 text-emerald-100"
              }
            >
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap px-3 py-2.5 text-xs font-bold sm:px-4 sm:text-sm"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={
                  light
                    ? ri % 2 === 0
                      ? "bg-white text-slate-800"
                      : "bg-slate-50 text-slate-800"
                    : ri % 2 === 0
                      ? "bg-white/[0.02] text-slate-100"
                      : "bg-white/[0.05] text-slate-100"
                }
              >
                {headers.map((_, ci) => (
                  <td
                    key={ci}
                    className="max-w-[14rem] truncate px-3 py-2.5 text-sm leading-6 sm:max-w-xs sm:px-4 sm:text-[15px]"
                    title={row[ci] || ""}
                  >
                    {row[ci] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NoaMessageBody({
  text,
  variant = "dark",
}: {
  text: string;
  variant?: "dark" | "light";
}) {
  const light = variant === "light";
  const cleaned = cleanText(text);
  const blocks = cleaned.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  let headerIdx = 0;

  return (
    <div
      className={`space-y-3 sm:space-y-4 ${
        light
          ? "text-base leading-7 text-slate-800 sm:text-[17px] sm:leading-8"
          : "text-[15px] leading-7 text-slate-100 sm:text-base sm:leading-8"
      }`}
      dir="rtl"
    >
      {blocks.map((block, bi) => {
        if (looksLikePipeTable(block)) {
          const t = parsePipeTable(block);
          if (t) return <ModernTable key={bi} headers={t.headers} rows={t.rows} light={light} />;
        }
        if (looksLikeKvList(block)) {
          const t = parseKvRows(block);
          return <ModernTable key={bi} headers={t.headers} rows={t.rows} light={light} />;
        }

        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

        if (lines.length === 1 && isHeading(lines[0])) {
          const color = HEADER_COLORS[headerIdx++ % HEADER_COLORS.length];
          return (
            <div
              key={bi}
              className={`rounded-xl border bg-gradient-to-l px-3 py-2 text-base font-extrabold tracking-tight sm:text-lg ${color}`}
            >
              {lines[0]}
            </div>
          );
        }

        const listLike = lines.every(
          (l) => /^[-•–]\s+/.test(l) || /^\d+[.)]\s+/.test(l),
        );
        if (listLike && lines.length >= 2) {
          return (
            <ul key={bi} className="space-y-2">
              {lines.map((l, i) => {
                const body = l.replace(/^[-•–]\s+/, "").replace(/^\d+[.)]\s+/, "");
                return (
                  <li
                    key={i}
                    className={`flex gap-2 rounded-xl px-3 py-2 ${
                      light
                        ? "bg-slate-50 text-slate-800"
                        : "bg-white/[0.04] text-slate-100"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        light
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-7">{body}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <div key={bi} className="space-y-2">
            {lines.map((line, li) => {
              if (isHeading(line) && lines.length > 1 && li === 0) {
                const color = HEADER_COLORS[headerIdx++ % HEADER_COLORS.length];
                return (
                  <div
                    key={li}
                    className={`rounded-xl border bg-gradient-to-l px-3 py-2 text-base font-extrabold sm:text-lg ${color}`}
                  >
                    {line}
                  </div>
                );
              }
              return (
                <p key={li} className="leading-7 sm:leading-8">
                  {line}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export const NOA_PROSE_HINT = `
כתבי בעברית מלאה ומקצועית. משפטים שלמים וסדר ברור.
אל תשתמשי בסימני markdown: לא כוכביות, לא סולמיות, לא קו תחתון.
הפרידי נושאים בבלוקים עם שורה ריקה וכותרת קצרה בעברית.
כשיש השוואה או רשימת שדות, השתמשי בטבלה עם סימן | בין עמודות או בשורות "שדה: ערך".
אל תציגי מענה מפוזר. סכמי ואז פרטי.
`.trim();
