/**
 * מודל workflow בירור תעודות — ראמי ↔ הראל + משימות + שרשור
 */

export type InquiryStatus =
  | "pending_rami"
  | "pending_harel"
  | "returned_to_rami"
  | "approved"
  | "rejected";

export type MessageRole = "system" | "ai" | "rami" | "harel";

export type MessageAction =
  | "opened"
  | "replied"
  | "approved"
  | "rejected"
  | "returned_to_rami"
  | "nudge"
  | "file_uploaded"
  | "annotation_saved";

export type InquiryAttachment = {
  type: "scan" | "annotation" | "link" | "upload";
  url: string;
  label?: string;
  fileId?: string;
};

export type InquiryMessage = {
  id: string;
  role: MessageRole;
  text: string;
  at: string;
  action?: MessageAction;
  attachments?: InquiryAttachment[];
  /** Stable id of the message this reply addresses, when applicable. */
  replyToId?: string;
};

export type InquiryTask = {
  id: string;
  inquiryId: string;
  noteId: string;
  status: "open" | "done" | "cancelled";
  assignedTo: "rami";
  createdBy: "harel";
  reason: string;
  dueAt: string;
  nudgeEveryMin: number;
  lastNudgeAt?: string;
  nudgeCount: number;
  canvasAnnotationUrl?: string;
  sourceFileId?: string;
  createdAt: string;
};

export type WorkroomInquiry = {
  id: string;
  docNumber: string;
  customer: string;
  customerNo?: string;
  address?: string;
  driver?: string;
  status: InquiryStatus;
  issue: string;
  aiAnalysis: string;
  kind: "return" | "crane" | "damaged" | "other";
  thread: InquiryMessage[];
  task?: InquiryTask | null;
  scanFileId?: string;
  driveUrl?: string;
  updatedAt: string;
};

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  pending_rami: "ממתין לראמי",
  pending_harel: "ממתין להראל",
  returned_to_rami: "הוחזר לראמי",
  approved: "אושר",
  rejected: "נדחה",
};

export function newMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatHe(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
  } catch {
    return iso;
  }
}

/** יעד ברירת מחדל: +4 שעות */
export function defaultDueAt(hours = 4): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export function isOverdue(task?: InquiryTask | null): boolean {
  if (!task || task.status !== "open") return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

export function minutesUntilDue(task?: InquiryTask | null): number | null {
  if (!task || task.status !== "open") return null;
  return Math.round((new Date(task.dueAt).getTime() - Date.now()) / 60_000);
}

export function appendMessage(
  thread: InquiryMessage[],
  partial: Omit<InquiryMessage, "id" | "at"> & { at?: string; id?: string },
): InquiryMessage[] {
  const msg: InquiryMessage = {
    id: partial.id || newMessageId(),
    at: partial.at || nowIso(),
    role: partial.role,
    text: partial.text,
    action: partial.action,
    attachments: partial.attachments,
  };
  return [...thread, msg];
}

export function classifyKind(issue: string, ai: string): WorkroomInquiry["kind"] {
  const t = `${issue} ${ai}`;
  if (/הוחזר|החזר|הוחלף|החלפ|זיכוי/.test(t)) return "return";
  if (/מנוף|פריקה|המתנה/.test(t)) {
    const mins = [...t.matchAll(/(\d{2,3})\s*דק/g)].map((m) => Number(m[1]));
    if (mins.some((m) => m > 45) || /חריג/.test(t)) return "crane";
  }
  if (/דהוי|חסר מספר|ללא מספר|לא קריא|פגום/.test(t)) return "damaged";
  return "other";
}

/** מיפוי סטטוס מגיליון / מחרוזת קיימת */
export function parseSheetStatus(raw: string): InquiryStatus {
  const s = String(raw || "");
  if (/אושר|approved/i.test(s)) return "approved";
  if (/נדחה|reject/i.test(s)) return "rejected";
  if (/הוחזר|returned/i.test(s)) return "returned_to_rami";
  if (/הראל|pending_harel|ממתין לאישור/i.test(s)) return "pending_harel";
  return "pending_rami";
}
