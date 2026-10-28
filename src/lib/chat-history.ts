/**
 * chat-history.ts — שמירה ושחזור שיחות צ׳אט מקומי (localStorage)
 */
export type StoredChatMessage = {
  id: string;
  sender: "noa" | "user";
  text: string;
  time: string;
  statusTag?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: StoredChatMessage[];
  lastCustomer?: string;
  lastAddress?: string;
  lastNoteId?: string;
};

const KEY = "noa-chat-sessions-v1";
const MAX_SESSIONS = 30;
const MAX_MESSAGES = 80;

export function loadChatSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChatSessions(sessions: ChatSession[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch (e) {
    console.warn("[chat-history] save failed", e);
  }
}

export function upsertChatSession(
  sessions: ChatSession[],
  session: ChatSession,
): ChatSession[] {
  const trimmed: ChatSession = {
    ...session,
    messages: session.messages.slice(-MAX_MESSAGES),
    updatedAt: new Date().toISOString(),
  };
  const rest = sessions.filter((s) => s.id !== trimmed.id);
  return [trimmed, ...rest].slice(0, MAX_SESSIONS);
}

export function sessionTitleFromMessages(
  messages: { sender: string; text: string }[],
  fallback = "שיחה חדשה",
): string {
  const firstUser = messages.find((m) => m.sender === "user");
  if (!firstUser?.text) return fallback;
  const t = firstUser.text.trim().replace(/\s+/g, " ");
  return t.length > 42 ? t.slice(0, 40) + "…" : t;
}
