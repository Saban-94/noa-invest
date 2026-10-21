// src/components/smart-dispatch/TachographViewer.tsx
// תצוגה אינטראקטיבית של דיסקית טכוגרף מעגלית
// כולל: זום, סיבוב, נגטיב, ניגודיות וטעינה ישירה מ-image לפי _link

import { useState } from "react";
import {
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Contrast,
  Sun,
  Eye,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TachographViewerProps {
  imageSrc?: string;
  isLoading?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  discTitle?: string;
}

export function TachographViewer({
  imageSrc,
  isLoading = false,
  errorMessage,
  onRetry,
  discTitle = "דיסקית טכוגרף",
}: TachographViewerProps) {
  const [rotation, setRotation] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [isNegative, setIsNegative] = useState<boolean>(false);
  const [contrastBoost, setContrastBoost] = useState<boolean>(false);

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.3, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.3, 0.7));
  };

  const handleReset = () => {
    setRotation(0);
    setZoom(1);
    setIsNegative(false);
    setContrastBoost(false);
  };

  return (
    <div className="flex flex-col h-full rounded-3xl bg-zinc-950 text-white overflow-hidden border border-zinc-800 shadow-xl select-none">
      {/* סרגל כלי תמונה עליון */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-emerald-400" />
          <span className="font-bold truncate max-w-[200px]">{discTitle}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRotate}
            className="h-8 px-2.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl"
            title="סובב 90 מעלות עם כיוון השעון"
          >
            <RotateCw className="h-3.5 w-3.5 ml-1" />
            <span>סובב</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsNegative((prev) => !prev)}
            className={`h-8 px-2.5 rounded-xl transition ${
              isNegative
                ? "bg-amber-500/20 text-amber-300"
                : "text-zinc-300 hover:text-white hover:bg-zinc-800"
            }`}
            title="היפוך צבעים (נגטיב לחשיפת חריטות מחט)"
          >
            <Contrast className="h-3.5 w-3.5 ml-1" />
            <span>נגטיב</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setContrastBoost((prev) => !prev)}
            className={`h-8 px-2.5 rounded-xl transition ${
              contrastBoost
                ? "bg-emerald-500/20 text-emerald-300"
                : "text-zinc-300 hover:text-white hover:bg-zinc-800"
            }`}
            title="הגברת ניגודיות להדגשת קווי עבודה ונסיעה"
          >
            <Sun className="h-3.5 w-3.5 ml-1" />
            <span>ניגודיות</span>
          </Button>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomIn}
            className="h-8 w-8 p-0 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl"
            title="הגדל זום"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomOut}
            className="h-8 w-8 p-0 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl"
            title="הקטן זום"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl"
            title="איפוס תצוגה"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* אזור הצגת הדיסקית */}
      <div className="relative flex-1 min-h-[460px] md:min-h-[580px] flex items-center justify-center p-4 bg-zinc-950 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center text-zinc-400">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
            <p className="text-sm font-semibold">טוען סריקת דיסקית מ-Google Drive...</p>
            <p className="text-xs text-zinc-500">שליפת תמונה ברזולוציה מלאה ללא כיווץ</p>
          </div>
        ) : errorMessage || !imageSrc ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center text-zinc-400 p-6 max-w-md">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm font-bold text-zinc-200">
              {errorMessage || "לא נמצאה סריקת דיסקית לתאריך ולמשאית זו"}
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              ודא שקיים קישור בעמודה "קישור לדיסקית" בטאב ארכיון_טכוגרף ושניתנה הרשאת קריאה בקובץ
              ה-Drive.
            </p>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="mt-2 text-xs">
                נסה שוב
              </Button>
            )}
          </div>
        ) : (
          <div className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden">
            <img
              src={imageSrc}
              alt={discTitle}
              referrerPolicy="no-referrer"
              className="max-h-[520px] max-w-full object-contain rounded-2xl transition-transform duration-300 ease-out"
              style={{
                transform: `rotate(${rotation}deg) scale(${zoom})`,
                filter:
                  `${isNegative ? "invert(1)" : ""} ${contrastBoost ? "contrast(180%) brightness(110%)" : ""}`.trim() ||
                  undefined,
              }}
            />
          </div>
        )}

        {/* שכבת מחוון רמת זום בפינה */}
        {zoom !== 1 && (
          <div className="absolute bottom-3 left-3 bg-zinc-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-mono text-zinc-300 border border-zinc-700">
            זום: {(zoom * 100).toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  );
}
