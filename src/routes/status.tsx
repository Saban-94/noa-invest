// src/routes/status.tsx
// עמוד /status – בדיקת health, זמן תגובה, מספר שורות בכל טאב, תאריך נתון אחרון ואבחון תקשורת

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  RefreshCw,
  Clock,
  Database,
  Trash2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { SmartDispatchNav } from "@/components/smart-dispatch/SmartDispatchNav";
import { ConnectionDiagnosticCard } from "@/components/smart-dispatch/ConnectionDiagnosticCard";
import {
  getSmartDispatchHealthFn,
  clearSmartDispatchCacheFn,
} from "@/lib/smart-dispatch/server-functions";
import { useState } from "react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "סטטוס חיבור ובריאות שרת — סידור חכם ח. סבן" },
      { name: "description", content: "אבחון תקשורת בזמן אמת מול Google Apps Script וגיליון סבן." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const [isClearing, setIsClearing] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["smart-dispatch-health"],
    queryFn: async () => {
      const res = await getSmartDispatchHealthFn();
      return res;
    },
    staleTime: 30000,
    retry: 1,
  });

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await clearSmartDispatchCacheFn();
      toast.success("מטמון השרת נוקה! מרענן בדיקת בריאות...");
      void refetch();
    } catch {
      toast.error("כשל בניקוי מטמון");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SmartDispatchNav />

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
          <div>
            <h1 className="text-2xl font-display font-extrabold text-foreground flex items-center gap-2.5">
              <Activity className="h-6 w-6 text-primary" />
              <span>סטטוס חיבור ובריאות שרת Apps Script</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              בדיקת זמני תגובה, תקינות JSON, ספירת שורות בכל טאב ותאריך העדכון האחרון בגיליון
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearCache}
              disabled={isClearing || isFetching}
              className="gap-1.5 rounded-xl text-xs font-semibold"
            >
              <Trash2 className={`h-3.5 w-3.5 ${isClearing ? "animate-spin" : ""}`} />
              <span>נקה cache</span>
            </Button>

            <Button
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 rounded-xl text-xs font-bold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>בדוק עכשיו</span>
            </Button>
          </div>
        </div>

        {/* מצב טעינה */}
        {isLoading && (
          <div className="p-16 text-center space-y-3">
            <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto" />
            <p className="text-sm font-bold text-foreground">בודק תקשורת מול Apps Script...</p>
            <p className="text-xs text-muted-foreground">שליחת בקשת health ובדיקת פורמט ה-JSON</p>
          </div>
        )}

        {/* שגיאת תקשורת / פלט HTML לא תקין לפי סעיף 2.4 */}
        {!isLoading && data && !data.success && (
          <ConnectionDiagnosticCard
            diagnostic={data.diagnostic}
            onRetry={() => refetch()}
            isRetrying={isFetching}
          />
        )}

        {/* כשל כללי */}
        {!isLoading && error && (
          <Card className="p-6 border-red-500/40 bg-red-500/5 text-center space-y-3 rounded-3xl">
            <AlertTriangle className="h-10 w-10 text-red-600 mx-auto" />
            <h3 className="font-bold text-base text-red-950 dark:text-red-200">
              כשל בבדיקת הבריאות
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button size="sm" onClick={() => refetch()} className="gap-1.5 rounded-xl">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>נסה שוב</span>
            </Button>
          </Card>
        )}

        {/* הצלחה: הצגת כל המדדים והשורות בכל טאב לפי סעיף 2.5 */}
        {!isLoading && data && data.success && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* כרטיס סטטוס ירוק */}
            <div className="rounded-3xl bg-emerald-500/10 border border-emerald-500/30 p-5 flex items-center justify-between text-emerald-950 dark:text-emerald-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-base">חיבור תקין ופעיל ל-Google Apps Script</h3>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    השרת מגיב בפורמט JSON תקני וכל הטאבים זמינים לקריאה ולכתיבה.
                  </p>
                </div>
              </div>

              <div className="text-left font-mono text-xs">
                <div className="font-bold">{data.data.host}</div>
                <div className="text-emerald-700 dark:text-emerald-400">
                  זמן תגובה: {data.data.responseTimeMs}ms
                </div>
              </div>
            </div>

            {/* מדדים מרכזיים */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold">
                  <Clock className="h-4 w-4 text-primary" />
                  זמן תגובה לשרת
                </div>
                <div className="text-2xl font-display font-extrabold text-foreground">
                  {data.data.responseTimeMs}{" "}
                  <span className="text-sm font-normal text-muted-foreground">מילישניות</span>
                </div>
              </Card>

              <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold">
                  <Server className="h-4 w-4 text-cyan-600" />
                  מארח השרת
                </div>
                <div
                  className="text-sm font-mono font-bold text-foreground truncate"
                  title={data.data.host}
                >
                  {data.data.host}
                </div>
              </Card>

              <Card className="p-4 rounded-3xl border border-border shadow-xs space-y-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 font-semibold">
                  <Calendar className="h-4 w-4 text-amber-600" />
                  תאריך נתון אחרון בגיליון
                </div>
                <div className="text-base font-display font-extrabold text-foreground">
                  {data.data.lastDataDate || "מעודכן להיום"}
                </div>
              </Card>
            </div>

            {/* מספר שורות בכל טאב בגיליון */}
            <Card className="p-6 rounded-3xl border border-border shadow-card space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  <h3 className="font-display font-bold text-base text-foreground">
                    מספר שורות לפי טאבים בגיליון (כותרות שורה 1)
                  </h3>
                </div>
                <span className="text-xs font-mono text-muted-foreground">Google Sheets API</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1">
                  <div className="text-muted-foreground font-semibold">ארכיון_טכוגרף</div>
                  <div className="text-xl font-display font-extrabold text-foreground">
                    {data.data.tabRowCounts.discs}{" "}
                    <span className="text-xs text-muted-foreground font-normal">שורות</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1">
                  <div className="text-muted-foreground font-semibold">היסטוריית_ביקורים</div>
                  <div className="text-xl font-display font-extrabold text-foreground">
                    {data.data.tabRowCounts.visits}{" "}
                    <span className="text-xs text-muted-foreground font-normal">שורות</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1">
                  <div className="text-muted-foreground font-semibold">אתרי_לקוחות</div>
                  <div className="text-xl font-display font-extrabold text-foreground">
                    {data.data.tabRowCounts.sites}{" "}
                    <span className="text-xs text-muted-foreground font-normal">שורות</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-1">
                  <div className="text-muted-foreground font-semibold">סיכום_ערים</div>
                  <div className="text-xl font-display font-extrabold text-foreground">
                    {data.data.tabRowCounts.cities}{" "}
                    <span className="text-xs text-muted-foreground font-normal">שורות</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
