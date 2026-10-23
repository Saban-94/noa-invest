import { Link, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode, useEffect } from "react";
import {
  Crown,
  FileText,
  Satellite,
  ClipboardList,
  MessageCircle,
  Users,
  Truck,
  Edit3,
  Send,
  Sparkles,
  Settings,
  RefreshCw,
  Server,
  Sun,
  Moon,
  Search,
} from "lucide-react";
import noa from "@/assets/noa.jpg";
import { PWAInstallButton } from "./PWAInstallButton";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";

import { playDispatchChime } from "@/lib/audio-alerts";
import { toast } from "sonner";
import { useApprovals } from "@/lib/store";
import { fetchLiveNotes } from "@/lib/api";
import { pingFn } from "@/lib/notes-api.functions";
import { type DeliveryNote } from "@/lib/data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DESKTOP_NAV = [
  { to: "/", label: "ראשי הראל", icon: Crown },
  { to: "/orders", label: "הזמנות בסידור", icon: ClipboardList },
  { to: "/notes", label: "תעודות משלוח", icon: FileText },
  { to: "/canvas", label: "עריכת תעודה (קנבס)", icon: Edit3 },
  { to: "/customers", label: "תיקי לקוחות", icon: Users },
  { to: "/ituran", label: " נתוני-איתורן", icon: Satellite },
  { to: "/chat", label: "צ'אט נועה AI", icon: MessageCircle },
  { to: "/inquiry", label: "בירור תעודות", icon: Search },
] as const;

