import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowRight,
  AlertTriangle,
  Crown,
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
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import { saveInquiryAnnotationsFn } from "@/lib/inquiry-annotations.functions";
import { listWorkroomInquiriesFn, ramiReplyFn } from "@/lib/inquiry-workflow.functions";
import { STATUS_LABEL, formatHe } from "@/lib/inquiry-workflow";
import { InquiryThread } from "@/components/InquiryThread";
import { notifyHarelQueueFn } from "@/lib/onesignal.functions";
import { playDispatchChime } from "@/lib/audio-alerts";
import { NotifyStatusChip, WorkroomNav } from "@/components/workroom";
import {
  TONE,
  WORKROOM_BTN,
  notificationAccepted,
  statusTone,
  type NotifyState,
} from "@/lib/workroom-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inquiry/$id")({
  head: ({ params }) => ({
    meta: [{ title: `תיק בירור #${params.id} — נועה ח. סבן` }],
  }),
  component: RamiInquiryAdvancedView,
});

type Tool = "marker" | "arrow" | "signature";
/**
 * נקודה בקואורדינטות יחסיות (0–1) לתמונת הסריקה כפי שהיא מוצגת (או לאזור הסימון כשאין תמונה).
 * כך הסימון נשאר על אותה שורה בתעודה גם אחרי שינוי גודל חלון / סיבוב טלפון.
 */
type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };
type Stroke = { tool: Tool; points: Point[] };

