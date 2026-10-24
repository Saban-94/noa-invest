import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileImage,
  Highlighter,
  Loader2,
  MessageSquare,
  PenLine,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getScanFn } from "@/lib/notes-api.functions";
import { saveInquiryAnnotationsFn } from "@/lib/inquiry-annotations.functions";
import { listRamiInquiriesFn, replyRamiInquiryFn } from "@/lib/inquiries-api.functions";

export const Route = createFileRoute("/inquiry/$id")({
  component: RamiInquiryAdvancedView,
});

type Tool = "marker" | "arrow" | "signature";
type Point = { x: number; y: number };
type Stroke = { tool: Tool; points: Point[] };

function driveFileId(value?: string): string {
  if (!value) return "";
  const match = value.match(/[-\w]{25,}/);
  return match?.[0] || "";
}

function RamiInquiryAdvancedView() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>("marker");
  const [replyText, setReplyText] = useState("");
  const [signatureApproved, setSignatureApproved] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 480 });

  const inquiryQuery = useQuery({
    queryKey: ["rami-inquiries"],
    queryFn: async () => {
      const { inquiries } = await listRamiInquiriesFn();
      return inquiries.map((item) => ({
        rowIndex: 0,
        receivedDate: item.receivedDate || item.date || "",
        docNumber: item.id,
        customer: item.customer || "",
        address: item.address || "",
        driver: item.driver || "",
        errorReason: item.errorReason || item.issue || "",
        aiAnalysis: item.aiAnalysis || "",
        ramiReply: item.ramiReply || (item.rounds || []).map((round) => round.rami?.text || "").filter(Boolean).join("\\n"),
        status: item.status || "ממתין לטיפול",
        harelApproval: item.harelApproval || (item.rounds || []).map((round) => round.harel?.text || "").filter(Boolean).join("\\n"),
        driveLink: item.driveUrl || "",
        fileId: item.fileId || "",
      }));
    },
    staleTime: 20_000,
    retry: 1,
  });
  const inquiry = inquiryQuery.data?.find(
    (item: any) => String(item.docNumber) === String(id) || String(item.rowIndex) === String(id),
  );

  const fileId = useMemo(() => driveFileId(inquiry?.driveLink), [inquiry?.driveLink]);
  const scanQuery = useQuery({
    queryKey: ["inquiry-scan", fileId],
    enabled: Boolean(fileId),
    queryFn: async () => {
      const file = await getScanFn({ data: { fileId } });
      return { dataUrl: `data:${file.mimeType || "image/png"};base64,${file.base64}` };
    },
    retry: 1,
  });

  const drawStrokes = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, stageSize.width, stageSize.height);
    for (const stroke of strokesRef.current) {
      if (!stroke.points.length) continue;
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      const first = stroke.points[0];
      const last = stroke.points[stroke.points.length - 1];
      if (stroke.tool === "marker") {
        context.strokeStyle = "rgba(250, 204, 21, 0.42)";
        context.lineWidth = 24;
        context.beginPath();
        stroke.points.forEach((point, index) =>
          index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
        );
        context.stroke();
      } else if (stroke.tool === "arrow") {
        const angle = Math.atan2(last.y - first.y, last.x - first.x);
        context.strokeStyle = "#dc2626";
        context.fillStyle = "#dc2626";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(last.x, last.y);
        context.stroke();
        context.beginPath();
        context.moveTo(last.x, last.y);
        context.lineTo(last.x - 16 * Math.cos(angle - 0.48), last.y - 16 * Math.sin(angle - 0.48));
        context.lineTo(last.x - 16 * Math.cos(angle + 0.48), last.y - 16 * Math.sin(angle + 0.48));
        context.closePath();
        context.fill();
      } else {
        context.strokeStyle = "#176b4d";
        context.lineWidth = 2.5;
        context.beginPath();
        stroke.points.forEach((point, index) =>
          index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
        );
        context.stroke();
      }
      context.restore();
    }
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => {
      const bounds = stage.getBoundingClientRect();
      setStageSize({ width: bounds.width, height: Math.max(420, bounds.height) });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [scanQuery.dataUrl, inquiry?.docNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stageSize.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(stageSize.width * dpr);
    canvas.height = Math.round(stageSize.height * dpr);
    canvas.style.width = `${stageSize.width}px`;
    canvas.style.height = `${stageSize.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStrokes();
  }, [stageSize.width, stageSize.height]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: Stroke = { tool, points: [getPoint(event)] };
    activeStrokeRef.current = stroke;
    strokesRef.current = [...strokesRef.current, stroke];
    drawStrokes();
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return;
    activeStrokeRef.current.points.push(getPoint(event));
    drawStrokes();
  };

  const stopDrawing = () => {
    activeStrokeRef.current = null;
  };

  const clearStrokes = () => {
    strokesRef.current = [];
    drawStrokes();
    toast.success("שכבת הסימון נוקתה");
  };

  const saveAnnotations = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("אזור הסימון עדיין לא מוכן");
      if (!strokesRef.current.length) throw new Error("יש להוסיף סימון לפני השמירה");
      const layerPng = canvas.toDataURL("image/png");
      const composite = document.createElement("canvas");
      composite.width = canvas.width;
      composite.height = canvas.height;
      const compositeContext = composite.getContext("2d");
      if (!compositeContext) throw new Error("לא ניתן להכין תמונה משולבת");
      compositeContext.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      const stage = stageRef.current;
      const image = imageRef.current;
      if (stage && image && image.complete && image.naturalWidth) {
        const bounds = stage.getBoundingClientRect();
        const ratio = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
        const width = image.naturalWidth * ratio;
        const height = image.naturalHeight * ratio;
        compositeContext.drawImage(image, (bounds.width - width) / 2, (bounds.height - height) / 2, width, height);
      }
      compositeContext.drawImage(canvas, 0, 0, stageSize.width, stageSize.height);
      return saveInquiryAnnotationsFn({
        data: {
          noteId: String(inquiry?.docNumber || id),
          pngDataUrl: layerPng,
          compositeDataUrl: composite.toDataURL("image/png"),
          annotationJson: JSON.stringify({
            version: 1,
            signatureApproved,
            strokes: strokesRef.current,
            savedAt: new Date().toISOString(),
          }),
        },
      });
    },
    onSuccess: (result) => {
      toast.success("שכבת הסימון והתמונה המשולבת נשמרו ב־Drive", {
        description: result.driveUrl ? "קישור הקובץ נשמר בתיק הבירור." : "השרת אישר את השמירה.",
      });
      void qc.invalidateQueries({ queryKey: ["rami-inquiries"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "שמירת הסימונים נכשלה"),
  });

  const sendReply = useMutation({
    mutationFn: () =>
      replyRamiInquiryFn({
        data: { noteId: String(inquiry?.docNumber || id), text: replyText.trim() },
      }),
    onSuccess: async () => {
      toast.success("המענה נשמר ונשלח להראל");
      setReplyText("");
      await qc.invalidateQueries({ queryKey: ["rami-inquiries"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "שליחת המענה נכשלה"),
  });

  if (inquiryQuery.isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-muted-foreground" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin" /> טוען תיק בירור...
      </div>
    );
  }

  if (inquiryQuery.error) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-10 text-center" dir="rtl">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h2 className="text-lg font-bold">לא ניתן לטעון את תיקי הבירור</h2>
        <p className="text-sm text-muted-foreground">בדוק את חיבור השרת ונסה שוב.</p>
        <Button onClick={() => void inquiryQuery.refetch()}>נסה שוב</Button>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-10 text-center" dir="rtl">
        <FileImage className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-bold">תיק בירור #{id} לא נמצא</h2>
        <p className="text-sm text-muted-foreground">ייתכן שהתיק הוסר או שמספר התעודה שונה.</p>
        <Link to="/inquiries" className="inline-flex items-center gap-2 text-primary font-bold">
          <ArrowRight className="h-4 w-4" /> חזרה לרשימת הבירורים
        </Link>
      </div>
    );
  }

  const status = String(inquiry.status || "ממתין לטיפול");
  const waitingHarel = /הראל|מנכ|harel/i.test(status);
  const currentRound = inquiry.ramiReply ? 2 : 1;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8" dir="rtl">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <PageHeader
            title={`תיק בירור חריגה · תעודה #${inquiry.docNumber || id}`}
            subtitle={[`לקוח: ${inquiry.customer || "לא צוין"}`, inquiry.address, inquiry.driver ? `נהג: ${inquiry.driver}` : ""].filter(Boolean).join(" · ")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${waitingHarel ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {waitingHarel ? <Clock3 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {status}
            </span>
            {inquiry.driveLink && (
              <a href={inquiry.driveLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                <ExternalLink className="h-4 w-4" /> מסמך המקור
              </a>
            )}
            <Link to="/inquiries" className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground hover:opacity-90">
              <ArrowRight className="h-4 w-4" /> חזרה לבירורים
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">מספר תעודה</div><div className="mt-2 text-xl font-black">#{inquiry.docNumber || id}</div></div>
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">תאריך קליטה</div><div className="mt-2 text-lg font-bold">{inquiry.receivedDate || "לא צוין"}</div></div>
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">סבב בירור</div><div className="mt-2 text-lg font-bold">{currentRound}</div></div>
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">חתימת לקוח</div><div className="mt-2 flex items-center gap-2 text-sm font-bold">{signatureApproved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ShieldCheck className="h-4 w-4 text-amber-600" />}{signatureApproved ? "אושרה בסשן זה" : "ממתינה לאימות"}</div></div>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.8fr)]">
        <Card className="overflow-hidden rounded-3xl border-border shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div><h2 className="flex items-center gap-2 text-base font-extrabold"><PenLine className="h-5 w-5 text-primary" /> מסמך וסימון חריגות</h2><p className="mt-1 text-xs text-muted-foreground">הסימונים נשמרים כשכבה נפרדת; מסמך המקור אינו משתנה.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={tool === "marker" ? "default" : "outline"} onClick={() => setTool("marker")} className="gap-2"><Highlighter className="h-4 w-4" /> מרקר</Button>
              <Button size="sm" variant={tool === "arrow" ? "default" : "outline"} onClick={() => setTool("arrow")} className="gap-2"><AlertTriangle className="h-4 w-4" /> חץ אדום</Button>
              <Button size="sm" variant={tool === "signature" ? "default" : "outline"} onClick={() => setTool("signature")} className="gap-2"><PenLine className="h-4 w-4" /> חתימה</Button>
              <Button size="sm" variant="outline" onClick={clearStrokes} className="gap-2"><Trash2 className="h-4 w-4" /> נקה</Button>
            </div>
          </div>
          <div className="p-4 md:p-5">
            <div ref={stageRef} className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40">
              {scanQuery.isLoading ? (
                <div className="flex min-h-[420px] items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> טוען את המסמך המקורי...</div>
              ) : scanQuery.dataUrl ? (
                <img ref={imageRef} src={scanQuery.dataUrl} alt={`סריקת תעודה ${inquiry.docNumber}`} className="pointer-events-none block max-h-[760px] w-full select-none object-contain" onLoad={() => setStageSize((s) => ({ ...s, height: Math.max(420, stageRef.current?.clientHeight || 480) }))} />
              ) : (
                <div className="flex min-h-[420px] max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
                  <FileImage className="h-12 w-12 text-muted-foreground/60" />
                  <div className="font-bold">אין סריקה זמינה לתעודה</div>
                  <p className="text-sm leading-6 text-muted-foreground">{scanQuery.error ? "לא ניתן לטעון את הקובץ. אפשר לפתוח את המקור דרך הקישור ולנסות שוב." : "לא נמצא מזהה קובץ Drive תקין ברשומת הבירור."}</p>
                  {inquiry.driveLink && <a className="text-sm font-bold text-primary underline" href={inquiry.driveLink} target="_blank" rel="noreferrer">פתיחת מסמך המקור</a>}
                  {fileId && <Button size="sm" variant="outline" onClick={() => void scanQuery.refetch()}>נסה לטעון שוב</Button>}
                </div>
              )}
              <canvas
                ref={canvasRef}
                aria-label="שכבת סימון על המסמך"
                className="absolute inset-0 z-10 touch-none"
                style={{ width: "100%", height: "100%", cursor: tool === "signature" ? "crosshair" : "crosshair" }}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
              />
            </div>
            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-sm font-bold">{signatureApproved ? "אישור חתימה סומן" : "אימות חתימת לקוח"}</div><p className="mt-1 text-xs text-muted-foreground">החיווי המקומי אינו אישור משפטי ואינו משנה סטטוס בשרת.</p></div>
              <Button variant={signatureApproved ? "outline" : "default"} onClick={() => setSignatureApproved((value) => !value)} className="gap-2">{signatureApproved ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{signatureApproved ? "בטל סימון" : "סמן כמאומת"}</Button>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => saveAnnotations.mutate()} disabled={saveAnnotations.isPending || strokesRef.current.length === 0} className="flex-1 gap-2">
                {saveAnnotations.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saveAnnotations.isPending ? "שומר ב־Drive..." : "שמור סימונים ותמונה משולבת"}
              </Button>
              <Button variant="outline" onClick={() => { const c = canvasRef.current; if (!c) return; const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `inquiry-${inquiry.docNumber}-annotations.png`; a.click(); }} className="gap-2"><FileImage className="h-4 w-4" /> ייצא שכבה</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-3xl border-border p-5 shadow-sm">
            <div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-2.5 text-primary"><Sparkles className="h-5 w-5" /></div><div><h2 className="font-extrabold">נועה AI · ניתוח החריגה</h2><p className="mt-1 text-xs text-muted-foreground">תובנות מתוך נתוני תיק הבירור</p></div></div>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-7 text-amber-950"><div className="mb-1 flex items-center gap-2 font-extrabold"><AlertTriangle className="h-4 w-4" /> ממצא לבדיקה</div>{inquiry.aiAnalysis || inquiry.errorReason || "לא צורף ניתוח לתיק זה."}</div>
            {inquiry.errorReason && inquiry.aiAnalysis && <div className="mt-3 rounded-2xl bg-muted/40 p-4"><div className="text-xs font-bold text-muted-foreground">תיאור החריגה</div><p className="mt-1 text-sm leading-6">{inquiry.errorReason}</p></div>}
          </Card>

          <Card className="rounded-3xl border-border p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4"><div><h2 className="flex items-center gap-2 font-extrabold"><MessageSquare className="h-5 w-5 text-primary" /> שרשור ראמי והראל</h2><p className="mt-1 text-xs text-muted-foreground">כל מענה מתועד בשרת ובגיליון</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-extrabold">סבב {currentRound}</span></div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border-r-4 border-amber-400 bg-muted/40 p-4"><div className="mb-1 text-xs font-extrabold">נועה AI · ניתוח</div><p className="text-sm leading-6">{inquiry.aiAnalysis || inquiry.errorReason || "אין הודעת ניתוח זמינה."}</p></div>
              {inquiry.ramiReply && <div className="rounded-2xl border-r-4 border-primary bg-primary/5 p-4"><div className="mb-1 text-xs font-extrabold">ראמי · מענה קיים</div><p className="whitespace-pre-wrap text-sm leading-6">{inquiry.ramiReply}</p></div>}
              {inquiry.harelApproval && <div className="rounded-2xl border-r-4 border-emerald-500 bg-emerald-50/70 p-4"><div className="mb-1 flex items-center gap-2 text-xs font-extrabold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> הראל · אישור</div><p className="text-sm leading-6">{inquiry.harelApproval}</p></div>}
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <label htmlFor="replyText" className="mb-2 block text-sm font-extrabold">המענה המקצועי של ראמי</label>
              <textarea id="replyText" rows={5} maxLength={2000} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="תאר את הבדיקה שבוצעה, ממצאים בשטח והסיבה לפער..." className="w-full resize-y rounded-2xl border border-border bg-background p-3 text-sm leading-6 outline-none transition focus:ring-2 focus:ring-primary/30" />
              <div className="mt-1 text-left text-xs text-muted-foreground">{replyText.length}/2000</div>
              <Button onClick={() => sendReply.mutate()} disabled={sendReply.isPending || replyText.trim().length < 3} className="mt-3 w-full gap-2 font-bold">
                {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendReply.isPending ? "שולח מענה..." : "שלח מענה להראל לאישור"}
              </Button>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">ההודעה נחשבת שנשלחה רק לאחר אישור מהשרת. אישור מנכ״ל נשאר שלב נפרד.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
