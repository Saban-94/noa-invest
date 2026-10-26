import { createServerFn } from "@tanstack/react-start";

type Msg = { role: "user" | "assistant"; content: string };

async function callGeminiOrFallback(instructions: string, input: Msg[]): Promise<string> {
  const geminiKey =
    process.env["GEMINI_API_KEY"] ||
    process.env["GEMINI_API_KEYS"]?.split(",")[0]?.trim();

  if (!geminiKey) {
    throw new Error("שירות הבינה אינו מוגדר בשרת: חסר GEMINI_API_KEY");
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
      },
    );
  } catch {
    throw new Error("שירות הבינה אינו זמין כרגע; לא נוצר מענה חלופי");
  }

  if (!res.ok) {
    throw new Error(`שירות הבינה החזיר שגיאה (${res.status}); לא נוצר מענה חלופי`);
  }

  const data = await res.json();
  const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof responseText !== "string" || !responseText.trim()) {
    throw new Error("שירות הבינה לא החזיר תשובה תקינה");
  }
  return responseText.trim();
}

export const askNoa = createServerFn({ method: "POST" })
  .inputValidator((d: { messages: Msg[]; context: string }) => {
    if (!Array.isArray(d.messages) || d.messages.length > 40) throw new Error("bad input");
    return {
      messages: d.messages
        .slice(-20)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
      context: String(d.context).slice(0, 12000),
    };
  })
  .handler(async ({ data }) => {
    while (data.messages[0]?.role === "assistant") data.messages.shift();
    const latestQuestion = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const asksCurrentGps =
      /(?:מיקום|איפה|היכן).{0,45}(?:משאית|רכב).{0,45}(?:כרגע|עכשיו|נוכחי|gps|איתוראן)?|(?:gps|איתוראן).{0,45}(?:מיקום|משאית|כרגע|עכשיו)|(?:משאית|רכב).{0,45}(?:מיקום|gps).{0,45}(?:כרגע|עכשיו)/i.test(latestQuestion);
    if (asksCurrentGps) {
      return { text: "אין לי כרגע מיקום GPS חי ומאומת של המשאית. ההקשר שמועבר אליי אינו כולל נתון מיקום חי עם מזהה רכב וזמן עדכון, ולכן איני יכולה לקבוע היכן המשאית נמצאת או לאשר שאיתוראן מחובר." };
    }

    const instructions = `את נועה, עוזרת לוגיסטית של ח. סבן. עני בעברית, בקצרה ובמקצועיות.
כללי אמינות מחייבים:
- השתמשי רק בעובדות שמופיעות במפורש בהקשר הנתונים (JSON) ובהודעות השיחה.
- אין להמציא נהגים, מספרי רכב, תעודות, כמויות, כתובות, זמני GPS/PTO, חתימות, אישורים, סנכרון או פעולות שבוצעו.
- בשאלות על מיקום נוכחי, GPS או איתוראן, נדרש נתון חי עם מזהה רכב וזמן עדכון. אל תסיקי מיקום מהיסטוריית ביקורים או מתיאור המערכת.
- אם constraints.noLiveGps=true או notesSource אינו live — אמרי במפורש שאין נתון מאומת; אל תשלים מזיכרון מודל.
- אם constraints.demoReportsForbidden=true — אסור להציג דוח דוגמה.
- צייני בראש התשובה בקצרה את רמת הראיה לפי evidenceLabelHe בהקשר, כשהמידע תפעולי.
- אל תטעני שבוצעה כתיבה למערכת, שליחת הודעה או אישור אלא אם כלי שרת ייעודי אישר זאת.
הקשר שהועבר בפועל מהיישום (JSON; אינו הוכחה לחיבור למערכת חיצונית):
${data.context}`;
    return { text: await callGeminiOrFallback(instructions, data.messages) };
  });

export const polishNote = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; who: string }) => ({
    text: String(d.text).slice(0, 2000),
    who: String(d.who).slice(0, 40),
  }))
  .handler(async ({ data }) => {
    const instructions = `נסח מחדש את ההערה הבאה של ${data.who} בעברית לוגיסטית-משפטית מלוטשת, תמציתית (עד 2 משפטים), לצורך רישום שטר משלוח ואימות פריטים ומשקל. ללא שום אזכור מחירים או כספים. החזר רק את הנוסח.`;
    return {
      text: await callGeminiOrFallback(instructions, [{ role: "user", content: data.text }]),
    };
  });
