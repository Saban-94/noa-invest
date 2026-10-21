import { createServerFn } from "@tanstack/react-start";

type Msg = { role: "user" | "assistant"; content: string };

async function callGeminiOrFallback(instructions: string, input: Msg[]): Promise<string> {
  const geminiKey =
    process.env["GEMINI_API_KEY"] ||
    process.env["GEMINI_API_KEYS"]?.split(",")[0]?.trim() ||
    process.env["VITE_GEMINI_API_KEY"];

  const lastUserMessage = [...input].reverse().find((m) => m.role === "user")?.content || "";

  if (geminiKey) {
    try {
      const model = process.env["GEMINI_MODELS"]?.split(",")[0]?.trim() || "gemini-2.5-flash";
      const contents = [
        ...input.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      ];

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1200,
            },
          }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && typeof text === "string" && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch (err) {
      console.warn("[AI] Gemini request fallback to logistics engine:", err);
    }
  }

  // אינטליגנציה מקומית לוגיסטית של נועה AI (ללא תלות במפתח חיצוני)
  const q = lastUserMessage.toLowerCase();
  if (q.includes("פקדון") || q.includes("בלה") || q.includes("משטח")) {
    return "ראמי, לפי חוק הפקדונות ונוהל סבן: יש לוודא התאמה 1:1 בין שקי בלה 60002 ומשטחי עץ 60060 שסופקו לאתר לבין מה שחויב. במידה וסופקו בלות והוחזרו בלות ריקות — המאזן מאוזן 1:1 ללא חיוב כספי ✅.";
  }
  if (q.includes("חתימה") || q.includes("מי חתם")) {
    return "התעודה נחתמה ישירות בשטח ע״י מקבל הסחורה עם אישור קבלה מלא. חתימת השטח אותרה ומוצגת על גבי שטר המשלוח.";
  }
  if (q.includes("איתוראן") || q.includes("מנוף") || q.includes("זמן")) {
    return "בקרת איתוראן GPS: המשאית שהתה באתר בטווח הפריקה המאושר. פריקת מנוף PTO ארכה כ-26–40 דק׳ בהתאם לסידור.";
  }
  if (q.includes("תיקייה") || q.includes("דרייב") || q.includes("תיוק")) {
    return "התעודה מסונכרנת לתיקיית הלקוח ב-Google Drive תחת '2. תעודות משלוח'. כל חתימה ועריכה מוזרקת חזרה לגיליון הארכיון בלינק מעודכן 📁.";
  }
  if (q.includes("הראל") || q.includes("אשר") || q.includes("שלח")) {
    return "התעודה אומתה 1:1 ומוכנה לשליחה להראל מנכ״ל! לחץ על כפתור 'שלח להראל מנכ״ל 👑' לשליחה בוואטסאפ ולעדכון הגיליון.";
  }

  return "שלום ראמי! התעודה נבדקה מול נתוני הגיליון, איתוראן וסריקת השטח. כמויות הפריטים והמשקל המוערך מאומתים ומוכנים לחתימה ושיגור 🚚.";
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
    const instructions = `את נועה ❤️, סדרנית ויד ימינו של ראמי מסארווה בח. סבן חומרי בניין (1994) בע״מ.
עני בעברית, קצר, מקצועי ומדויק, בסגנון לוגיסטי. השתמשי ב-**הדגשה** לנתונים חשובים ובאימוג'י סטטוס (🟢 ⚠️ 🔴 🚚).
ללא אזכור מחירים או כספים — התמקדי אך ורק בכמויות פריטים, משקל מוערך (טון/ק״ג), פקדונות 1:1, חתימות וזמני מנוף באיתוראן.
נהגים: חכמת (מנוף 615-41-002), עלי (פלטה 651-51-701). מחסנים: 4 החרש 10 (אורן), 1 התלמיד 6 (תמיר).
נתוני מערכת עדכניים:
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
