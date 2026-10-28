/**
 * ChatContextPanel — פאנל צד בצ׳אט:
 * כרטיס לקוח · טבלת תעודות · תצוגת סריקה און־ליין · קישור לקנבס
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Maximize2,
  PenTool,
  X,
  Table2,
} from "lucide-react";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import type { DeliveryNote } from "@/lib/data";
import { noteItemsCount, noteWeightTons } from "@/lib/data";

export type ContextPanelSelection = {
  noteId?: string;
  customer?: string;
  address?: string;
};

type Props = {
  notes: DeliveryNote[];
  selection: ContextPanelSelection | null;
  onSelectNote: (noteId: string) => void;
  onClose?: () => void;
};

function extractFileId(urlOrId?: string): string | undefined {
  if (!urlOrId) return undefined;
  const m =
    urlOrId.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
    urlOrId.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(urlOrId.trim())) return urlOrId.trim();
  return undefined;
}

export function ChatContextPanel({ notes, selection, onSelectNote, onClose }: Props) {
  const [tab, setTab] = useState<"card" | "table" | "scan">("card");
  const [embedOpen, setEmbedOpen] = useState(false);

  const relatedNotes = useMemo(() => {
    if (!selection) return [];
    let list = notes;
    if (selection.customer) {
      const c = selection.customer.toLowerCase();
      list = list.filter((n) => (n.customer || "").toLowerCase().includes(c));
    } else if (selection.address) {
      const a = selection.address.toLowerCase();
      list = list.filter((n) => (n.siteAddress || "").toLowerCase().includes(a));
    } else if (selection.noteId) {
      const one = notes.find((n) => n.id === selection.noteId);
      if (one?.customer) {
        const c = one.customer.toLowerCase();
        list = notes.filter((n) => (n.customer || "").toLowerCase().includes(c));
      } else if (one) {
        list = [one];
      }
    }
    return list.slice(0, 40);
  }, [notes, selection]);

  const activeNote =
    notes.find((n) => n.id === selection?.noteId) || relatedNotes[0] || null;

  const customerName =
    selection?.customer || activeNote?.customer || relatedNotes[0]?.customer || "—";
  const customerNo = activeNote?.customerNo || relatedNotes[0]?.customerNo || "";
  const address =
    selection?.address || activeNote?.siteAddress || relatedNotes[0]?.siteAddress || "";

  const fileId =
    activeNote?.fileId ||
    extractFileId(activeNote?.driveUrl) ||
    extractFileId(activeNote?.signedUrl);

  const { data: scanSrc, isLoading: scanLoading } = useQuery({
    queryKey: ["context-scan", fileId],
    enabled: !!fileId && (tab === "scan" || embedOpen),
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: fileId! } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  const thumbUrl = fileId
    ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
    : undefined;
  const previewUrl = fileId
    ? `https://drive.google.com/file/d/${fileId}/preview`
    : undefined;
  const viewUrl = fileId
    ? `https://drive.google.com/file/d/${fileId}/view`
    : activeNote?.driveUrl;

  const totalTons = relatedNotes.reduce((s, n) => s + noteWeightTons(n), 0);
  const totalItems = relatedNotes.reduce((s, n) => s + noteItemsCount(n), 0);

  if (!selection) {
    return (
      <div
        className="flex h-full min-h-0 flex-col items-center justify-center gap-2 border border-dashed border-[#223246] bg-[#0e1620] p-6 text-center text-xs text-slate-500"
        dir="rtl"
      >
        <FileText className="h-8 w-8 opacity-30" />
        <p>בחרו תעודה או לקוח בצ׳אט</p>
        <p className="text-[10px] text-slate-600">הפאנל יציג כרטיס, טבלה וסריקה</p>
      </div>
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#223246] bg-[#0e1620] text-slate-100"
      dir="rtl"
      aria-label="פאנל הקשר — לקוח ותעודה"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#223246] p-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Building2 className="h-4 w-4 text-sky-400" />
            הקשר לקוח ותעודה
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {customerName}
            {customerNo ? ` · ${customerNo}` : ""}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#223246] hover:text-white"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* כרטיס לקוח מקוצר תמיד גלוי */}
      <div className="border-b border-[#223246] bg-gradient-to-l from-sky-500/10 to-transparent p-3">
        <div className="text-sm font-bold text-white">{customerName}</div>
        {address && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{address}</span>
          </div>
        )}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-1 py-1.5">
            <div className="text-slate-500">תעודות</div>
            <div className="text-sm font-bold text-emerald-300">{relatedNotes.length}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-1 py-1.5">
            <div className="text-slate-500">פריטים</div>
            <div className="text-sm font-bold text-sky-300">{totalItems}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-1 py-1.5">
            <div className="text-slate-500">טון</div>
            <div className="text-sm font-bold text-amber-300">{totalTons.toFixed(1)}</div>
          </div>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-[#223246] p-2">
        {(
          [
            ["card", "כרטיס", FileText],
            ["table", "טבלה", Table2],
            ["scan", "סריקה", Maximize2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
              tab === id ? "bg-emerald-600 text-white" : "bg-[#172230] text-slate-300 hover:bg-[#1c2a3a]"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        {tab === "card" && activeNote && (
          <div className="space-y-3">
            <article className="rounded-xl border border-[#223246] bg-[#121a24] p-3">
              <div className="text-sm font-bold text-emerald-300">ת.מ. {activeNote.id}</div>
              <div className="mt-1 text-slate-400">{activeNote.date || "—"}</div>
              <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                <div>נהג: {activeNote.driver || "—"}</div>
                <div>כתובת: {activeNote.siteAddress || "—"}</div>
                <div>
                  פריטים: {noteItemsCount(activeNote)} · משקל:{" "}
                  {noteWeightTons(activeNote).toFixed(1)} טון
                </div>
                <div>מנוף: {activeNote.craneTime || "לא נרשם"}</div>
                <div>חתימה: {activeNote.signedBy || "—"}</div>
              </div>
            </article>
            {thumbUrl && (
              <button
                type="button"
                onClick={() => {
                  setTab("scan");
                  setEmbedOpen(true);
                }}
                className="block w-full overflow-hidden rounded-xl border border-white/10"
              >
                <img
                  src={scanSrc || thumbUrl}
                  alt=""
                  className="max-h-40 w-full object-cover object-top"
                />
              </button>
            )}
            <div className="flex flex-wrap gap-1.5">
              <a
                href={`/canvas?note=${encodeURIComponent(activeNote.id)}`}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300"
              >
                <PenTool className="h-3 w-3" />
                קנבס
              </a>
              {viewUrl && (
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300"
                >
                  <ExternalLink className="h-3 w-3" />
                  Drive
                </a>
              )}
            </div>
          </div>
        )}

        {tab === "table" && (
          <div className="overflow-x-auto rounded-xl border border-[#223246]">
            <table className="w-full min-w-[280px] text-right text-[11px]">
              <thead className="bg-[#172230] text-slate-400">
                <tr>
                  <th className="px-2 py-2 font-semibold">ת.מ.</th>
                  <th className="px-2 py-2 font-semibold">תאריך</th>
                  <th className="px-2 py-2 font-semibold">מנוף</th>
                </tr>
              </thead>
              <tbody>
                {relatedNotes.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => onSelectNote(n.id)}
                    className={`cursor-pointer border-t border-[#223246] transition hover:bg-emerald-500/10 ${
                      n.id === activeNote?.id ? "bg-emerald-500/15" : ""
                    }`}
                  >
                    <td className="px-2 py-2 font-mono font-bold text-emerald-300">{n.id}</td>
                    <td className="px-2 py-2 text-slate-300">{n.date || "—"}</td>
                    <td className="px-2 py-2 text-slate-400">{n.craneTime || "—"}</td>
                  </tr>
                ))}
                {relatedNotes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-slate-500">
                      אין תעודות לסינון
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "scan" && (
          <div className="space-y-2">
            {scanLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                טוען סריקה…
              </div>
            )}
            {!scanLoading && (scanSrc || thumbUrl) && (
              <button type="button" onClick={() => setEmbedOpen(true)} className="block w-full">
                <img
                  src={scanSrc || thumbUrl}
                  alt={`תעודה ${activeNote?.id}`}
                  className="max-h-72 w-full rounded-xl border border-white/10 object-contain object-top"
                />
              </button>
            )}
            {!scanLoading && !scanSrc && !thumbUrl && (
              <p className="rounded-lg border border-dashed border-[#223246] p-4 text-slate-500">
                אין fileId / קישור Drive לתעודה זו
              </p>
            )}
            {previewUrl && (
              <button
                type="button"
                onClick={() => setEmbedOpen(true)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 text-[11px] font-semibold text-slate-200"
              >
                תצוגה מקדימה מלאה (Drive)
              </button>
            )}
          </div>
        )}
      </div>

      {embedOpen && (previewUrl || scanSrc) && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setEmbedOpen(false)}
          role="dialog"
          aria-modal
        >
          <div
            className="relative flex h-[min(90vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c1722]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-bold">
                ת.מ. {activeNote?.id} · {customerName}
              </span>
              <button
                type="button"
                onClick={() => setEmbedOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-black">
              {fileId ? (
                <iframe
                  title="note-preview"
                  src={`https://drive.google.com/file/d/${fileId}/preview`}
                  className="h-full w-full border-0"
                />
              ) : scanSrc ? (
                <img src={scanSrc} alt="" className="h-full w-full object-contain" />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
