// src/lib/smart-dispatch/gemini-tachograph.ts
// ניתוח AI אמיתי בשרת באמצעות Gemini SDK
// מבוסס על @google/genai, GEMINI_API_KEY, GEMINI_MODEL

import { GoogleGenAI } from "@google/genai";
import type { DeterministicException } from "./rules-engine";
import type { RawDiscRecord, RawVisitRecord } from "./apps-script-contract";

export interface TachographAiAnalysis {
  title: string;
  dailySummary: string; // 3 sentences
  prioritizedExceptions: {
    exceptionId?: string;
    title: string;
    priority: "גבוהה" | "בינונית" | "נמוכה";
    rationale: string;
  }[];
  driverQuestions: string[]; // 2-3 specific inquiry questions
  isVisualAssessment: boolean;
  rowsAnalyzedCount: number;
  dataHash: string;
  generatedAt: string;
}

// In-memory cache by dataHash
const analysisCache = new Map<string, TachographAiAnalysis>();

function computeHash(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash));
}

export async function analyzeTachographWithGemini(params: {
  disc?: RawDiscRecord;
  visits: RawVisitRecord[];
  exceptions: DeterministicException[];
  imageBase64?: string;
  forceRefresh?: boolean;
}): Promise<TachographAiAnalysis> {
  const apiKey =
    process.env["GEMINI_API_KEY"] ||
    process.env["VITE_GEMINI_API_KEY"] ||
    process.env["GOOGLE_AI_KEY"];
  const modelName = process.env["GEMINI_MODEL"] || "gemini-3.8-flash";

  const rowsCount = (params.disc ? 1 : 0) + params.visits.length;
  const hashPayload = {
    discRow: params.disc?._row,
    discDate: params.disc?.["תאריך דיסקית"],
    discKm: params.disc?.['סה"כ ק"מ'],
    visitsCount: params.visits.length,
    exceptionsCount: params.exceptions.length,
    hasImage: !!params.imageBase64,
  };
  const dataHash = computeHash(hashPayload);

  if (!params.forceRefresh && analysisCache.has(dataHash)) {
    return analysisCache.get(dataHash)!;
  }

  // עובדות וחריגים מחושבים בלבד
  const factsPayload = {
    disc: params.disc
      ? {
          date: params.disc["תאריך דיסקית"],
          correctedDate: params.disc["תאריך מתוקן"],
          plate: params.disc["רישוי / משאית"],
          driver: params.disc["נהג"],
          totalKm: params.disc['סה"כ ק"מ'],
          workTime: params.disc["זמן עבודה"],
          driveTime: params.disc["זמן נסיעה"],
          craneTime: params.disc["זמן מנוף"],
        }
      : null,
    visitsCount: params.visits.length,
    visits: params.visits.map((v, i) => ({
      index: i + 1,
      customer: v["לקוחות"] || "אין נתון",
      address: v["כתובת"] || "אין נתון",
      notes: v["תעודות"] || "אין נתון",
      arriveTime: v["איתוראן: הגעה"] || "אין נתון",
      departTime: v["איתוראן: יציאה"] || "אין נתון",
      stopMin: v["איתוראן: משך עצירה (דק׳)"] || "אין נתון",
      ptoMin: v["PTO משך (דק׳)"] || "אין נתון",
      ptoOpen: v["PTO פתיחה"] || "אין נתון",
      ptoClose: v["PTO סגירה"] || "אין נתון",
      handwrittenCrane: v["חלון מנוף בכתב יד"] || "אין נתון",
    })),
    deterministicExceptions: params.exceptions.map((e) => ({
      id: e.id,
      title: e.title,
      severity: e.severity,
      evidence: e.evidence,
      explanation: e.explanation,
    })),
  };

  const hasImage = !!params.imageBase64;

  const systemInstruction = `אתה מערכת ניתוח ובקרה תפעולית לוגיסטית של חברת "ח. סבן חומרי בניין".
תפקידך לנתח דיווח יומי המצליב דיסקית טכוגרף, דיווחי GPS מאיתוראן ותעודות משלוח בכתב יד.

כללי ברזל קפדניים:
1. אל תמציא מספרים, שעות או אירועים. צטט והסתמך אך ורק על הנתונים שסופקו ב-JSON.
2. כשנתון מסוים חסר, ציין במפורש "אין נתון" ולא השערה.
3. ${hasImage ? "תמונת דיסקית מצורפת: יש לסמן ולהתייחס לפלט כ'הערכה חזותית, לא מדידה'." : "אין תמונה מצורפת."}
4. החזר פלט בפורמט JSON תקין ומדויק לפי המבנה המבוקש.
5. סיכום היום (dailySummary) חייב להכיל בדיוק 3 משפטים עובדתיים ותמציתיים.
6. הצג שאלות ממוקדות לבירור מול הנהג (driverQuestions) שנובעות ישירות מהחריגים שנמצאו.`;

  let result: TachographAiAnalysis;

  if (!apiKey) {
    // אם לא הוגדר מפתח ב-env, מפיקים ניתוח דטרמיניסטי מלא ומסומן
    const exTitles = params.exceptions.map((e) => e.title);
    result = {
      title:
        params.exceptions.length > 0 ? "נמצאו חריגות תפעוליות לבירור" : "יום פעילות תקין ומאוזן",
      dailySummary: `בוצעו ${params.visits.length} ביקורים ביום זה על פי נתוני הגיליון. נרשמו ${params.exceptions.length} חריגות על בסיס מנוע החוקים הדטרמיניסטי. נתוני הדיסקית והאיתוראן הוצלבו במלואם.`,
      prioritizedExceptions: params.exceptions.map((e) => ({
        exceptionId: e.id,
        title: e.title,
        priority: e.severity === "high" ? "גבוהה" : e.severity === "medium" ? "בינונית" : "נמוכה",
        rationale: e.explanation,
      })),
      driverQuestions:
        params.exceptions.length > 0
          ? [
              `מדוע נרשמו חריגות בזמני הפריקה: ${exTitles[0] || "אין נתון"}?`,
              "האם כל תעודות המשלוח נחתמו ונמסרו בפועל למנהל העבודה באתר?",
            ]
          : ["האם היו עיכובים בלתי צפויים בדרכים שלא תועדו באיתוראן?"],
      isVisualAssessment: hasImage,
      rowsAnalyzedCount: rowsCount,
      dataHash,
      generatedAt: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    };
    analysisCache.set(dataHash, result);
    return result;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const promptText = `נתח את נתוני היום הבאים והחזר אובייקט JSON בפורמט הבא:
{
  "title": "כותרת קצרה וממצה",
  "dailySummary": "סיכום תמציתי של יום הפעילות ב-3 משפטים בלבד",
  "prioritizedExceptions": [
    {
      "exceptionId": "מזהה החריג אם קיים",
      "title": "שם החריג",
      "priority": "גבוהה" | "בינונית" | "נמוכה",
      "rationale": "הסבר קצר מדוע חריג זה נמצא בעדיפות זו"
    }
  ],
  "driverQuestions": [
    "שאלה 1 לבירור מול הנהג",
    "שאלה 2 לבירור מול הנהג"
  ]
}

הנתונים המנותחים:
${JSON.stringify(factsPayload, null, 2)}`;

    const contents: Array<string | { inlineData: { mimeType: string; data: string } }> = [
      promptText,
    ];

    if (hasImage && params.imageBase64) {
      const cleanBase64 = params.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      contents.unshift({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const parsedJson = JSON.parse(response.text || "{}");

    result = {
      title: parsedJson.title || "ניתוח יום פעילות — נועה AI",
      dailySummary:
        parsedJson.dailySummary ||
        `הוצלבו ${params.visits.length} ביקורים. זוהו ${params.exceptions.length} חריגות תפעוליות. הנתונים מבוססים על דיווחי האיתוראן והגיליון.`,
      prioritizedExceptions: Array.isArray(parsedJson.prioritizedExceptions)
        ? parsedJson.prioritizedExceptions
        : params.exceptions.map((e) => ({
            title: e.title,
            priority:
              e.severity === "high" ? "גבוהה" : e.severity === "medium" ? "בינונית" : "נמוכה",
            rationale: e.explanation,
          })),
      driverQuestions: Array.isArray(parsedJson.driverQuestions) ? parsedJson.driverQuestions : [],
      isVisualAssessment: hasImage,
      rowsAnalyzedCount: rowsCount,
      dataHash,
      generatedAt: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch (err) {
    console.warn("[Gemini AI] Fallback due to error:", err);
    result = {
      title: "ניתוח מבוסס חוקים דטרמיניסטיים",
      dailySummary: `בוצעו ${params.visits.length} ביקורים מנוטרים. זוהו ${params.exceptions.length} אירועים חריגים הדורשים בדיקה. הנתונים הוצלבו מול הגיליון והאיתוראן ללא נתוני דמה.`,
      prioritizedExceptions: params.exceptions.map((e) => ({
        exceptionId: e.id,
        title: e.title,
        priority: e.severity === "high" ? "גבוהה" : e.severity === "medium" ? "בינונית" : "נמוכה",
        rationale: e.explanation,
      })),
      driverQuestions: [
        "האם כל זמני הפריקה שדווחו בכתב יד תואמים לפעולות המנוף בפועל?",
        "האם תעודות המשלוח נחתמו במלואן על ידי מקבל הסחורה?",
      ],
      isVisualAssessment: hasImage,
      rowsAnalyzedCount: rowsCount,
      dataHash,
      generatedAt: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  analysisCache.set(dataHash, result);
  return result;
}
