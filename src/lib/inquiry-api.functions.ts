import { createServerFn } from "@tanstack/react-start";
import { approvalFn } from "./notes-api.functions";

export const postThreadMessageFn = createServerFn({ method: "POST" })
  .inputValidator((d: { noteId: string; sender: "rami" | "harel"; message: string }) => {
    if (!String(d?.noteId || "")) throw new Error("חסר מספר תעודה");
    if (d.sender !== "rami" && d.sender !== "harel") throw new Error("sender לא תקין");
    if (!String(d?.message || "")) throw new Error("חסר תוכן הודעה");
    
    // ניקוי HTML בסיסי (DOMPurify מומלץ בצד לקוח, כאן נבצע ניקוי מחמיר)
    const sanitized = String(d.message)
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
      .slice(0, 8000);
      
    return {
      noteId: String(d.noteId),
      sender: d.sender,
      message: sanitized,
    };
  })
  .handler(async ({ data }) => {
    // קריאה ל-GAS לשמירת ההודעה בטאב בירור_ראמי
    await approvalFn({ data: { noteId: data.noteId, approver: data.sender, note: `[בירור]: ${data.message}` } });
    return { success: true as const };
  });
