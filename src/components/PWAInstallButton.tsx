import { useState } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, Share2, CheckCircle2, X } from "lucide-react";

export function PWAInstallButton({
  variant = "default",
}: {
  variant?: "default" | "compact" | "nav";
}) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === "nav") {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 opacity-80">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>מותקן כאפליקציה</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // In Chromium / desktop when prompt isn't triggered yet
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === "nav" ? (
        <button
          onClick={handleInstallClick}
          className="flex w-full items-center gap-2.5 rounded-xl bg-blue-600/20 px-3.5 py-2.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-600/30"
          title="התקנת Saban Flow כאפליקציית מובייל / דסקטופ"
        >
          <Download className="h-4 w-4 text-blue-400" />
          <span>התקן אפליקציה (PWA)</span>
        </button>
      ) : variant === "compact" ? (
        <button
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition"
        >
          <Download className="h-3.5 w-3.5" />
          <span>התקנה</span>
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition active:scale-95"
        >
          <Download className="h-4 w-4" />
          <span>התקן Saban Flow</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-sm rounded-3xl bg-card p-6 text-card-foreground shadow-2xl border border-border">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute left-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Download className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">התקנת Saban Flow</h3>
                <p className="text-xs text-muted-foreground">התקנה מהירה למסך הבית</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm text-foreground/90">
              <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-xs text-primary-foreground">
                  1
                </span>
                <p className="text-xs leading-relaxed">
                  לחצו על כפתור <strong>השיתוף (Share)</strong>{" "}
                  <Share2 className="inline h-3.5 w-3.5 mx-1" /> בסרגל התחתון של Safari בדפדפן.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-xs text-primary-foreground">
                  2
                </span>
                <p className="text-xs leading-relaxed">
                  גללו מטה ובחרו באפשרות <strong>״הוסף למסך הבית״ (Add to Home Screen)</strong>.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-xs text-primary-foreground">
                  3
                </span>
                <p className="text-xs leading-relaxed">
                  פתחו את Saban Flow ישירות ממסך הבית לקבלת חווית אפליקציה מלאה, מסך מלא וצלצולי
                  התראה.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm"
            >
              הבנתי, תודה
            </button>
          </div>
        </div>
      )}
    </>
  );
}
