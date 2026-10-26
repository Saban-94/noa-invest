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
    while (data.messages[0]?.role === "assistant") data.messages.shift();
    if (data.messages.length === 0) throw new Error("נדרשת הודעת משתמש");

    const latestQuestion = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const asksCurrentGps = /(?:מיקום|איפה|היכן).{0,35}(?:משאית|רכב).{0,35}(?:כרגע|עכשיו|נוכחי|gps|איתוראן)?|(?:gps|איתוראן).{0,35}(?:מיקום|משאית|כרגע|עכשיו)|(?:משאית|רכב).{0,35}(?:מיקום|gps).{0,35}(?:כרגע|עכשיו)/i.test(latestQuestion);
    if (asksCurrentGps) {
      return { text: "אין לי כרגע מיקום GPS נוכחי ומאומת של המשאית. ההקשר שמועבר אליי אינו כולל מיקום חי עם זמן עדכון, ולכן איני יכולה לקבוע היכן המשאית נמצאת או לטעון שאיתוראן מחובר. כדי לבדוק זאת יש לחבר/לאמת הזנת GPS מאיתוראן ולוודא שמתקבלים מזהה רכב, קואורדינטות או כתובת וזמן עדכון." };
    }

    const asksSources = /(?:אילו|איזה|מה).{0,45}(?:נתונים|מקורות).{0,45}(?:זמינים|מקור|מחובר|כרגע)?|(?:מה מקורם|אילו נתונים זמינים)/i.test(latestQuestion);
    if (asksSources) {
      let counts = { deliveryNotes: 0, visits: 0, discs: 0, discrepancies: 0 };
      let contextParsed = false;
      try {
        const parsed = JSON.parse(data.context || "{}");
        const sourceCounts = parsed?.sourceCounts;
        if (sourceCounts && typeof sourceCounts === "object") {
          counts = {
            deliveryNotes: Number(sourceCounts.deliveryNotes) || 0,
            visits: Number(sourceCounts.visits) || 0,
            discs: Number(sourceCounts.discs) || 0,
            discrepancies: Number(sourceCounts.discrepancies) || 0,
          };
          contextParsed = true;
        }
      } catch {}
      if (!contextParsed) {
        return { text: "אין לי כרגע פירוט מאומת של מקורות הנתונים. בפרט, אין לי מיקום GPS חי מאומת. לא ניתן להסיק מכותרות המערכת או מהשיחה בלבד שמערכת חיצונית מחוברת." };
      }
      return { text: "בדיקת ההקשר שהועבר לשיחה (ספירת רשומות בלבד, לא אימות של מקור חיצוני):\n• תעודות משלוח: " + counts.deliveryNotes + "\n• ביקורים/נתוני אתר: " + counts.visits + "\n• רשומות דיסקית/טכוגרף: " + counts.discs + "\n• חריגות: " + counts.discrepancies + "\n\nחשוב: הספירות אינן מוכיחות שהנתונים עדכניים או מאומתים. אין בהקשר מיקום GPS חי עם זמן עדכון, ולכן איני יכולה לאשר שאיתוראן מחובר או למסור מיקום נוכחי. כדי לאמת מקור נדרשים סטטוס חיבור, שם/מזהה מקור וזמן העדכון האחרון." };
    }

    const instructions = `את נועה, עוזרת לוגיסטית של ח. סבן. עני בעברית, בקצרה ובמקצועיות.
כללי אמינות מחייבים:
- השתמשי רק בעובדות שמופיעות במפורש בהקשר הנתונים ובהודעות השיחה.
- אין להמציא נהגים, מספרי רכב, תעודות, כמויות, כתובות, זמני GPS/PTO, חתימות, אישורים, סנכרון או פעולות שבוצעו.
- אם המידע חסר, לא זמין או לא ניתן לאימות, אמרי זאת במפורש ובקשי את הנתון או מקור המידע הדרוש.
- בשאלות על מיקום נוכחי, GPS או איתוראן, אל תסיקי מיקום מנתוני ביקור היסטוריים או מתיאור המערכת. נדרש מיקום חי עם זמן עדכון.
- בשאלות על מקורות, הציגי רק נתונים שהועברו בפועל בהקשר והבחיני בין ספירת רשומות לבין אימות חיבור/עדכניות.
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
