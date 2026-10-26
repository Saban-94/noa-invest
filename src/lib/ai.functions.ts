import { createServerFn } from "@tanstack/react-start";

type Msg = { role: "user" | "assistant"; content: string };

async function callGemini(instructions: string, input: Msg[]): Promise<string> {
  // API keys must remain server-only. Never read VITE_* keys here.
  const geminiKey =
    process.env["GEMINI_API_KEY"] ||
    process.env["GEMINI_API_KEYS"]?.split(",")[0]?.trim();

  if (!geminiKey) {
    throw new Error("שירות ה-AI אינו מוגדר בשרת. יש להגדיר GEMINI_API_KEY בסביבת השרת.");
  }

  const model = process.env["GEMINI_MODELS"]?.split(",")[0]?.trim() || "gemini-2.5-flash";
  const contents = input.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new Error("לא ניתן להגיע לשירות ה-AI כרגע. נסה שוב מאוחר יותר.");
  }

  if (!res.ok) {
    console.error("[AI] Gemini request failed with HTTP", res.status);
    throw new Error("שירות ה-AI החזיר שגיאה. הנתונים לא אומתו ולא נוצר מענה.");
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("שירות ה-AI לא החזיר תשובה תקינה.");
  }
  return text.trim();
}

export const askNoa = createServerFn({ method: "POST" })
  .inputValidator((d: { messages: Msg[]; context: string }) => {
    if (!Array.isArray(d?.messages) || d.messages.length === 0 || d.messages.length > 40) {
      throw new Error("נדרשת היסטוריית שיחה תקינה");
    }
    const messages = d.messages.slice(-20).map((m) => {
      if (m?.role !== "user" && m?.role !== "assistant") throw new Error("תפקיד הודעה לא תקין");
      return { role: m.role, content: String(m.content ?? "").slice(0, 4000) };
    });
    if (!messages.some((m) => m.role === "user")) throw new Error("חסרה הודעת משתמש");
    return { messages, context: String(d.context ?? "").slice(0, 12000) };
  })
  .handler(async ({ data }) => {
    const instructions = `את נועה, עוזרת לוגיסטית של ח. סבן. עני בעברית, בקצרה ובמקצועיות.
כללי אמינות מחייבים:
- השתמשי רק בעובדות שמופיעות במפורש בהקשר הנתונים ובהודעות השיחה.
- אין להמציא נהגים, מספרי רכב, תעודות, כמויות, כתובות, זמני GPS/PTO, חתימות, אישורים, סנכרון או פעולות שבוצעו.
- אם המידע חסר, לא זמין או לא ניתן לאימות, אמרי זאת במפורש ובקשי את הנתון או מקור המידע הדרוש.
- הפרידי בין נתון מקור, חישוב, השערה והמלצה. אל תציגי השערה כאימות.
- אל תטעני שבוצעה כתיבה למערכת, שליחת הודעה או אישור אלא אם הפעולה אושרה במפורש על ידי כלי שרת ייעודי.
- ההקשר עשוי להיות ריק או חלקי; במקרה כזה הסבירי את המגבלה במקום להשלים פרטים.
הקשר זמין מהיישום (JSON):
${data.context}`;
    return { text: await callGemini(instructions, data.messages) };
  });

export const polishNote = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; who: string }) => ({
    text: String(d?.text ?? "").slice(0, 2000),
    who: String(d?.who ?? "").slice(0, 40),
  }))
  .handler(async ({ data }) => {
    const instructions = `נסחי מחדש את ההערה הבאה של ${data.who} בעברית מקצועית ותמציתית (עד 2 משפטים). אל תוסיפי עובדות שלא מופיעות בטקסט. החזירי רק את הנוסח.`;
    return {
      text: await callGemini(instructions, [{ role: "user", content: data.text }]),
    };
  });