const MOBILE_NAV = [
  { to: "/", label: "מצב", icon: Crown },
  { to: "/orders", label: "הזמנות", icon: Truck },
  { to: "/notes", label: "תעודות", icon: FileText },
  { to: "/canvas", label: "קנבס", icon: Edit3 },
  { to: "/inquiry", label: "בירור", icon: Search },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const approvalsState = useApprovals();
  const { theme, toggleTheme } = useTheme();
  
  const [isSidebarActive, setIsSidebarActive] = useState(false);
  
  // Interaction tracking (mouse/touch)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleInteraction = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsSidebarActive(true), 2000); // 2 seconds delay
    };

    window.addEventListener("mousemove", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    return () => {
      window.removeEventListener("mousemove", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
      clearTimeout(timeout);
    };
  }, []);

  const [quickInput, setQuickInput] = useState("");
  const [quickMessages, setQuickMessages] = useState<
    { sender: "noa" | "user"; text: string; time: string }[]
  >([
    {
      sender: "noa",
      text: "בוקר טוב ראמי והראל! 🚚 כל 5 המשאיות שובצו. מחכה לבדיקת 3 תעודות מול איתוראן.",
      time: "07:45",
    },
  ]);

  const active = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  const triggerHaptic = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(20);
    }
  };

  const handleSendQuickNoa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    const now = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const userText = quickInput;
    setQuickMessages((prev) => [...prev, { sender: "user", text: userText, time: now }]);
    setQuickInput("");
    void playDispatchChime(0.7);

    setTimeout(() => {
      const response = userText.includes("חכמת")
        ? "חכמת סיים פריקה בנח 3 ת״א (38 דק׳ שהייה). בדרך למחסן 4 החרש 10 להעמסה הבאה 🟢"
        : userText.includes("עלי")
          ? "עלי פלטה סיים הוד השרון, בנסיעה לכיוון יפו אספקה שנייה 🚚"
          : "ההודעה תועדה ביומן הסידור! תעודות משלוח עדכניות ממתינות לאישור הראל ✍️";
      setQuickMessages((prev) => [
        ...prev,
        {
          sender: "noa",
          text: response,
          time: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      void playDispatchChime(0.8);
    }, 600);
  };

  const { data: notes } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-appshell"],
    queryFn: fetchLiveNotes,
    staleTime: 30000,
  });

  const notesList = notes || [];

  const readyNotesCount = notesList.filter(
    (n) =>
      n.billingStatus === "ממתין לאישור מנכ״ל" ||
      (approvalsState[n.id]?.rami && !approvalsState[n.id]?.harel),
  ).length;

  const {
    data: pingData,
    isLoading: isPingLoading,
    isError: isPingError,
    refetch: refetchPing,
  } = useQuery({
    queryKey: ["apps-script-ping"],
    queryFn: async () => {
      return await pingFn();
    },
    staleTime: 60000,
    retry: 1,
  });

  return (
    <div className={`flex min-h-dvh ${isSidebarActive ? "bg-background" : "bg-background"}`}>
      {/* 1. Desktop Right Sidebar */}
      <aside className={`sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-l border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex transition-all ${isSidebarActive ? "opacity-100" : "opacity-90"}`}>
        <div>
          <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border/40">
            <div className="relative">
              <img
                src={noa}
                alt="נועה AI"
                width={44}
                height={44}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-emerald-500 shadow-sm"
              />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            </div>
            <div>
              <div className="font-display text-base font-bold leading-tight">Saban Flow</div>
              <div className="text-[11px] text-sidebar-foreground/70">
                ח. סבן · לוגיסטיקה ללא נייר
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1 px-3 py-4">
            {DESKTOP_NAV.map(({ to, label, icon: I }) => {
              const isCurrent = active(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
                    isCurrent
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                      : "opacity-75 hover:bg-sidebar-accent/50 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <I className={`h-4.5 w-4.5 ${isCurrent ? "text-sidebar-primary" : ""}`} />
                    <span>{label}</span>
                  </div>
                  {to === "/" && readyNotesCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ceo text-[10px] font-bold text-white">
                      {readyNotesCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-sidebar-border/40 space-y-2">
          <button 
            onClick={toggleTheme}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-bold opacity-75 hover:opacity-100 hover:bg-sidebar-accent/50"
          >
            <div className="flex items-center gap-2">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span>{theme === "light" ? "מצב כהה" : "מצב בהיר"}</span>
            </div>
          </button>
          <PWAInstallButton variant="nav" />

          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold opacity-75 hover:opacity-100 hover:bg-sidebar-accent/40 transition"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5 text-sidebar-foreground/70" />
                  <span>הגדרות ואבחון</span>
                </div>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    isPingLoading
                      ? "bg-muted text-muted-foreground"
                      : isPingError
                        ? "bg-red-500/20 text-red-700"
                        : "bg-emerald-500/20 text-emerald-800"
                  }`}
                >
                  {isPingLoading ? "..." : isPingError ? "שגיאה" : pingData?.version || "פעיל"}
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md" dir="rtl">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2 text-base font-bold">
                    <Server className="h-4 w-4 text-primary" />
                    <span>אבחון שרת והגדרות מערכת</span>
                  </DialogTitle>
                  <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
                    {isPingLoading
                      ? "טוען..."
                      : isPingError
                        ? "אין חיבור"
                        : `גרסה: ${pingData?.version || "פעיל"}`}
                  </span>
                </div>
                <DialogDescription className="text-xs text-muted-foreground pt-1">
                  חיבור בזמן אמת ל-Google Apps Script ו-Google Sheets
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 pt-3 text-xs">
                <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">סטטוס שרת Apps Script:</span>
                    <span className="font-bold flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isPingLoading
                            ? "bg-amber-500 animate-pulse"
                            : isPingError
                              ? "bg-red-500"
                              : "bg-emerald-500"
                        }`}
                      />
                      <span>
                        {isPingLoading
                          ? "בודק קישוריות..."
                          : isPingError
                            ? "מנותק (שגיאת חיבור)"
                            : "מחובר ותקין"}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">גרסת שרת (GAS version):</span>
                    <span className="font-mono font-bold text-foreground">
                      {isPingLoading ? "בבדיקה..." : pingData?.version || "לא זמין"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">מזהה גיליון ראשי (Master):</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      1u1NiB7...Z9Go
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void refetchPing();
                      toast.info("מבצע בדיקת חיבור מול השרת...");
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>בדוק חיבור שוב</span>
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="px-2 pt-1 text-[10px] opacity-60 text-center">
            ח. סבן חומרי בניין (1994) בע״מ
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>

      <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 flex-col border-r border-border/70 bg-card p-4 xl:flex">
        <div className="flex items-center justify-between border-b pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <img
                src={noa}
                alt="נועה AI"
                className="h-10 w-10 rounded-full object-cover ring-2 ring-emerald-500"
              />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
            </div>
            <div>
              <div className="font-display text-xs font-extrabold flex items-center gap-1">
                <span>נועה ❤️</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  | יד ימינו של ראמי
                </span>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>סדרנית מחוברת לפקודות</span>
              </div>
            </div>
          </div>

          <Link
            to="/chat"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition"
            title="פתח צ'אט מלא"
          >
            <Sparkles className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-3 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1 text-xs">
            {quickMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === "user" ? "items-start" : "items-end"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-xs ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-xs"
                      : "bg-muted/80 text-foreground rounded-bl-xs border border-border/50"
                  }`}
                >
                  {msg.text}
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground px-1">{msg.time}</span>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSendQuickNoa}
            className="mt-2 pt-2 border-t flex items-center gap-1.5"
          >
            <input
              type="text"
              placeholder="שאל את נועה (למשל: איפה חכמת?)..."
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              className="flex-1 rounded-xl bg-muted/60 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button
              type="submit"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </aside>

      <nav className="glass fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/70 pb-safe md:hidden shadow-lg backdrop-blur-md">
        {MOBILE_NAV.map(({ to, label, icon: I }) => {
          const isCurrent = active(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={triggerHaptic}
              className={`flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-bold transition active:scale-95 ${
                isCurrent ? "text-primary" : "text-muted-foreground/80 hover:text-foreground"
              }`}
            >
              <div className="relative">
                <I className={`h-5.5 w-5.5 ${isCurrent ? "stroke-[2.5]" : "stroke-2"}`} />
                {to === "/" && readyNotesCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-ceo text-[9px] font-extrabold text-white">
                    {readyNotesCount}
                  </span>
                )}
              </div>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="pt-safe sticky top-0 z-30 glass border-b border-border/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 md:px-8">
        <div>
          <h1 className="text-xl font-bold md:text-2xl text-foreground">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <div className="md:hidden">
            <PWAInstallButton variant="compact" />
          </div>
        </div>
      </div>
    </header>
  );
}

export function StatusPill({ s }: { s: "ok" | "warn" | "fail" }) {
  const m = {
    ok: ["bg-emerald-500/15 text-emerald-700 border border-emerald-500/30", "🟢 מאומת 100%"],
    warn: ["bg-amber-500/20 text-amber-800 border border-amber-500/40", "⚠️ חריגה"],
    fail: ["bg-destructive/15 text-destructive border border-destructive/30", "🔴 נכשל"],
  }[s];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${m[0]}`}
    >
      {m[1]}
    </span>
  );
}
