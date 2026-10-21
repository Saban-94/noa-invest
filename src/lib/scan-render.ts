/**
 * המרת קובץ הסריקה שהגיע מהשרת (PDF או תמונה, base64) ל-data URL של תמונה.
 * מכיוון שהתמונה נוצרת מקומית, הקנבס לא "מזוהם" ו-toDataURL עובד.
 */
export async function scanToDataUrl(mimeType: string, base64: string): Promise<string> {
  if (!base64) throw new Error("הקובץ ריק");
  if (mimeType.startsWith("image/")) return `data:${mimeType};base64,${base64}`;
  if (mimeType !== "application/pdf") throw new Error(`סוג קובץ לא נתמך: ${mimeType || "לא ידוע"}`);

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const page = await pdf.getPage(1); // הסריקות מפוצלות לעמוד אחד לכל קובץ
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("לא ניתן ליצור קנבס");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, canvas, viewport } as Parameters<typeof page.render>[0])
    .promise;
  return canvas.toDataURL("image/png");
}