function driveFileId(value?: string, rowItem?: any): string {
  if (value) {
    const match = value.match(/[-\w]{25,}/);
    if (match?.[0]) return match[0];
  }
  if (rowItem) {
    const possibleFields = [
      rowItem.fileId,
      rowItem.driveUrl,
      rowItem.driveLink,
      rowItem["מזהה קובץ Drive"],
      rowItem["כתובת הקובץ (URL)"]
    ];
    for (const f of possibleFields) {
      if (f && typeof f === "string") {
        const m = f.match(/[-\w]{25,}/);
        if (m?.[0]) return m?.[0];
      }
    }
  }
  return "";
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
  const [signatureApproved, setSignatureApproved] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 480 });
  const [notify, setNotify] = useState<NotifyState>({ state: "idle" });
  // strokesRef לא גורם ל-render; המונה הזה מעדכן את מצב הכפתורים (שמירה/ביטול/ניקוי)
  const [strokeCount, setStrokeCount] = useState(0);

  const inquiryQuery = useQuery({
    queryKey: ["workroom", "inquiry-detail"],
    queryFn: async () => {
      const { inquiries } = await listWorkroomInquiriesFn();
      return inquiries.map((item) => ({
        rowIndex: 0,
        inquiryId: item.id,
        // «נפתח» = ההודעה הראשונה בשרשור; updatedAt הוא עדכון אחרון ולא תאריך קליטה
        openedAt: item.thread[0]?.at || "",
        updatedAt: item.updatedAt || "",
        // סבב = 1 + מספר הפעמים שהראל החזיר את התיק לראמי
        round:
          1 +
          item.thread.filter((message) => message.role === "harel" && message.action === "returned_to_rami")
            .length,
        statusKey: item.status,
        task: item.task ?? null,
        docNumber: item.docNumber,
        customer: item.customer || "",
        address: item.address || "",
        driver: item.driver || "",
        errorReason: item.issue || "",
        aiAnalysis: item.aiAnalysis || "",
        ramiReply: item.thread.filter((message) => message.role === "rami").map((message) => message.text).join("\n"),
        status: STATUS_LABEL[item.status] || item.status,
        harelApproval: item.thread.filter((message) => message.role === "harel").map((message) => message.text).join("\n"),
        driveLink: item.driveUrl || "",
        fileId: item.scanFileId || "",
        thread: item.thread || [],
      }));
    },
    staleTime: 20_000,
    retry: 1,
  });
  const inquiry = inquiryQuery.data?.find(
    (item) => String(item.docNumber) === String(id) || String(item.inquiryId) === String(id),
  );

  const fileId = useMemo(() => driveFileId(inquiry?.fileId || inquiry?.driveLink), [inquiry?.fileId, inquiry?.driveLink]);
  const scanQuery = useQuery({
    queryKey: ["inquiry-scan", fileId],
    enabled: Boolean(fileId),
    queryFn: async () => {
      const file = await getScanFn({ data: { fileId } });
      return { dataUrl: await scanToDataUrl(file.mimeType, file.base64) };
    },
    retry: 1,
  });

  /** מלבן התוכן של הסריקה (object-contain) ביחס לקנבס; בלי תמונה — כל אזור הסימון. */
  const getContentRect = useCallback((): Rect => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const full = { left: 0, top: 0, width: stageSize.width, height: stageSize.height };
    if (!canvas || !image || !image.complete || !image.naturalWidth) return full;
    const canvasRect = canvas.getBoundingClientRect();
    const imgRect = image.getBoundingClientRect();
    const ratio = Math.min(imgRect.width / image.naturalWidth, imgRect.height / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    if (!width || !height) return full;
    return {
      left: imgRect.left - canvasRect.left + (imgRect.width - width) / 2,
      top: imgRect.top - canvasRect.top + (imgRect.height - height) / 2,
      width,
      height,
    };
  }, [stageSize.width, stageSize.height]);

  const drawStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, stageSize.width, stageSize.height);
    const box = getContentRect();
    for (const normalized of strokesRef.current) {
      if (!normalized.points.length) continue;
      const stroke = {
        ...normalized,
        points: normalized.points.map((p) => ({ x: box.left + p.x * box.width, y: box.top + p.y * box.height })),
      };
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      const first = stroke.points[0];
      const last = stroke.points[stroke.points.length - 1];
      if (!first || !last) continue;
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
  }, [stageSize.width, stageSize.height, getContentRect]);

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
  }, [scanQuery.data?.dataUrl, inquiry?.docNumber]);

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
  }, [stageSize.width, stageSize.height, drawStrokes]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const box = getContentRect();
    if (!box.width || !box.height) return { x: 0, y: 0 };
    // מותר לצייר גם בשוליים שמחוץ לתמונה, אבל לא מחוץ לאזור הסימון
    const localX = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const localY = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    return { x: (localX - box.left) / box.width, y: (localY - box.top) / box.height };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: Stroke = { tool, points: [getPoint(event)] };
    activeStrokeRef.current = stroke;
    strokesRef.current = [...strokesRef.current, stroke];
    setStrokeCount(strokesRef.current.length);
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
    if (!strokesRef.current.length) return;
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setStrokeCount(0);
    drawStrokes();
    toast.success("שכבת הסימון נוקתה");
  };

  const undoLastStroke = () => {
    if (!strokesRef.current.length) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    drawStrokes();
    toast.success("הפעולה האחרונה בוטלה");
  };

  // מעבר לתיק אחר באותו מסך (אותה קומפוננטה) — לא לגרור סימונים מהתיק הקודם
  useEffect(() => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setStrokeCount(0);
    setSignatureApproved(false);
    drawStrokes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
        // מיקום התמונה כפי שהיא מוצגת בפועל (object-contain בתוך ה-img, ממורכז בתוך אזור הסימון)
        const stageRect = stage.getBoundingClientRect();
        const imgRect = image.getBoundingClientRect();
        const ratio = Math.min(imgRect.width / image.naturalWidth, imgRect.height / image.naturalHeight);
        const width = image.naturalWidth * ratio;
        const height = image.naturalHeight * ratio;
        const left = imgRect.left - stageRect.left + (imgRect.width - width) / 2;
        const top = imgRect.top - stageRect.top + (imgRect.height - height) / 2;
        compositeContext.drawImage(image, left, top, width, height);
      }
      compositeContext.drawImage(canvas, 0, 0, stageSize.width, stageSize.height);
      return saveInquiryAnnotationsFn({
        data: {
          noteId: String(inquiry?.docNumber || id),
          pngDataUrl: layerPng,
          compositeDataUrl: composite.toDataURL("image/png"),
          annotationJson: JSON.stringify({
            version: 2,
            coordinateSpace: "normalized-to-scan",
            stage: { width: stageSize.width, height: stageSize.height },
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
      void qc.invalidateQueries({ queryKey: ["workroom"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "שמירת הסימונים נכשלה"),
  });

  const sendReply = useMutation({
    mutationFn: (payload: { text: string; replyToId?: string | undefined }) =>
      ramiReplyFn({
        data: {
          inquiryId: String(inquiry?.inquiryId || inquiry?.docNumber || id),
          noteId: String(inquiry?.docNumber || id),
          text: payload.text,
          ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
        },
      }),
    onSuccess: async () => {
      const noteId = String(inquiry?.docNumber || id);
      setNotify({ state: "sending", noteId, target: "harel" });
      void playDispatchChime(0.9);
      let ok = false;
      try {
        const response = await notifyHarelQueueFn({
          data: {
            noteId,
            kind: "rami_replied",
            ...(inquiry?.customer ? { customer: inquiry.customer } : {}),
          },
        });
        ok = notificationAccepted(response);
      } catch (error) {
        console.warn("OneSignal", error);
      }
      setNotify({ state: ok ? "sent" : "failed", noteId, target: "harel", at: new Date().toISOString() });
      await qc.invalidateQueries({ queryKey: ["workroom"] });
      toast.success("המענה נשמר ונשלח להראל");
      if (ok) toast.info("בקשת התראה להראל נמסרה ל-OneSignal; מסירה למכשיר לא מאומתת");
      else toast.error("המענה נשמר, אך בקשת ההתראה להראל נכשלה");
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
        <Link to="/inquiry" search={{ tab: "tasks" }} className="inline-flex items-center gap-2 text-primary font-bold">
          <ArrowRight className="h-4 w-4" /> חזרה לרשימת הבירורים
        </Link>
      </div>
    );
  }

  const status = String(inquiry.status || "ממתין לטיפול");
  // צבע לפי הסטטוס האמיתי (לא regex על התווית — «ממתין לראמי» אינו «ממתין להראל»)
  const tone = TONE[statusTone(inquiry.statusKey, inquiry.task)];
  const isPending = inquiry.statusKey === "pending_harel" || inquiry.statusKey === "pending_rami" || inquiry.statusKey === "returned_to_rami";
  const currentRound = inquiry.round;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8" dir="rtl">
      <WorkroomNav current="inquiry" taskId={String(inquiry.docNumber || id)} />
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <PageHeader
            title={`תיק בירור חריגה · תעודה #${inquiry.docNumber || id}`}
            subtitle={[`לקוח: ${inquiry.customer || "לא צוין"}`, inquiry.address, inquiry.driver ? `נהג: ${inquiry.driver}` : ""].filter(Boolean).join(" · ")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold", tone.border, tone.surface, tone.text)}>
              {inquiry.statusKey === "approved" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : isPending ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              {status}
            </span>
            {inquiry.driveLink && (
              <a href={inquiry.driveLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                <ExternalLink className="h-4 w-4" /> מסמך המקור
              </a>
            )}
            <Link to="/harel" search={{ task: String(inquiry.docNumber || id) }} className={WORKROOM_BTN.harel}>
              <Crown className="h-4 w-4" aria-hidden="true" /> מסך הראל
            </Link>
            <Link
              to="/inquiry"
              search={{ task: String(inquiry.docNumber || id), tab: "tasks" }}
              className={WORKROOM_BTN.secondary}
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" /> חזרה לבירורים
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">מספר תעודה</div><div className="mt-2 text-xl font-black">#{inquiry.docNumber || id}</div></div>
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">נפתח</div><div className="mt-2 text-lg font-bold">{inquiry.openedAt ? formatHe(inquiry.openedAt) : "לא צוין"}</div>{inquiry.updatedAt && <div className="mt-1 text-[11px] text-muted-foreground">עודכן: {formatHe(inquiry.updatedAt)}</div>}</div>
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">סבב בירור</div><div className="mt-2 text-lg font-bold">{currentRound}</div><div className="mt-1 text-[11px] text-muted-foreground">{currentRound > 1 ? `הוחזר לראמי ${currentRound - 1} פעמים` : "סבב ראשון"}</div></div>
          <div className="rounded-2xl bg-muted/40 p-4"><div className="text-xs text-muted-foreground">חתימת לקוח</div><div className="mt-2 flex items-center gap-2 text-sm font-bold">{signatureApproved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ShieldCheck className="h-4 w-4 text-amber-600" />}{signatureApproved ? "אושרה בסשן זה" : "ממתינה לאימות"}</div></div>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.8fr)]">
        <Card className="overflow-hidden rounded-3xl border-border shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div><h2 className="flex items-center gap-2 text-base font-extrabold"><PenLine className="h-5 w-5 text-primary" /> מסמך וסימון חריגות</h2><p className="mt-1 text-xs text-muted-foreground">הסימונים נשמרים כשכבה נפרדת; מסמך המקור אינו משתנה.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" aria-pressed={tool === "marker"} variant={tool === "marker" ? "default" : "outline"} onClick={() => setTool("marker")} className="gap-2"><Highlighter className="h-4 w-4" /> מרקר</Button>
              <Button size="sm" aria-pressed={tool === "arrow"} variant={tool === "arrow" ? "default" : "outline"} onClick={() => setTool("arrow")} className="gap-2"><AlertTriangle className="h-4 w-4" /> חץ אדום</Button>
              <Button size="sm" aria-pressed={tool === "signature"} variant={tool === "signature" ? "default" : "outline"} onClick={() => setTool("signature")} className="gap-2"><PenLine className="h-4 w-4" /> חתימה</Button>
              <Button size="sm" variant="outline" onClick={undoLastStroke} disabled={strokeCount === 0} className="gap-2"><RotateCcw className="h-4 w-4" /> בטל פעולה</Button>
              <Button size="sm" variant="outline" onClick={clearStrokes} disabled={strokeCount === 0} className="gap-2"><Trash2 className="h-4 w-4" /> נקה הכל</Button>
            </div>
          </div>
          <div className="p-4 md:p-5">
            <div ref={stageRef} className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40">
              {scanQuery.isLoading ? (
                <div className="flex min-h-[420px] items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> טוען את המסמך המקורי...</div>
              ) : scanQuery.data?.dataUrl ? (
                <img ref={imageRef} src={scanQuery.data?.dataUrl} alt={`סריקת תעודה ${inquiry.docNumber}`} className="pointer-events-none block max-h-[760px] w-full select-none object-contain" onLoad={() => { setStageSize((s) => ({ ...s, height: Math.max(420, stageRef.current?.clientHeight || 480) })); requestAnimationFrame(() => drawStrokes()); }} />
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
              <Button onClick={() => saveAnnotations.mutate()} disabled={saveAnnotations.isPending || strokeCount === 0} className="flex-1 gap-2">
                {saveAnnotations.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saveAnnotations.isPending ? "שומר ב־Drive..." : "שמור סימונים ותמונה משולבת"}
              </Button>
              <Button variant="outline" disabled={strokeCount === 0} onClick={() => { const c = canvasRef.current; if (!c) return; const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `inquiry-${inquiry.docNumber}-annotations.png`; a.click(); }} className="gap-2"><FileImage className="h-4 w-4" /> ייצא שכבה</Button>
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
            <div className="mt-4">
              <InquiryThread
                messages={inquiry.thread || []}
                onReply={async (text, replyToId) => {
                  await sendReply.mutateAsync({ text, replyToId });
                }}
              />
              {notify.state !== "idle" && <NotifyStatusChip notify={notify} className="mt-3" />}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">כל הודעה נשמרת בשרשור השרת. שליחת מענה של ראמי להראל מפעילה צליל ומנסה לשלוח התראה; אישור מנכ״ל נשאר שלב נפרד.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
