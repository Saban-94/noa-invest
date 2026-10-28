/**
 * ChatHistoryDrawer — רשימת שיחות ללחיצה ושחזור
 */
import { History, Trash2, MessageSquare } from "lucide-react";
import type { ChatSession } from "@/lib/chat-history";

type Props = {
  open: boolean;
  sessions: ChatSession[];
  activeId?: string;
  onClose: () => void;
  onSelect: (session: ChatSession) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
};

export function ChatHistoryDrawer({
  open,
  sessions,
  activeId,
  onClose,
  onSelect,
  onDelete,
  onNew,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" dir="rtl">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="סגור היסטוריה"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-sm flex-col border-r border-white/10 bg-[#0c1722] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <History className="h-4 w-4 text-violet-400" />
            היסטוריית שיחות
          </div>
          <button
            type="button"
            onClick={onNew}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300"
          >
            שיחה חדשה
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {sessions.length === 0 && (
            <p className="p-4 text-center text-xs text-slate-500">אין שיחות שמורות עדיין</p>
          )}
          {sessions.map((s) => {
            const when = new Date(s.updatedAt).toLocaleString("he-IL", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            const active = s.id === activeId;
            return (
              <div
                key={s.id}
                className={`group mb-1 flex items-start gap-2 rounded-xl border p-3 transition ${
                  active
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-transparent bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]"
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-right"
                  onClick={() => onSelect(s)}
                >
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-100">
                    <MessageSquare className="h-3 w-3 shrink-0 text-slate-500" />
                    <span className="truncate">{s.title}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{when}</div>
                  {s.lastCustomer && (
                    <div className="mt-0.5 truncate text-[10px] text-slate-400">
                      {s.lastCustomer}
                      {s.lastNoteId ? ` · ת.מ. ${s.lastNoteId}` : ""}
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  title="מחק"
                  onClick={() => onDelete(s.id)}
                  className="rounded-lg p-1.5 text-slate-600 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
