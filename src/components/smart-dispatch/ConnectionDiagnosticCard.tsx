// src/components/smart-dispatch/ConnectionDiagnosticCard.tsx
// מסך אבחון שגיאת חיבור מעמיק ל-Google Apps Script לפי סעיף 2.4
// מוצג כאשר התשובה אינה JSON (HTML של התחברות, שגיאה או doGet לא תואם)

import { useState } from "react";
import {
  ServerCrash,
  RefreshCw,
  Trash2,
  ExternalLink,
  HelpCircle,
  Copy,
  Check,
  Globe,
  Radio,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { clearSmartDispatchCacheFn } from "@/lib/smart-dispatch/server-functions";
import type { ConnectionDiagnostic } from "@/lib/smart-dispatch/apps-script-contract";

interface ConnectionDiagnosticCardProps {
  diagnostic: ConnectionDiagnostic;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function ConnectionDiagnosticCard({
  diagnostic,
  onRetry,
  isRetrying = false,
}: ConnectionDiagnosticCardProps) {
  const [copied, setCopied] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(diagnostic.previewSnippet);
    setCopied(true);
    toast.success("פלט התשובה הועתק ללוח!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await clearSmartDispatchCacheFn();
      toast.success("מטמון השרת נוקה בהצלחה! מרענן נתונים...");
      onRetry();
    } catch {
      toast.error("כשל בניקוי המטמון");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8 space-y-6" dir="rtl">
      {/* כרטיס שגיאה ראשי עם צבעי אזהרה בולטים ומעוצבים */}
      <Card className="overflow-hidden border-2 border-red-500/40 bg-card shadow-xl rounded-3xl">
        <div className="bg-red-500/10 p-5 border-b border-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-red-500/20 text-red-600 flex items-center justify-center shrink-0">
              <ServerCrash className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-display font-extrabold text-red-950 dark:text-red-200">
                בעיית חיבור לשרת Apps Script
              </h2>
              <p className="text-xs text-red-800/80 dark:text-red-300">
                התקבלה תשובת HTML/אימות במקום פלט JSON תקין. אין הצגת נתוני דמה.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              disabled={isClearing || isRetrying}
              className="gap-1.5 rounded-xl text-xs font-semibold"
            >
              <Trash2 className={`h-3.5 w-3.5 ${isClearing ? "animate-spin" : ""}`} />
              <span>נקה cache</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="gap-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
              <span>בדוק שוב</span>
            </Button>
          </div>
        </div>

        <div className="p-5 md:p-6 space-y-5 text-xs">
          {/* מטא-דאטה טכני של החיבור */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-muted/50 p-3 border border-border/80 space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                <Globe className="h-3.5 w-3.5 text-primary" />
                מארח הכתובת (Host)
              </span>
              <p className="font-mono text-xs font-bold text-foreground truncate">
                {diagnostic.host || "script.google.com"}
              </p>
            </div>

            <div className="rounded-2xl bg-muted/50 p-3 border border-border/80 space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                <Radio className="h-3.5 w-3.5 text-primary" />
                סטטוס HTTP
              </span>
              <p className="font-mono text-xs font-bold text-foreground">
                <span className="inline-block px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-900 dark:text-amber-300 font-extrabold">
                  {diagnostic.httpStatus} {diagnostic.httpStatus === 200 ? "OK (HtmlOutput)" : ""}
                </span>
              </p>
            </div>

            <div className="rounded-2xl bg-muted/50 p-3 border border-border/80 space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-medium">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                סוג תוכן (Content-Type)
              </span>
              <p
                className="font-mono text-xs font-bold text-foreground truncate"
                title={diagnostic.contentType}
              >
                {diagnostic.contentType || "text/html"}
              </p>
            </div>
          </div>

          {/* 200 התווים הראשונים של התשובה */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <span>200 התווים הראשונים של תשובת השרת:</span>
              </span>
              <button
                type="button"
                onClick={handleCopySnippet}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{copied ? "הועתק!" : "העתק פלט"}</span>
              </button>
            </div>

            <div className="relative rounded-2xl bg-zinc-950 p-3.5 text-zinc-100 font-mono text-[11px] leading-relaxed overflow-x-auto border border-zinc-800 shadow-inner">
              <pre className="whitespace-pre-wrap break-all select-all font-mono">
                {diagnostic.previewSnippet || "אין תוכן זמין בתשובה"}
              </pre>
            </div>
          </div>

          {/* 3 הסיבות הנפוצות לפי סעיף 2.4 */}
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-bold text-sm">
              <HelpCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>3 הסיבות הנפוצות לבעיה והפתרון הנדרש:</span>
            </div>

            <ol className="space-y-2.5 text-xs text-amber-900/90 dark:text-amber-200/90 list-decimal pr-5">
              <li className="leading-relaxed">
                <strong>כתובת פריסה ישנה (Deployment URL):</strong>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  לאחר ביצוע שינוי קוד ב-Apps Script, יש לבצע <em>Deploy → New deployment</em>{" "}
                  ולוודא שה-URL המעודכן מוגדר ב-<code>APPS_SCRIPT_URL</code>.
                </div>
              </li>
              <li className="leading-relaxed">
                <strong>גישה לא מוגדרת ל-Anyone:</strong>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  בהגדרות הפריסה (Who has access), חובה לבחור <strong>"Anyone"</strong> (כולל
                  משתמשים אנונימיים), אחרת Google מקפיץ דף התחברות לחשבון (HTML).
                </div>
              </li>
              <li className="leading-relaxed">
                <strong>פונקציית doGet מחזירה HtmlService במקום JSON:</strong>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  קוד ה-Script חייב להחזיר:
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-amber-200/50 dark:bg-amber-950 font-mono text-[10px]">
                    ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON)
                  </code>
                </div>
              </li>
            </ol>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-muted-foreground border-t">
            <span>בדיקה בוצעה: {new Date(diagnostic.timestamp).toLocaleTimeString("he-IL")}</span>
            <a
              href="/status"
              className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
            >
              <span>מעבר לעמוד סטטוס חיבור ובדיקת בריאות מערכת</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
