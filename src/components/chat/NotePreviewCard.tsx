/**
 * NotePreviewCard — כרטיס תעודה בצ׳אט עם תצוגה מקדימה מ-Drive
 * מקורות: fileId מ-getNotes (מחילוץ HYPERLINK בגיליון) או driveUrl
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, FileText, Loader2, Maximize2, PenTool, X } from "lucide-react";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";

export type NoteCardData = {
  noteId: string;
  customer: string;
  address?: string;
  date?: string;
  driver?: string;
  fileId?: string;
  driveUrl?: string;
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

export function driveThumbUrl(fileId: string, size = 800) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

export function drivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function driveViewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function NotePreviewCard({ card }: { card: NoteCardData }) {
  const [showEmbed, setShowEmbed] = useState(false);
  const fileId = card.fileId || extractFileId(card.driveUrl);
  const viewUrl = fileId ? driveViewUrl(fileId) : card.driveUrl;
  const previewUrl = fileId ? drivePreviewUrl(fileId) : card.driveUrl;
  const thumbUrl = fileId ? driveThumbUrl(fileId) : undefined;

  // טעינה מאומתת דרך Apps Script (עדיף כשהקובץ לא ציבורי)
  const { data: scanSrc, isLoading: scanLoading, isError } = useQuery({
    queryKey: ["chat-note-scan", fileId],
    enabled: !!fileId,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: fileId! } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  const imageSrc = scanSrc || thumbUrl;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-black/20 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      {/* כותרת */}
      <div className="flex items-start justify-between gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-300">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">ת.מ. {card.noteId}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-400">
            {card.customer}
            {card.date ? ` · ${card.date}` : ""}
          </div>
          {(card.address || card.driver) && (
            <div className="mt-0.5 truncate text-[10px] text-slate-500">
              {[card.address, card.driver].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* תצוגה מקדימה */}
      <div className="relative bg-[#0a1219]">
        {imageSrc ? (
          <button
            type="button"
            onClick={() => setShowEmbed(true)}
            className="group relative block w-full overflow-hidden"
            title="הגדל תצוגה מקדימה"
          >
            <img
              src={imageSrc}
              alt={`סריקת תעודה ${card.noteId}`}
              className="max-h-52 w-full object-cover object-top transition group-hover:opacity-95"
            />
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
              <Maximize2 className="h-3 w-3" />
              תצוגה מקדימה
            </span>
          </button>
        ) : scanLoading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            טוען סריקה מ-Drive…
          </div>
        ) : (
          <div className="flex h-24 flex-col items-center justify-center gap-1 text-xs text-slate-500">
            <FileText className="h-6 w-6 opacity-40" />
            {isError ? "לא ניתן לטעון סריקה (הרשאות / getFile)" : "אין fileId לתצוגה מקדימה"}
          </div>
        )}
      </div>

      {/* כפתורים */}
      <div className="flex flex-wrap gap-1.5 p-2.5">
        {previewUrl && (
          <button
            type="button"
            onClick={() => setShowEmbed(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <Maximize2 className="h-3 w-3" />
            תצוגה מקדימה
          </button>
        )}
        <a
          href={`/canvas?note=${encodeURIComponent(card.noteId)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
        >
          <PenTool className="h-3 w-3" />
          פתח בקנבס
        </a>
        {viewUrl && (
          <a
            href={viewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
          >
            <ExternalLink className="h-3 w-3" />
            Drive
          </a>
        )}
      </div>

      {/* מודל iframe / תמונה מוגדלת */}
      {showEmbed && (previewUrl || imageSrc) && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowEmbed(false)}
          role="dialog"
          aria-modal
        >
          <div
            className="relative flex h-[min(90vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0c1722] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-bold text-white">
                ת.מ. {card.noteId} · {card.customer}
              </span>
              <button
                type="button"
                onClick={() => setShowEmbed(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-black">
              {fileId ? (
                <iframe
                  title={`preview-${card.noteId}`}
                  src={drivePreviewUrl(fileId)}
                  className="h-full w-full border-0"
                  allow="autoplay"
                />
              ) : imageSrc ? (
                <img src={imageSrc} alt="" className="h-full w-full object-contain" />
              ) : null}
            </div>
            <div className="flex gap-2 border-t border-white/10 p-3">
              <a
                href={`/canvas?note=${encodeURIComponent(card.noteId)}`}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-[#04130d]"
                onClick={() => setShowEmbed(false)}
              >
                פתח בקנבס לעריכה
              </a>
              {viewUrl && (
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200"
                >
                  פתח ב-Drive
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
