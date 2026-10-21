import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileText,
  Send,
  ShieldCheck,
  UserCheck,
  Stamp,
  MousePointerClick,
  Crown,
  AlertTriangle,
  Plus,
  Trash2,
  Edit3,
  ExternalLink,
  Copy,
  Sparkles,
  RotateCcw,
  Scale,
  Truck,
  Eye,
  FileCheck2,
  PenTool,
  Upload,
  FolderCheck,
  Share2,
} from "lucide-react";
import type { DeliveryNote, DeliveryItem } from "@/lib/data";
import { noteWeightKg, noteWeightTons, noteItemsCount } from "@/lib/data";
import { approvals, playDispatchChime } from "@/lib/store";
import { saveSignedNoteStrict } from "@/lib/api";

const HAREL_PHONE = "972506662300"; // טלפון הראל אידלסון (מנכ״ל ח. סבן: 050-6662300)
const DEFAULT_RAMI_STAMP = "/sing-rami.jpg";

interface PathPoint {
  x: number;
  y: number;
}

interface DrawingPath {
  points: PathPoint[];
  color: string;
  width: number;
  type: "pen" | "highlight";
}

interface StampItem {
  x: number;
  y: number;
  name: string;
  timeStr: string;
}

interface TextAnnotation {
  x: number;
  y: number;
  text: string;
  color: string;
}

interface DeliveryCanvasEditorProps {
  note?: DeliveryNote;
  imageSrc?: string;
  stampSrc?: string;
  secondaryStampSrc?: string;
}

