import { useRef, useEffect, useState, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sun,
  Maximize2,
  RefreshCw,
  Layers,
  Crosshair,
} from "lucide-react";
import tachographDiscImg from "@/assets/images/tachograph_disc_scan_1792629364395.jpg";

export interface TachographStopOverlay {
  id: string;
  label: string;
  address: string;
  arriveTime?: string; // e.g. "09:15"
  departTime?: string; // e.g. "10:00"
  ptoOpen?: string; // e.g. "09:20"
  ptoClose?: string; // e.g. "09:58"
  ptoMin?: number;
}

interface TachographCanvasViewerProps {
  imageUrl?: string;
  driver?: string;
  truck?: string;
  date?: string;
  kmTotal?: string;
  ptoHours?: string;
  stops?: TachographStopOverlay[];
  height?: number | string;
  compact?: boolean;
}

export function TachographCanvasViewer({
  imageUrl = tachographDiscImg,
  driver = "חכמת גאבר",
  truck = "615-41-002",
  date = "15/10/2026",
  kmTotal = "140",
  ptoHours = "02:15",
  stops = [],
  height = 360,
  compact = false,
}: TachographCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport transformation state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isInverted, setIsInverted] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [showRadialOverlay, setShowRadialOverlay] = useState(true);

  // Drag interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Loaded image cache
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl || tachographDiscImg;
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      // Fallback to local high-res disc scan
      const fallback = new Image();
      fallback.src = tachographDiscImg;
      fallback.onload = () => {
        imgRef.current = fallback;
        setImageLoaded(true);
      };
    };
  }, [imageUrl]);

  // Convert "HH:mm" to hour float (0 - 24)
  const timeToHour = (t?: string): number | null => {
    if (!t) return null;
    const m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1]!, 10) + parseInt(m[2]!, 10) / 60;
  };

  // Convert hour (0 - 24) to angle in radians. 00:00 is top ( -PI/2 )
  const hourToAngle = (h: number): number => {
    return (h / 24) * 2 * Math.PI - Math.PI / 2;
  };

  // Render canvas loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.save();

    // Center and apply pan & zoom & rotation
    ctx.translate(width / 2 + position.x, height / 2 + position.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);

    // Apply negative & contrast filters
    const filters: string[] = [];
    if (isInverted) filters.push("invert(100%)");
    if (highContrast) filters.push("contrast(160%) brightness(110%)");
    ctx.filter = filters.length > 0 ? filters.join(" ") : "none";

    // Draw the tachograph disk
    if (imgRef.current && imageLoaded) {
      const img = imgRef.current;
      const size = Math.min(width, height) * 0.88;
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    }

    // Reset filter for vector overlays
    ctx.filter = "none";

    // Draw 24-Hour Radial Activity Ring if enabled
    if (showRadialOverlay) {
      const radius = (Math.min(width, height) * 0.88) / 2;
      const ringR = radius * 0.94;
      const ringWidth = Math.max(14, ringR * 0.12);

      // Background clock ring track
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.lineWidth = ringWidth;
      ctx.strokeStyle = "rgba(34, 50, 70, 0.4)";
      ctx.stroke();

      // Render hours ticks
      for (let h = 0; h < 24; h += 2) {
        const angle = hourToAngle(h);
        const innerX = (ringR - ringWidth / 2 - 2) * Math.cos(angle);
        const innerY = (ringR - ringWidth / 2 - 2) * Math.sin(angle);
        const outerX = (ringR + ringWidth / 2 + 3) * Math.cos(angle);
        const outerY = (ringR + ringWidth / 2 + 3) * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(innerX, innerY);
        ctx.lineTo(outerX, outerY);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.stroke();

        // Hour labels
        const textR = ringR + ringWidth / 2 + 12;
        const textX = textR * Math.cos(angle);
        const textY = textR * Math.sin(angle);
        ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
        ctx.font = "bold 9px Heebo, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${h}:00`, textX, textY);
      }

      // Draw Ituran Stop Arcs and PTO Arcs
      stops.forEach((stop, idx) => {
        const arrHour = timeToHour(stop.arriveTime);
        const depHour = timeToHour(stop.departTime);

        if (arrHour != null && depHour != null) {
          const startAngle = hourToAngle(arrHour);
          const endAngle = hourToAngle(depHour);

          // Station stop arc (Emerald green)
          ctx.beginPath();
          ctx.arc(0, 0, ringR, startAngle, endAngle);
          ctx.lineWidth = ringWidth;
          ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
          ctx.stroke();

          // Marker number
          const midAngle = (startAngle + endAngle) / 2;
          const mx = ringR * Math.cos(midAngle);
          const my = ringR * Math.sin(midAngle);

          ctx.beginPath();
          ctx.arc(mx, my, 8, 0, Math.PI * 2);
          ctx.fillStyle = "#0f172a";
          ctx.fill();
          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#10b981";
          ctx.font = "bold 9px Heebo, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(idx + 1), mx, my);
        }

        // PTO active arc (Amber / Orange)
        const ptoOpen = timeToHour(stop.ptoOpen);
        const ptoClose = timeToHour(stop.ptoClose);
        if (ptoOpen != null && ptoClose != null) {
          const ptoStart = hourToAngle(ptoOpen);
          const ptoEnd = hourToAngle(ptoClose);

          ctx.beginPath();
          ctx.arc(0, 0, ringR, ptoStart, ptoEnd);
          ctx.lineWidth = ringWidth * 0.65;
          ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
          ctx.stroke();
        }
      });
    }

    ctx.restore();
  }, [position, rotation, scale, isInverted, highContrast, showRadialOverlay, imageLoaded, stops]);

  // Synchronize canvas dimensions with client rect
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse / Touch Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    setScale((prev) => Math.min(Math.max(prev * zoomFactor, 0.5), 5));
  };

  const resetTransform = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-[#223246] bg-[#131c26] overflow-hidden text-slate-100 shadow-xl">
      {/* Viewer Header */}
      <div className="flex items-center justify-between border-b border-[#223246] px-3.5 py-2.5 bg-[#0e1620]">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-xs tracking-wide">
            קנבס דיסקית טכוגרף · {driver} ({truck})
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
          <span>{date}</span>
          <span>·</span>
          <span>{kmTotal} ק״מ</span>
          {ptoHours && (
            <>
              <span>·</span>
              <span className="text-amber-400 font-medium">PTO: {ptoHours}</span>
            </>
          )}
        </div>
      </div>

      {/* Floating Canvas Toolbar */}
      <div className="flex items-center justify-between gap-1 border-b border-[#223246] px-3 py-1.5 bg-[#172230] text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.min(s + 0.25, 4.5))}
            className="p-1.5 rounded-lg hover:bg-[#223246] text-slate-300 hover:text-white transition"
            title="הגדל (Zoom In)"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s - 0.25, 0.6))}
            className="p-1.5 rounded-lg hover:bg-[#223246] text-slate-300 hover:text-white transition"
            title="הקטן (Zoom Out)"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-1.5 rounded-lg hover:bg-[#223246] text-slate-300 hover:text-white transition"
            title="סובב 90°"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={resetTransform}
            className="p-1.5 rounded-lg hover:bg-[#223246] text-slate-300 hover:text-white transition"
            title="אפס תצוגה"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsInverted((prev) => !prev)}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
              isInverted
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "hover:bg-[#223246] text-slate-300"
            }`}
            title="נגטיב לאבחון חריטות מחט"
          >
            <span className="flex items-center gap-1">
              <Sun className="h-3 w-3" />
              <span>נגטיב</span>
            </span>
          </button>

          <button
            onClick={() => setHighContrast((prev) => !prev)}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
              highContrast
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "hover:bg-[#223246] text-slate-300"
            }`}
            title="הדגשת חריטות מחט"
          >
            <span>חדות+</span>
          </button>

          <button
            onClick={() => setShowRadialOverlay((prev) => !prev)}
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
              showRadialOverlay
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                : "hover:bg-[#223246] text-slate-300"
            }`}
            title="שכבת 24H של איתוראן"
          >
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span>שכבת 24H</span>
            </span>
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport with Touch/Mouse Pan */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ height }}
        className="relative w-full cursor-grab active:cursor-grabbing bg-[#0b1118] overflow-hidden select-none"
      >
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

        {/* Legend */}
        {showRadialOverlay && (
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-3 rounded-lg bg-slate-950/80 px-2.5 py-1 text-[11px] backdrop-blur-md border border-slate-800 pointer-events-none">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>שהות באתר</span>
            </span>
            <span className="flex items-center gap-1.5 text-amber-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>פריקת מנוף PTO</span>
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 font-mono text-[10px]">
              זום: {Math.round(scale * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Synchronized Stop Timeline Footer (if stops provided) */}
      {stops.length > 0 && !compact && (
        <div className="border-t border-[#223246] p-2.5 bg-[#0e1620] space-y-1.5 max-h-36 overflow-y-auto">
          <div className="text-[11px] font-semibold text-slate-400">
            הצלבת תחנות איתוראן מול חריטות הדיסקית ({stops.length} תחנות):
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {stops.map((s, idx) => (
              <div
                key={s.id || idx}
                className="flex items-center justify-between text-xs px-2 py-1 rounded bg-[#172230]/70 border border-[#223246]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-slate-200">{s.address}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                  <span>
                    {s.arriveTime} - {s.departTime}
                  </span>
                  {s.ptoMin ? (
                    <span className="text-amber-400 font-semibold bg-amber-400/10 px-1 rounded">
                      PTO: {s.ptoMin} דק׳
                    </span>
                  ) : (
                    <span className="text-slate-500">ללא PTO</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