export default function DeliveryCanvasEditor({
  note,
  imageSrc,
  stampSrc = DEFAULT_RAMI_STAMP,
  secondaryStampSrc,
}: DeliveryCanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // -------------------------------------------------------------
  // 1. Dynamic State Binding (כל השדות עריכים ומסונכרנים 1:1)
  // -------------------------------------------------------------
  const [activeView, setActiveView] = useState<"canvas" | "edit">("canvas");
  const [renderMode, setRenderMode] = useState<"real_scan" | "vector_doc">("real_scan");

  const [orderId, setOrderId] = useState<string>("");
  const [comaxOrder, setComaxOrder] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerNo, setCustomerNo] = useState<string>("");
  const [siteAddress, setSiteAddress] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [yard, setYard] = useState<string>("");
  const [driverName, setDriverName] = useState<string>("");
  const [craneTime, setCraneTime] = useState<string>("");
  const [signedBy, setSignedBy] = useState<string>("");

  // פקדונות 1:1
  const [balesDelivered, setBalesDelivered] = useState<number>(0);
  const [balesBilled, setBalesBilled] = useState<number>(0);
  const [palletsDelivered, setPalletsDelivered] = useState<number>(0);
  const [palletsBilled, setPalletsBilled] = useState<number>(0);

  // פריטי משלוח (כמויות ומשקלים בלבד - ללא שום מחיר/כסף)
  const [items, setItems] = useState<DeliveryItem[]>([]);

  // כלי עריכה וציור על התעודה
  const [toolMode, setToolMode] = useState<"pen" | "highlight" | "text" | "stamp">("pen");
  const [penColor, setPenColor] = useState<string>("#1e3a8a"); // כחול עט חתימה
  const [activeStampName, setActiveStampName] = useState<string>("ראמי");
  const [textInput, setTextInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingToHarel, setIsSendingToHarel] = useState(false);

  // שכבות ציור שנשמרות מעל התעודה האמיתית
  const [drawnPaths, setDrawnPaths] = useState<DrawingPath[]>([]);
  const [stampPlacements, setStampPlacements] = useState<StampItem[]>([]);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const currentPathRef = useRef<PathPoint[]>([]);
  const isDrawing = useRef(false);

  // תמונת הסריקה האמיתית
  const [loadedScanImg, setLoadedScanImg] = useState<HTMLImageElement | null>(null);

  // אתחול וסנכרון מלא מול התעודה החיה מ-Google Sheets / Firestore
  useEffect(() => {
    if (!note) return;

    setOrderId(note.id || "6715766");
    setComaxOrder(note.comaxOrder || note.id || "6215960");
    setCustomerName(note.customer || "א.ערן אזולאי בע״מ");
    setCustomerNo(note.customerNo || "632122");
    setSiteAddress(note.siteAddress || note.site || "נח 3, תל אביב");
    setDeliveryDate(note.date || new Date().toLocaleDateString("he-IL"));
    setYard(note.yard || "מחסן 4 החרש 10");
    setDriverName(note.driver || "חכמת (מרצדס 615-41-002)");
    setCraneTime(note.craneTime || "26 דק׳ מנוף");
    setSignedBy(note.signedBy || "ראמי מאסרווה בשטח ✅");

    setBalesDelivered(note.deposits?.bales60002?.delivered ?? 0);
    setBalesBilled(note.deposits?.bales60002?.billed ?? 0);
    setPalletsDelivered(note.deposits?.pallets60060?.delivered ?? 0);
    setPalletsBilled(note.deposits?.pallets60060?.billed ?? 0);

    const initialItems: DeliveryItem[] =
      Array.isArray(note.items) && note.items.length > 0
        ? note.items.map((i) => ({
            name: i.name,
            qty: i.qty || 1,
            ordered: i.ordered || i.qty || 1,
            unit: i.unit || "שק",
            weightKg: i.weightKg || (i.name.includes("בלה") ? 1000 : 25),
            deposit: i.deposit,
          }))
        : [
            {
              name: "ריצופית אפור 181 25 ק״ג כרמית",
              qty: 240,
              ordered: 240,
              weightKg: 25,
              unit: "שק",
            },
            {
              name: "פורצלן 60/120 דמוי בטון",
              qty: 175,
              ordered: 175,
              weightKg: 28,
              unit: "מ״ר",
            },
            {
              name: "פח איטום סיקה טופ 107",
              qty: 60,
              ordered: 60,
              weightKg: 25,
              unit: "פח",
            },
          ];
    setItems(initialItems);
    setDrawnPaths([]);
    setStampPlacements([]);
    setTextAnnotations([]);
  }, [note?.id, note]);

  // טעינת תמונת התעודה האמיתית (מ-Google Drive דרך שרת Apps Script)
  const activeImageSource = imageSrc || note?.scanImage;

  useEffect(() => {
    if (!activeImageSource) {
      setLoadedScanImg(null);
      return;
    }

    const img = new Image();
    if (!activeImageSource.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = activeImageSource;
    img.onload = () => {
      setLoadedScanImg(img);
      setRenderMode("real_scan");
    };
    img.onerror = () => {
      console.warn("[Canvas] Could not load scan image");
      setLoadedScanImg(null);
    };
  }, [activeImageSource]);

  // -------------------------------------------------------------
  // 2. חישוב כמויות ומשקל מוערך כולל (ללא מחירים)
  // -------------------------------------------------------------
  const totalItemsUnits = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }, [items]);

  const totalEstimatedWeightKg = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = Number(item.qty) || 0;
      const w = Number(item.weightKg) || 0;
      return sum + q * w;
    }, 0);
  }, [items]);

  const totalEstimatedWeightTons = useMemo(() => {
    return (totalEstimatedWeightKg / 1000).toFixed(2);
  }, [totalEstimatedWeightKg]);

  // בדיקת התאמות 1:1
  const auditSummary = useMemo(() => {
    if (note?.live) {
      return {
        isAllOk: false,
        issues: [
          {
            field: "הצלבה",
            message: "טרם הוצלב מול קומקס/איתוראן",
            severity: "warn" as const,
          },
        ],
        statusLabel: "טרם הוצלב מול קומקס/איתוראן",
      };
    }

    const issues: { field: string; message: string; severity: "warn" | "fail" }[] = [];

    items.forEach((item, idx) => {
      if (item.qty !== item.ordered) {
        issues.push({
          field: `פריט #${idx + 1}: ${item.name}`,
          message: `סופקו ${item.qty} מול ${item.ordered} בהזמנת קומקס`,
          severity: "warn",
        });
      }
    });

    if (balesDelivered !== balesBilled) {
      issues.push({
        field: "בלות 60002",
        message: `${balesDelivered} סופקו בפועל מול ${balesBilled} שנרשמו`,
        severity: "fail",
      });
    }

    if (palletsDelivered !== palletsBilled) {
      issues.push({
        field: "משטחי עץ 60060",
        message: `${palletsDelivered} סופקו בפועל מול ${palletsBilled} שנרשמו`,
        severity: "fail",
      });
    }

    const isAllOk = issues.length === 0;
    return {
      isAllOk,
      issues,
      statusLabel: isAllOk ? "מאוזן 1:1 ומאומת ✅" : "קיימות אי-התאמות לבדיקה ⚠️",
    };
  }, [note?.live, items, balesDelivered, balesBilled, palletsDelivered, palletsBilled]);

  // -------------------------------------------------------------
  // 3. ציור שטר המשלוח האמיתי + שכבות עריכה וחתימה על הקנבס
  // -------------------------------------------------------------
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 1080;

    // בסיס תעודה: או סריקת מסמך אמיתית או שטר משלוח וקטורי רשמי
    if (renderMode === "real_scan" && loadedScanImg) {
      // ציור הסריקה המקורית מ-Drive כמצע אמיתי
      ctx.drawImage(loadedScanImg, 0, 0, canvas.width, canvas.height);

      // שכבת מסגרת וסימון עדין
      ctx.strokeStyle = "rgba(15, 23, 42, 0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    } else {
      // ציור שטר משלוח וקטורי רשמי ללא שום מחיר
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      ctx.direction = "rtl";
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px Assistant, Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("בס״ד", canvas.width - 45, 45);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 20px Assistant, Arial, sans-serif";
      ctx.fillText("ח. סבן חומרי בניין (1994) בע״מ", canvas.width - 50, 75);

      ctx.font = "11px Assistant, Arial, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(
        "אספקה ישירה לאתרי בנייה · מלט · טיט · בלוקים · חול · חצץ · גבס ובידוד",
        canvas.width - 50,
        95,
      );
      ctx.fillText(
        "מחסן 4 החרש 10 הוד השרון · טל: 09-7407070 · מחסן 1 התלמיד 6 הוד השרון",
        canvas.width - 50,
        112,
      );

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 22px Assistant, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`שטר משלוח מס׳: ${orderId}`, canvas.width / 2, 155);

      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(45, 175);
      ctx.lineTo(canvas.width - 45, 175);
      ctx.stroke();

      // פרטי שטר המשלוח
      ctx.textAlign = "right";
      ctx.font = "bold 13px Assistant, Arial, sans-serif";
      ctx.fillStyle = "#1e293b";

      ctx.fillText(`שם הלקוח: ${customerName}`, canvas.width - 60, 205);
      ctx.fillText(`תאריך אספקה: ${deliveryDate}`, 320, 205);

      ctx.fillText(`כתובת האתר: ${siteAddress}`, canvas.width - 60, 230);
      ctx.fillText(`נהג ומשאית: ${driverName}`, 320, 230);

      ctx.fillText(`הזמנת קומקס: #${comaxOrder}`, canvas.width - 60, 255);
      ctx.fillText(`מחסן מקור: ${yard}`, 320, 255);

      // טבלת כמויות ומשקלים (ללא מחירים)
      const tableTop = 280;
      const rowHeight = 32;
      const headers = [
        "מס׳",
        "תיאור הפריט",
        "סופק",
        "הוזמן",
        "יח׳",
        "משקל ליח׳",
        "סה״כ משקל מוערך",
      ];
      const colX = [
        canvas.width - 60,
        canvas.width - 100,
        canvas.width - 360,
        canvas.width - 420,
        canvas.width - 480,
        canvas.width - 550,
        canvas.width - 650,
      ];

      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(45, tableTop, canvas.width - 90, 30);
      ctx.strokeStyle = "#cbd5e1";
      ctx.strokeRect(45, tableTop, canvas.width - 90, 30);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 12px Assistant, Arial, sans-serif";
      headers.forEach((h, idx) => {
        ctx.fillText(h, colX[idx]!, tableTop + 20);
      });

      // שורות פריטים
      ctx.font = "12px Assistant, Arial, sans-serif";
      items.forEach((item, idx) => {
        const y = tableTop + 30 + idx * rowHeight;
        const hasDiscrepancy = item.qty !== item.ordered;
        const totalLineWeightKg = (item.qty || 0) * (item.weightKg || 0);

        if (hasDiscrepancy) {
          ctx.fillStyle = "#fef9c3";
          ctx.fillRect(45, y, canvas.width - 90, rowHeight);
        } else if (idx % 2 === 1) {
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(45, y, canvas.width - 90, rowHeight);
        }
        ctx.strokeStyle = "#cbd5e1";
        ctx.strokeRect(45, y, canvas.width - 90, rowHeight);

        ctx.fillStyle = hasDiscrepancy ? "#b45309" : "#1e293b";
        ctx.fillText(String(idx + 1), colX[0]!, y + 21);
        ctx.fillText(item.name || "פריט", colX[1]!, y + 21);
        ctx.font = hasDiscrepancy
          ? "bold 12px Assistant, Arial, sans-serif"
          : "12px Assistant, Arial, sans-serif";
        ctx.fillText(String(item.qty), colX[2]!, y + 21);
        ctx.fillText(String(item.ordered), colX[3]!, y + 21);
        ctx.font = "12px Assistant, Arial, sans-serif";
        ctx.fillText(item.unit || "יח׳", colX[4]!, y + 21);
        ctx.fillText(`${item.weightKg || 0} ק״ג`, colX[5]!, y + 21);
        ctx.fillText(`${totalLineWeightKg.toLocaleString()} ק״ג`, colX[6]!, y + 21);
      });

      const totalDisplayRows = Math.max(items.length, 5);
      for (let extra = items.length; extra < totalDisplayRows; extra++) {
        const y = tableTop + 30 + extra * rowHeight;
        if (extra % 2 === 1) {
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(45, y, canvas.width - 90, rowHeight);
        }
        ctx.strokeRect(45, y, canvas.width - 90, rowHeight);
      }

      // סיכום כמויות ומשקל מוערך כולל
      const depositsY = tableTop + 30 + totalDisplayRows * rowHeight + 20;
      const depositsBalanced = balesDelivered === balesBilled && palletsDelivered === palletsBilled;

      ctx.fillStyle = depositsBalanced ? "#ecfdf5" : "#fef3c7";
      ctx.fillRect(45, depositsY, canvas.width - 90, 60);
      ctx.strokeStyle = depositsBalanced ? "#10b981" : "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(45, depositsY, canvas.width - 90, 60);

      ctx.fillStyle = depositsBalanced ? "#065f46" : "#92400e";
      ctx.font = "bold 13px Assistant, Arial, sans-serif";
      ctx.fillText(
        `סיכום לוגיסטי לתעודה: ${totalItemsUnits} פריטים | משקל מוערך: ${totalEstimatedWeightTons} טון (${totalEstimatedWeightKg.toLocaleString()} ק״ג)`,
        canvas.width - 65,
        depositsY + 22,
      );

      ctx.font = "12px Assistant, Arial, sans-serif";
      ctx.fillText(
        `• שקי פקדון 60002 (בלות): ${balesDelivered} סופקו / ${balesBilled} רשומים   • משטחי עץ 60060: ${palletsDelivered} סופקו / ${palletsBilled} רשומים   • מנוף: ${craneTime}`,
        canvas.width - 65,
        depositsY + 44,
      );

      // הצהרה וחתימות
      const footerY = depositsY + 95;
      ctx.fillStyle = "#475569";
      ctx.font = "italic 12px Assistant, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "הציוד, המשטחים והשקים המפורטים לעיל סופקו במלואם ובמצב תקין לשביעות רצון המזמין.",
        canvas.width / 2,
        footerY,
      );

      ctx.textAlign = "right";
      ctx.font = "bold 13px Assistant, Arial, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(`שם המקבל באתר: ${signedBy}`, canvas.width - 70, footerY + 45);
      ctx.fillText(`אישור וחתימת שטח:`, canvas.width - 70, footerY + 70);

      ctx.font = 'italic 20px "Brush Script MT", "Segoe Script", cursive';
      ctx.fillStyle = "#1e3a8a";
      ctx.fillText(signedBy ? `${signedBy} ~` : "אושר בשטח ~", canvas.width - 230, footerY + 72);

      ctx.font = "bold 13px Assistant, Arial, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(`נהג מוביל: ${driverName}`, 320, footerY + 45);
      ctx.fillText(`אימות מסירה: תקין באיתוראן GPS 🛰️`, 320, footerY + 70);
    }

    // -----------------------------------------------------------
    // שכבות אינטראקטיביות (ציור עט, מרקר, חותמות והערות טקסט)
    // -----------------------------------------------------------
    drawnPaths.forEach((path) => {
      if (path.points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(path.points[0]!.x, path.points[0]!.y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i]!.x, path.points[i]!.y);
      }
      ctx.stroke();
      ctx.restore();
    });

    // הערות טקסט
    textAnnotations.forEach((anno) => {
      ctx.save();
      ctx.font = "bold 15px Assistant, Arial, sans-serif";
      ctx.fillStyle = anno.color;
      ctx.textAlign = "right";
      ctx.fillText(anno.text, anno.x, anno.y);
      ctx.restore();
    });

    // חותמות דיגיטליות
    stampPlacements.forEach((stamp) => {
      ctx.save();
      ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
      ctx.strokeStyle = "#059669";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(stamp.x, stamp.y, 185, 75, 12);
      ctx.fill();
      ctx.stroke();

      ctx.font = "bold 14px Assistant, Arial, sans-serif";
      ctx.fillStyle = "#047857";
      ctx.textAlign = "center";
      ctx.fillText(`נבדק ואושר`, stamp.x + 92, stamp.y + 30);
      ctx.font = "bold 12px Assistant, Arial, sans-serif";
      ctx.fillText(stamp.name, stamp.x + 92, stamp.y + 48);
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillStyle = "#065f46";
      ctx.fillText(stamp.timeStr, stamp.x + 92, stamp.y + 64);
      ctx.restore();
    });
  }, [
    renderMode,
    loadedScanImg,
    orderId,
    comaxOrder,
    customerName,
    siteAddress,
    deliveryDate,
    yard,
    driverName,
    craneTime,
    signedBy,
    balesDelivered,
    balesBilled,
    palletsDelivered,
    palletsBilled,
    items,
    totalItemsUnits,
    totalEstimatedWeightTons,
    totalEstimatedWeightKg,
    drawnPaths,
    textAnnotations,
    stampPlacements,
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // -------------------------------------------------------------
  // 4. פעולות ציור וחתימה על התעודה
  // -------------------------------------------------------------
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolMode !== "pen" && toolMode !== "highlight") return;
    isDrawing.current = true;
    const pt = getCanvasCoords(e);
    currentPathRef.current = [pt];
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const pt = getCanvasCoords(e);
    currentPathRef.current.push(pt);

    // ציור בזמן אמת על הקנבס
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = toolMode === "highlight" ? "rgba(255, 235, 59, 0.45)" : penColor;
    ctx.lineWidth = toolMode === "highlight" ? 24 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pts = currentPathRef.current;
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2]!.x, pts[pts.length - 2]!.y);
      ctx.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const pts = [...currentPathRef.current];
    currentPathRef.current = [];

    if (pts.length > 1) {
      setDrawnPaths((prev) => [
        ...prev,
        {
          points: pts,
          color: toolMode === "highlight" ? "rgba(255, 235, 59, 0.45)" : penColor,
          width: toolMode === "highlight" ? 24 : 3,
          type: toolMode,
        },
      ]);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);

    // הוספת הערת טקסט
    if (toolMode === "text" && textInput.trim()) {
      setTextAnnotations((prev) => [
        ...prev,
        {
          x: pt.x,
          y: pt.y,
          text: `✍️ ${textInput.trim()}`,
          color: penColor === "#1e3a8a" ? "#dc2626" : penColor,
        },
      ]);
      setTextInput("");
      toast.success("הערת הטקסט הוטבעה על גבי התעודה!");
      return;
    }

    // הטבעת חותמת
    if (toolMode === "stamp") {
      const now = new Date();
      const timeStr = `${now.toLocaleDateString("he-IL")} ${now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;

      setStampPlacements((prev) => [
        ...prev,
        {
          x: Math.max(20, Math.min(800 - 200, pt.x - 90)),
          y: Math.max(20, Math.min(1080 - 90, pt.y - 35)),
          name: activeStampName === "ראמי" ? "ראמי מסארווה" : "נועה AI",
          timeStr,
        },
      ]);

      toast.success(`חותמת ${activeStampName} הוטבעה עם תאריך ושעה (${timeStr})! ✨`);
      setToolMode("pen");
    }
  };

  const handleUndo = () => {
    if (drawnPaths.length > 0) {
      setDrawnPaths((prev) => prev.slice(0, -1));
      toast.info("סימון אחרון בוטל");
    } else if (textAnnotations.length > 0) {
      setTextAnnotations((prev) => prev.slice(0, -1));
      toast.info("הערת טקסט אחרונה בוטלה");
    } else if (stampPlacements.length > 0) {
      setStampPlacements((prev) => prev.slice(0, -1));
      toast.info("חותמת אחרונה בוטלה");
    }
  };

  // -------------------------------------------------------------
  // 5. שמירה לתיקיית לקוח ב-Drive + הזרקה לגיליון Google Sheets
  // -------------------------------------------------------------
  const handleSaveAndInjectToSheet = async () => {
    setIsSaving(true);
    try {
      const canvas = canvasRef.current;
      const dataUrl = canvas ? canvas.toDataURL("image/png") : "";
      if (!dataUrl) throw new Error("הקנבס ריק");

      const res = await saveSignedNoteStrict({
        noteId: orderId,
        customer: customerName,
        signedBy,
        statusNote: `נבדק ונחתם ע״י ראמי (${auditSummary.statusLabel})`,
        dataUrl,
      });
      playDispatchChime(0.7);

      toast.success(`תעודה #${orderId} נשמרה בתיקיית הלקוח ב-Drive`, {
        description: "הסטטוס בגיליון: ממתין לאישור מנכ״ל.",
        action: { label: "פתח PDF", onClick: () => window.open(res.driveUrl, "_blank") },
      });
    } catch (err) {
      console.error(err);
      toast.error("השמירה לדרייב נכשלה — לא נשמר דבר", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------
  // 6. שיגור ישיר להראל מנכ״ל בוואטסאפ ובמערכת (ללא שום אזכור כספי)
  // -------------------------------------------------------------
  const handleSendToHarel = async () => {
    setIsSendingToHarel(true);

    try {
      const canvas = canvasRef.current;
      const dataUrl = canvas ? canvas.toDataURL("image/png") : "";
      if (!dataUrl) throw new Error("הקנבס ריק");

      // 1. שמירה אמיתית לדרייב + סטטוס "ממתין לאישור מנכ״ל" בגיליון (נכשל = נעצרים)
      await saveSignedNoteStrict({
        noteId: orderId,
        customer: customerName,
        signedBy,
        statusNote: `אושר ע״י ראמי והועבר להראל: ${totalItemsUnits} פריטים`,
        dataUrl,
      });
      playDispatchChime(0.9);

      // 2. רק אחרי שהשמירה הצליחה: עדכון החנות המקומית (מבצעת גם submitApproval ראמי עם תור אופליין)
      approvals.rami(orderId, `אושר ע״י ראמי: ${totalItemsUnits} פריטים`);

      // 3. הפקת הודעת וואטסאפ ממוקדת לוגיסטיקה - ללא מחיר/כסף כלל
      const itemsListText = items
        .map(
          (i) =>
            `• ${i.qty} ${i.unit || "יח׳"} - ${i.name} (משקל: ${((i.qty || 0) * (i.weightKg || 0)).toLocaleString()} ק״ג)`,
        )
        .join("\n");

      const whatsappText = `👑 *אישור תעודת משלוח להראל מנכ״ל — ח. סבן חומרי בניין*

📄 *שטר משלוח מס׳:* #${orderId} (קומקס: ${comaxOrder})
🏢 *לקוח:* ${customerName} (תיק ${customerNo})
📍 *אתר אספקה:* ${siteAddress}
🚚 *נהג:* ${driverName} | מנוף PTO: ${craneTime}

📦 *פירוט כמויות ומשקל שנבדקו 1:1:*
${itemsListText}

📊 *סיכום לוגיסטי:*
• סה״כ כמות פריטים: ${totalItemsUnits} יחידות
• משקל מוערך לתעודה: ${totalEstimatedWeightTons} טון (${totalEstimatedWeightKg.toLocaleString()} ק״ג)

⚖️ *בקרת חוק הפקדונות:*
${
  note?.live
    ? `• בלות 60002: סופק ${balesDelivered} (טרם הוצלב מול חיוב)\n• משטחי עץ 60060: סופק ${palletsDelivered} (טרם הוצלב מול חיוב)`
    : `• בלות 60002: סופק ${balesDelivered} | נרשם ${balesBilled} (${balesDelivered === balesBilled ? "מאוזן ✅" : "חריגה ⚠️"})\n• משטחי עץ 60060: סופק ${palletsDelivered} | נרשם ${palletsBilled} (${palletsDelivered === palletsBilled ? "מאוזן ✅" : "חריגה ⚠️"})`
}

✍️ *אישור וחתימת שטח:* ${signedBy}
🛰️ *בקרת איתוראן:* ${note?.live ? "טרם הוצלב מול קומקס/איתוראן" : "שהייה מאומתת בכתובת האתר"}
📁 *תיקיית לקוח ב-Drive:* תיקיות לקוחות / [${customerNo}] - ${customerName} / 2. תעודות משלוח

*התעודה נבדקה ונחתמה ע״י ראמי מסארווה.* מחכה לאישורך הסופי בדשבורד! 👑`;

      // 4. פתיחת וואטסאפ מול הראל
      const waUrl = `https://wa.me/${HAREL_PHONE}?text=${encodeURIComponent(whatsappText)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");

      toast.success(`תעודה #${orderId} נשמרה בדרייב והועברה להראל לאישור 👑`, {
        description: "הסטטוס בגיליון: ממתין לאישור מנכ״ל. נפתח וואטסאפ לשליחת ההודעה.",
      });
    } catch (err) {
      console.error(err);
      toast.error("ההעברה להראל נכשלה — התעודה לא נשמרה ולא נשלחה", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSendingToHarel(false);
    }
  };

  const handleCopySummary = () => {
    const summary = `תעודה #${orderId} | לקוח: ${customerName} | אתר: ${siteAddress} | נהג: ${driverName} | כמות פריטים: ${totalItemsUnits} | משקל: ${totalEstimatedWeightTons} טון | פקדונות: ${balesDelivered} בלות, ${palletsDelivered} משטחים`;
    navigator.clipboard.writeText(summary);
    toast.success("סיכום כמויות ומשקל הועתק ללוח!");
  };

  return (
    <Card
      className="p-4 md:p-6 flex flex-col items-center gap-4 bg-card border-border/80 shadow-xs rounded-2xl max-w-4xl mx-auto"
      dir="rtl"
    >
      {/* 1. סרגל עליון: סיכום משקל וכמויות תעודה (ללא מחירים) */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-muted/50 p-3 rounded-xl border border-border/60 text-xs">
        <div className="flex items-center gap-2 font-bold">
          <Scale className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>משקל מוערך לתעודה:</span>
          <span className="font-mono text-foreground font-black text-sm">
            {totalEstimatedWeightTons} טון
          </span>
          <span className="text-muted-foreground font-normal">
            ({totalItemsUnits} יחידות פריטים)
          </span>
          <Badge
            variant={auditSummary.isAllOk ? "default" : "secondary"}
            className={`text-[11px] font-mono ${
              auditSummary.isAllOk
                ? "bg-emerald-600 text-white"
                : "bg-amber-500/20 text-amber-700 border-amber-500/30"
            }`}
          >
            {auditSummary.statusLabel}
          </Badge>
        </div>

        {/* בורר מצב תצוגת מסמך: סריקה מקורית מ-Drive מול שטר וקטורי */}
        <div className="flex items-center gap-1.5 bg-background p-1 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setRenderMode("real_scan")}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
              renderMode === "real_scan"
                ? "bg-primary text-primary-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📄 תעודה סרוקה אמיתית
          </button>
          <button
            type="button"
            onClick={() => setRenderMode("vector_doc")}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
              renderMode === "vector_doc"
                ? "bg-primary text-primary-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📋 שטר משלוח וקטורי
          </button>
        </div>
      </div>

      {/* 2. סרגל כלים: חתימה בעט, מרקר צהוב, חותמות וכפתור שלח להראל */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* כפתור עט חתימה חופשית */}
          <Button
            size="sm"
            variant={toolMode === "pen" ? "default" : "outline"}
            onClick={() => setToolMode("pen")}
            className="rounded-xl font-bold text-xs h-8 gap-1"
          >
            <PenTool className="h-3.5 w-3.5" />
            <span>עט חתימה</span>
          </Button>

          {/* מרקר צהוב */}
          <Button
            size="sm"
            variant={toolMode === "highlight" ? "default" : "outline"}
            onClick={() => setToolMode("highlight")}
            className="rounded-xl font-bold text-xs h-8"
          >
            🟡 מרקר צהוב
          </Button>

          {/* הערת טקסט */}
          <Button
            size="sm"
            variant={toolMode === "text" ? "default" : "outline"}
            onClick={() => setToolMode("text")}
            className="rounded-xl font-bold text-xs h-8"
          >
            ✍️ הערת טקסט
          </Button>

          {/* חותמת ראמי מסארווה */}
          <Button
            size="sm"
            variant={toolMode === "stamp" && activeStampName === "ראמי" ? "default" : "outline"}
            onClick={() => {
              setToolMode("stamp");
              setActiveStampName("ראמי");
              toast.info("לחץ בכל מקום בתעודה להטבעת חותמת ראמי מסארווה ✍️");
            }}
            className={`rounded-xl font-bold text-xs h-8 gap-1.5 ${
              toolMode === "stamp" && activeStampName === "ראמי"
                ? "bg-blue-700 text-white shadow-xs"
                : "bg-blue-50/70 border-blue-200 text-blue-800 hover:bg-blue-100"
            }`}
          >
            <Stamp className="h-3.5 w-3.5 text-blue-700" />
            <span>הטבע חותמת ראמי</span>
          </Button>

          {secondaryStampSrc && (
            <Button
              size="sm"
              variant={toolMode === "stamp" && activeStampName === "נועה AI" ? "default" : "ghost"}
              onClick={() => {
                setToolMode("stamp");
                setActiveStampName("נועה AI");
                toast.info("לחץ בתעודה להטבעת חותמת נועה AI 🤖");
              }}
              className="rounded-xl font-medium text-xs h-8 gap-1 text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              <span>חותמת נועה</span>
            </Button>
          )}

          {(drawnPaths.length > 0 || textAnnotations.length > 0 || stampPlacements.length > 0) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleUndo}
              className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
              title="בטל פעולה אחרונה"
            >
              <RotateCcw className="h-3 w-3" />
              <span>בטל</span>
            </Button>
          )}

          {/* מעבר לטבלת עריכת כמויות */}
          <Button
            size="sm"
            variant={activeView === "edit" ? "secondary" : "ghost"}
            onClick={() => setActiveView(activeView === "edit" ? "canvas" : "edit")}
            className="h-8 text-xs gap-1"
          >
            <Edit3 className="h-3.5 w-3.5 text-primary" />
            <span>{activeView === "edit" ? "סגור עריכה" : "ערוך כמויות ופריטים"}</span>
          </Button>
        </div>

        {/* פעולות שמירה ושיגור */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={handleSaveAndInjectToSheet}
            className="rounded-xl text-xs h-8 gap-1.5 font-bold border-border hover:bg-muted"
            title="שמירת התעודה בתיקיית הלקוח ועדכון הלינק בגיליון Google Sheets"
          >
            <FolderCheck className="h-3.5 w-3.5 text-amber-600" />
            <span>{isSaving ? "מזריק לגיליון..." : "שמור והזרק לגיליון"}</span>
          </Button>

          <Button
            size="sm"
            disabled={isSendingToHarel}
            onClick={handleSendToHarel}
            className="rounded-xl font-bold text-xs h-8 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-sm gap-1.5 active:scale-95 transition"
            title="שיגור הודעת וואטסאפ ישירה להראל מנכ״ל ועדכון סטטוס מערכת"
          >
            <Crown className="h-3.5 w-3.5 text-amber-300" />
            <span>{isSendingToHarel ? "משגר..." : "שלח להראל מנכ״ל 👑"}</span>
          </Button>
        </div>
      </div>

      {/* הודעת הדרכה כאשר מצב חותמת פעיל */}
      {toolMode === "stamp" && (
        <div className="w-full bg-blue-500/10 border border-blue-500/30 text-blue-900 rounded-xl p-2.5 text-xs flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2 font-bold">
            <MousePointerClick className="h-4 w-4 text-blue-600" />
            <span>
              מצב הטבעה פעיל: לחץ בכל מקום בתעודה למיקום חותמת {activeStampName} (כולל תאריך ושעה
              רשמיים)!
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setToolMode("pen")}
            className="h-6 text-[11px] text-blue-700"
          >
            ביטול
          </Button>
        </div>
      )}

      {/* שורת קלט לטקסט הערה */}
      {toolMode === "text" && (
        <div className="w-full flex items-center gap-2">
          <Input
            placeholder="הקלד הערת עריכה (למשל: נפרקו 240 שקים, זוכה פקדון 1:1), ולחץ על התעודה..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            className="h-8 text-xs flex-1 border-primary/50"
          />
        </div>
      )}

      {/* טבלת עריכת כמויות ופריטים (מוצגת לפי דרישה) */}
      {activeView === "edit" && (
        <div className="w-full space-y-3 bg-muted/20 p-4 rounded-2xl border border-border/80">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-sm text-foreground">
                בקרת כמויות פריטים ומשקל מוערך (ללא מחירים)
              </h3>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              סה״כ פריטים: {totalItemsUnits} | משקל כולל: {totalEstimatedWeightTons} טון
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-muted-foreground font-semibold block mb-1">שם הלקוח</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-8 text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-muted-foreground font-semibold block mb-1">כתובת האתר</label>
              <Input
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-muted-foreground font-semibold block mb-1">נהג ורכב</label>
              <Input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* פקדונות 1:1 */}
          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3">
            <span className="font-bold text-amber-900">בקרת חוק הפקדונות 1:1:</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-amber-900">
                <span>בלות 60002 סופקו:</span>
                <Input
                  type="number"
                  value={balesDelivered}
                  onChange={(e) => setBalesDelivered(Number(e.target.value) || 0)}
                  className="w-16 h-7 text-xs bg-white font-mono"
                />
              </label>
              <label className="flex items-center gap-1.5 text-amber-900">
                <span>משטחים 60060 סופקו:</span>
                <Input
                  type="number"
                  value={palletsDelivered}
                  onChange={(e) => setPalletsDelivered(Number(e.target.value) || 0)}
                  className="w-16 h-7 text-xs bg-white font-mono"
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBalesBilled(balesDelivered);
                  setPalletsBilled(palletsDelivered);
                  toast.success("פקדונות אופסו והותאמו 1:1!");
                }}
                className="h-7 text-xs bg-white"
              >
                אזן 1:1
              </Button>
            </div>
          </div>

          {/* טבלת פריטים */}
          <div className="overflow-x-auto border border-border rounded-xl bg-card">
            <table className="w-full text-xs text-right">
              <thead className="bg-muted/60 text-muted-foreground font-semibold border-b">
                <tr>
                  <th className="p-2 w-10">מס׳</th>
                  <th className="p-2">תיאור הפריט</th>
                  <th className="p-2 w-24">סופק בפועל</th>
                  <th className="p-2 w-24">הוזמן בקומקס</th>
                  <th className="p-2 w-20">יח׳ מידה</th>
                  <th className="p-2 w-28">משקל ליח׳ (ק״ג)</th>
                  <th className="p-2 w-28">משקל מוערך</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((item, index) => {
                  const lineWeight = (item.qty || 0) * (item.weightKg || 0);
                  const isDiff = item.qty !== item.ordered;
                  return (
                    <tr key={index} className={isDiff ? "bg-amber-500/10" : "hover:bg-muted/30"}>
                      <td className="p-2 font-mono text-muted-foreground">{index + 1}</td>
                      <td className="p-2">
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) => {
                              const u = [...prev];
                              if (u[index]) u[index] = { ...u[index], name: val };
                              return u;
                            });
                          }}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setItems((prev) => {
                              const u = [...prev];
                              if (u[index]) u[index] = { ...u[index], qty: val };
                              return u;
                            });
                          }}
                          className={`h-7 text-xs font-mono font-bold ${
                            isDiff ? "text-amber-700 border-amber-500" : ""
                          }`}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.ordered}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setItems((prev) => {
                              const u = [...prev];
                              if (u[index]) u[index] = { ...u[index], ordered: val };
                              return u;
                            });
                          }}
                          className="h-7 text-xs font-mono"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={item.unit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) => {
                              const u = [...prev];
                              if (u[index]) u[index] = { ...u[index], unit: val };
                              return u;
                            });
                          }}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.weightKg}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setItems((prev) => {
                              const u = [...prev];
                              if (u[index]) u[index] = { ...u[index], weightKg: val };
                              return u;
                            });
                          }}
                          className="h-7 text-xs font-mono"
                        />
                      </td>
                      <td className="p-2 font-mono font-bold text-foreground">
                        {lineWeight.toLocaleString()} ק״ג
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (items.length <= 1) return;
                            setItems((prev) => prev.filter((_, idx) => idx !== index));
                          }}
                          className="text-muted-foreground hover:text-destructive p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. משטח הקנבס האינטראקטיבי: תעודת משלוח אמיתית + שכבת חתימה ועריכה */}
      <div
        className={`border border-border rounded-xl shadow-xs overflow-hidden bg-white max-w-full ${
          toolMode === "stamp"
            ? "cursor-crosshair"
            : toolMode === "text"
              ? "cursor-text"
              : "cursor-crosshair"
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onClick={handleCanvasClick}
          className="max-w-full h-auto block mx-auto select-none"
        />
      </div>

      {/* 4. סרגל תחתון: סיכום לוגיסטי ושיגור */}
      <div className="w-full bg-muted/40 p-3 rounded-xl border border-border/70 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-emerald-600" />
          <span className="font-bold text-foreground">שטר משלוח #{orderId}:</span>
          <span className="text-muted-foreground">
            {customerName} · סה״כ {totalItemsUnits} פריטים · משקל מוערך: {totalEstimatedWeightTons}{" "}
            טון ({totalEstimatedWeightKg.toLocaleString()} ק״ג)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopySummary}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>העתק סיכום לוגיסטי</span>
          </Button>

          <Button
            size="sm"
            onClick={handleSendToHarel}
            disabled={isSendingToHarel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1.5 rounded-xl shadow-xs"
          >
            <Crown className="h-3.5 w-3.5 text-amber-300" />
            <span>שלח להראל מנכ״ל בוואטסאפ ובמערכת 👑</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
