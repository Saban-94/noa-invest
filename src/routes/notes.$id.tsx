import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  auditNote,
  noteItemsCount,
  noteWeightKg,
  noteWeightTons,
  type DeliveryNote,
} from "@/lib/data";
import { fetchLiveNotes, approveStrict } from "@/lib/api";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import { approvals, useApprovals } from "@/lib/store";
import { playUrgentSignatureAlarm, playDispatchChime } from "@/lib/audio-alerts";
import { PageHeader, StatusPill } from "@/components/AppShell";
import {
  ShieldCheck,
  Crown,
  Sparkles,
  Loader2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  PenTool,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InquiryThread } from "@/components/InquiryThread";
import { listWorkroomInquiriesFn, openOrCreateWorkroomTaskFn, ramiReplyFn } from "@/lib/inquiry-workflow.functions";
import type { WorkroomInquiry } from "@/lib/inquiry-workflow";
import { buildLogisticsFindings, isLogisticsAuditComplete } from "@/lib/logistics-audit";

export const Route = createFileRoute("/notes/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `תעודה ${params.id} — נועה ח. סבן` },
      { name: "description", content: "תצוגת תעודת משלוח עם שכבות בקרה וחותמות." },
      { property: "og:title", content: `תעודה ${params.id}` },
      { property: "og:description", content: "בקרת נועה AI, חותמת ראמי וחותמת מנכ״ל." },
    ],
  }),
  component: Viewer,
});

function Viewer() {
  const { id } = Route.useParams();
  const apState = useApprovals();

  const [customNote, setCustomNote] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [isApprovingRami, setIsApprovingRami] = useState(false);
  const [isApprovingHarel, setIsApprovingHarel] = useState(false);
  const [isOpeningTask, setIsOpeningTask] = useState(false);
  const [auditEvidence, setAuditEvidence] = useState<Record<string, string>>({});
  const [showAllAuditFindings, setShowAllAuditFindings] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`noa-logistics-audit:${id}`);
      setAuditEvidence(saved ? JSON.parse(saved) as Record<string, string> : {});
    } catch {
      setAuditEvidence({});
    }
  }, [id]);

  useEffect(() => {
    try {
      localStorage.setItem(`noa-logistics-audit:${id}`, JSON.stringify(auditEvidence));
    } catch {
      // Keep the gate active in memory if browser persistence is unavailable.
    }
  }, [id, auditEvidence]);
  const navigate = useNavigate();

  const workroomQuery = useQuery({
    queryKey: ["workroom", "note-thread", id],
    queryFn: listWorkroomInquiriesFn,
    staleTime: 20_000,
    retry: 1,
  });
  const relatedInquiry: WorkroomInquiry | undefined = workroomQuery.data?.inquiries.find(
    (item) => String(item.docNumber) === String(id) || String(item.id) === String(id) || String(item.task?.noteId || "") === String(id),
  );

  const handleOpenTask = async () => {
    setIsOpeningTask(true);
    try {
      await openOrCreateWorkroomTaskFn({
        data: {
          noteId: id,
          customer: n?.customer,
          customerNo: n?.customerNo,
          address: n?.siteAddress,
          driver: n?.driver,
          issue: customNote.trim() || n?.craneTime || "בדיקה וטיפול בתעודת המשלוח",
          fileId: n?.fileId,
          driveUrl: n?.driveUrl,
        },
      });
      await workroomQuery.refetch();
      await navigate({ to: "/inquiry", search: { task: id, tab: "tasks" } });
      toast.success(`נפתחה או אותרה משימה לתעודה ${id}`);
    } catch (err) {
      toast.error("לא ניתן לפתוח משימה לתעודה", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsOpeningTask(false);
    }
  };

  const handleThreadReply = async (text: string, replyToId?: string) => {
    if (!relatedInquiry) throw new Error("לא נמצא תיק בירור מקושר לתעודה זו");
    await ramiReplyFn({
      data: { inquiryId: relatedInquiry.id, noteId: id, text, replyToId },
    });
    await workroomQuery.refetch();
    toast.success("המענה נשמר בשרשור הבירור");
  };

  // 1. שליפת תעודות חיות מהגיליון לפי מזהה התעודה ללא נתוני דמה
  const {
    data: notes,
    isLoading,
    error,
    refetch,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes"],
    queryFn: fetchLiveNotes,
    staleTime: 30000,
  });

  const n = notes?.find((x) => x.id === id);

  // 2. טעינת הסריקה האמיתית מ-Google Drive דרך שרת Apps Script
  const {
    data: scanSrc,
    isLoading: isLoadingScan,
    error: scanError,
    refetch: refetchScan,
  } = useQuery({
    queryKey: ["scan", n?.fileId],
    enabled: !!n?.fileId,
    staleTime: Infinity,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: n!.fileId! } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] gap-3 p-6 text-center"
        dir="rtl"
      >
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <h2 className="text-lg font-bold">טוען תעודה מהגיליון...</h2>
        <p className="text-xs text-muted-foreground">מתחבר ל-Google Apps Script ללא נתוני דמה</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center"
        dir="rtl"
      >
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-lg font-bold text-destructive">שגיאה בטעינת התעודה מהגיליון</h2>
        <p className="text-xs text-muted-foreground max-w-md">
          {error instanceof Error ? error.message : "כשל בחיבור"}
        </p>
        <Button onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>נסה שוב</span>
        </Button>
      </div>
    );
  }

  if (!n) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center"
        dir="rtl"
      >
        <FileText className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-bold">תעודה #{id} לא נמצאה בגיליון</h2>
        <p className="text-xs text-muted-foreground">
          ייתכן שהתעודה טרם נסרקה או שמספרה שונה בגיליון Google Sheets
        </p>
        <Button asChild variant="outline">
          <Link to="/notes" className="gap-2">
            <ArrowRight className="h-4 w-4" />
            <span>חזרה לארכיון התעודות</span>
          </Link>
        </Button>
      </div>
    );
  }

  const ap = apState[n.id];
  const a = auditNote(n);
  const auditFindings = buildLogisticsFindings(n);
  const auditComplete = isLogisticsAuditComplete(auditFindings, auditEvidence);
  const auditEvidenceCount = auditFindings.filter((finding) => (auditEvidence[finding.id] || "").trim().length >= 12).length;

  const handleRamiApproval = async () => {
    if (!auditComplete) {
      toast.error("האישור נחסם: נדרשת השלמת בדיקת הלוגיסטיקה", {
        description: `תועדו אסמכתאות ל-${auditEvidenceCount} מתוך ${auditFindings.length} בדיקות.`,
      });
      return;
    }
    setIsApprovingRami(true);
    try {
      await approveStrict(n.id, "rami", customNote.trim() || undefined);
      approvals.rami(n.id, customNote.trim() || undefined);
      void playDispatchChime(0.85);
      toast.success(`ת.מ. ${n.id} נבדקה ואושרה אישית ע״י ראמי מסארווה ✍️`);
    } catch (err) {
      toast.error("אישור ראמי נדחה ע״י השרת", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsApprovingRami(false);
    }
  };

  const handleHarelApproval = async () => {
    if (!auditComplete) {
      toast.error("אישור מנכ״ל נחסם: הבדיקה הלוגיסטית לא הושלמה", {
        description: `תועדו אסמכתאות ל-${auditEvidenceCount} מתוך ${auditFindings.length} בדיקות.`,
      });
      return;
    }
    setIsApprovingHarel(true);
    try {
      await approveStrict(n.id, "harel", customNote.trim() || undefined);
      approvals.harel(n.id, customNote.trim() || undefined);
      playUrgentSignatureAlarm();
      setShowCelebration(true);
      toast.success(`ת.מ. ${n.id} אושרה סופית לחיוב ע״י מנכ״ל 👑`);
    } catch (err) {
      toast.error("אישור מנכ״ל נדחה ע״י השרת", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsApprovingHarel(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`ת.מ. ${n.id}`}
        subtitle={`${n.customer} · הזמנת קומקס #${n.comaxOrder || n.id}`}
        action={<StatusPill s={a.status} />}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        {/* כפתור מעבר מהיר לעריכת התעודה בקנבס */}
        <div className="flex items-center justify-between gap-3 bg-muted/40 p-3 rounded-2xl border border-border/70 text-xs">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-primary" />
            <span className="font-semibold">
              רוצה לחתום, להטביע חותמת או לסמן במרקר על גבי התעודה?
            </span>
          </div>
          <Button
            asChild
            size="sm"
            variant="default"
            className="gap-1.5 rounded-xl text-xs font-bold"
          >
            <Link to="/canvas" search={{ id: n.id }}>
              <PenTool className="h-3.5 w-3.5" />
              <span>פתח בעורך הקנבס</span>
            </Link>
          </Button>
        </div>

        <section className="rounded-3xl border border-amber-500/30 bg-card p-5 shadow-card space-y-4" aria-label="בקרת לוגיסטיקה של נועה">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div><h2 className="font-display text-base font-extrabold">🧠 בקרת לוגיסטיקה מלאה · נועה AI</h2><p className="mt-1 text-xs text-muted-foreground">כמויות, מק״טים, פיקדונות, שירותי הובלה ומקור התעודה — אין אישור לפני תיעוד כל בדיקה.</p></div>
            <span className={auditComplete ? "rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800" : "rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900"}>{auditComplete ? "כל הבדיקות תועדו" : `נדרשות אסמכתאות · ${auditEvidenceCount}/${auditFindings.length}`}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">שורות פריטים</p><p className="mt-1 text-xl font-extrabold">{n.items?.length || 0}</p></div>
            <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">בדיקות פיקדון</p><p className="mt-1 text-xl font-extrabold">60002 · 60060</p></div>
            <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">מקור וביצוע הובלה</p><p className="mt-1 text-sm font-extrabold">{n.comaxOrder ? `הזמנה ${n.comaxOrder}` : "מזהה הזמנה חסר"}</p></div>
          </div>
          <div className="space-y-3">
            {(showAllAuditFindings ? auditFindings : auditFindings.slice(0, 8)).map((finding) => {
              const evidence = auditEvidence[finding.id] || "";
              const documented = evidence.trim().length >= 12;
              return <div key={finding.id} className={`rounded-2xl border p-4 space-y-3 ${documented ? "border-emerald-300 bg-emerald-50/50" : "border-amber-300 bg-amber-50/40"}`}>
                <div className="flex items-start gap-3"><span className="mt-0.5 text-lg">{documented ? "✓" : "!"}</span><div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold">{finding.title}</h3><span className="rounded-full border px-2 py-0.5 text-[10px] font-bold">{finding.category}</span><span className="text-[10px] text-muted-foreground">{documented ? "אסמכתא תועדה בדפדפן" : "ממתין לאסמכתא"}</span></div>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">{finding.detail}</p><p className="mt-1 text-xs"><strong>נדרש לאמת מול:</strong> {finding.sourceRequired}</p>
                  {(finding.expected || finding.observed) && <p className="mt-1 text-xs"><strong>צפוי:</strong> {finding.expected || "לא הוגדר"} · <strong>נצפה:</strong> {finding.observed || "לא זוהה"}</p>}
                </div></div>
                <label className="block space-y-1.5"><span className="text-xs font-bold">הפניה לאסמכתא / תוצאת בדיקה (לפחות 12 תווים)</span>
                  <textarea value={evidence} onChange={(event) => setAuditEvidence((previous) => ({ ...previous, [finding.id]: event.target.value }))} rows={2} placeholder="למשל: PDF עמוד 2 שורה 4; הזמנה 12345; אישור הנהג מתאריך..." className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs leading-5 outline-none focus:ring-2 focus:ring-primary/30" />
                </label>
              </div>;
            })}
          </div>
          {auditFindings.length > 8 && <Button variant="outline" size="sm" onClick={() => setShowAllAuditFindings((value) => !value)}>{showAllAuditFindings ? "הצג פחות בדיקות" : `הצג את כל ${auditFindings.length} הבדיקות`}</Button>}
          <p className="text-xs leading-6 text-muted-foreground">חשוב: תיעוד זה נשמר כרגע בדפדפן המקומי בלבד ואינו הוכחה עצמאית לאימות. אין כאן חילוץ אוטומטי של PDF או הצלבה חיה מול קומקס/צי רכב; יש לצרף אסמכתאות אמיתיות. יש להשלים שמירה ואכיפה בצד השרת לפני שימוש כתהליך ביקורת מחייב.</p>
        </section>
        {/* באנר ירוק לאחר אישור הראל */}
        {(ap?.harel || showCelebration) && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white shadow-lift animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-xs">
                <Crown className="h-7 w-7 text-amber-300" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-extrabold flex items-center gap-2">
                  <span>אושר סופית לחיוב ע״י הראל אידלסון (מנכ״ל) 👑</span>
                  <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                    סגירת מעגל 100%
                  </span>
                </h3>
                <p className="text-xs leading-relaxed text-emerald-100">
                  נשלחה הודעת אימות אוטומטית ללינה בהנהלת חשבונות (
                  <strong>lina@saban94.co.il</strong>) להפקת חשבונית מס, ועודכן יומן הפיקוח ב-Google
                  Drive.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[1fr_340px]">
          {/* עמודה ימנית: סריקה מקורית מ-Drive עם שכבות בקרה וחותמות */}
          <div className="space-y-4">
            {!n.fileId ? (
              <div className="flex flex-col items-center justify-center h-[520px] rounded-3xl bg-card border border-border/80 text-center p-6 space-y-3">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <p className="text-sm font-bold">לתעודה זו לא קיים קובץ סריקה מקושר ב-Drive</p>
                <p className="text-xs text-muted-foreground">
                  ודא שגליה סרקה את התעודה וקישור הדרייב קיים בעמודה K או T בגיליון
                </p>
              </div>
            ) : isLoadingScan ? (
              <div className="flex flex-col items-center justify-center h-[520px] rounded-3xl bg-card border border-border/80 text-center p-6 space-y-3">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm font-bold">טוען סריקה מקורית מ-Google Drive...</p>
                <p className="text-xs text-muted-foreground">
                  חילוץ PDF ורינדור עמוד ראשון דרך שרת Apps Script
                </p>
              </div>
            ) : scanError || !scanSrc ? (
              <div className="flex flex-col items-center justify-center h-[520px] rounded-3xl bg-card border border-red-500/30 text-center p-6 space-y-3">
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <p className="text-sm font-bold text-destructive">
                  לא ניתן לטעון את הסריקה המקורית מ-Drive
                </p>
                <p className="text-xs text-muted-foreground">
                  {scanError instanceof Error ? scanError.message : "כשל בשליפת הקובץ"}
                </p>
                <Button size="sm" onClick={() => refetchScan()}>
                  נסה שוב
                </Button>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-3xl bg-card shadow-card border border-border/70">
                <img
                  src={scanSrc}
                  alt={`סריקת תעודה ${n.id}`}
                  className="w-full object-contain select-none"
                  loading="eager"
                />

                {/* שכבת תג בקרה */}
                <div className="absolute top-4 left-4 rounded-xl bg-card/85 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-foreground border border-border/50 shadow-sm flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  <span>
                    {n.live
                      ? "שכבת בקרת נועה AI · טרם הוצלב מול קומקס/איתוראן"
                      : "שכבת בקרת נועה AI · אומת 1:1"}
                  </span>
                </div>

                {/* חותמת ראמי */}
                {ap?.rami && (
                  <div className="stamp absolute bottom-16 left-6 bg-card/75 backdrop-blur-md text-sm text-rami border-rami/80 shadow-md">
                    ח. סבן — נבדק ואושר אישית ע״י ראמי מסארווה ✍️
                    <br />
                    <span className="text-xs font-mono opacity-90">{ap.rami.at}</span>
                  </div>
                )}

                {/* חותמת הראל מנכ״ל */}
                {ap?.harel && (
                  <div className="stamp absolute bottom-40 right-6 bg-card/75 backdrop-blur-md text-sm text-ceo border-ceo/80 shadow-md">
                    ח. סבן (1994) בע״מ — אושר סופית לחיוב 👑
                    <br />
                    <span className="font-bold">הראל אידלסון (מנכ״ל)</span> ·{" "}
                    <span className="text-xs font-mono">{ap.harel.at}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* עמודה שמאלית: בקרת נועה AI, פקדונות וחתימות */}
          <aside className="space-y-4">
            {/* דוח בקרת נועה */}
            <div className="rounded-3xl bg-card p-5 shadow-card border border-border/70 space-y-3">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-base font-bold">דוח בקרת נועה AI</h2>
                </div>
                <StatusPill s={a.status} />
              </div>

              <ul className="space-y-2 text-xs">
                {a.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl bg-muted/40 p-2.5">
                    <span className="shrink-0 text-sm">
                      {f.status === "ok" ? "🟢" : f.status === "warn" ? "⚠️" : "🔴"}
                    </span>
                    <span className="leading-relaxed font-medium text-foreground/90">{f.text}</span>
                  </li>
                ))}
              </ul>

              {/* סיכום פקדונות 1:1 */}
              <div className="grid grid-cols-2 gap-2 border-t pt-3 text-center text-xs">
                <div className="rounded-xl bg-amber-500/10 p-2 border border-amber-500/20">
                  <span className="text-[10px] text-amber-900 block font-semibold">
                    בלות (60002)
                  </span>
                  <span className="font-display text-base font-extrabold text-amber-800">
                    {n.deposits?.bales60002?.delivered ?? 0} סופקו
                  </span>
                </div>

                <div className="rounded-xl bg-emerald-500/10 p-2 border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-900 block font-semibold">
                    משטחים (60060)
                  </span>
                  <span className="font-display text-base font-extrabold text-emerald-800">
                    {n.deposits?.pallets60060?.delivered ?? 0} סופקו
                  </span>
                </div>
              </div>

              {/* סיכום כמות פריטים ומשקל מוערך (ללא אזכור כספי) */}
              <div className="border-t pt-3 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground font-semibold">כמות פריטים</span>
                  <span className="font-display text-base font-extrabold text-foreground">
                    {noteItemsCount(n)} פריטים
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground font-semibold">
                    משקל מוערך לתעודה
                  </span>
                  <span className="font-display text-lg font-extrabold text-foreground">
                    {noteWeightTons(n).toFixed(2)} טון ({noteWeightKg(n).toLocaleString()} ק״ג)
                  </span>
                </div>
              </div>
            </div>

            {/* כרטיס אישור וחתימה דיגיטלית */}
            <div className="rounded-3xl bg-card p-5 shadow-card border border-border/70 space-y-3">
              <h3 className="font-display text-sm font-bold text-foreground">
                אישור וחתימה דיגיטלית
              </h3>

              <input
                type="text"
                placeholder="הערה לחתימה (אופציונלי)..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="w-full rounded-2xl bg-muted/50 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 border"
              />

              {/* כפתור ראמי */}
              {!ap?.rami && (
                <button
                  onClick={handleRamiApproval}
                  disabled={isApprovingRami}
                  className="w-full rounded-2xl bg-rami py-3.5 font-display text-sm font-bold text-rami-foreground shadow-sm hover:opacity-95 transition active:scale-98 disabled:opacity-50"
                >
                  {isApprovingRami ? "מאשר בשרת..." : "נבדק ואושר אישית ע״י ראמי ✍️"}
                </button>
              )}

              {/* כפתור הראל מנכ״ל */}
              {ap?.rami && !ap?.harel && (
                <button
                  onClick={handleHarelApproval}
                  disabled={isApprovingHarel}
                  className="w-full rounded-2xl bg-ceo py-3.5 font-display text-sm font-bold text-ceo-foreground shadow-lift hover:opacity-95 transition active:scale-98 disabled:opacity-50"
                >
                  {isApprovingHarel ? "מאשר בשרת..." : "אושר סופית לחיוב 👑 הראל אידלסון"}
                </button>
              )}

              {/* איפוס חתימות */}
              {ap && (
                <button
                  onClick={() => {
                    approvals.reset(n.id);
                    setShowCelebration(false);
                    toast.info("חתימות התעודה אופסו");
                  }}
                  className="w-full rounded-2xl border border-border py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                >
                  איפוס חתימות
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* שרשור ראמי ↔ הראל המחובר לנתוני העבודה בשרת */}
        <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="font-display text-base font-extrabold">💬 שרשור בירור · ראמי ↔ הראל</h2>
              <p className="mt-1 text-xs text-muted-foreground">הודעות נשמרות דרך שרת העבודה ומקושרות לתעודה</p>
            </div>
            <Button size="sm" className="gap-2" onClick={() => void handleOpenTask()} disabled={isOpeningTask}>
              {isOpeningTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              {isOpeningTask ? "פותח משימה..." : "פתח / צור משימה לתעודה"}
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link to="/harel">לוח המשימות של הראל <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          {workroomQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />טוען שרשור מהשרת...</div>
          ) : workroomQuery.error ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-bold">לא ניתן לטעון את שרשור הבירור</p>
              <p className="mt-1 text-xs text-muted-foreground">{workroomQuery.error instanceof Error ? workroomQuery.error.message : "שגיאת חיבור לשרת"}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => void workroomQuery.refetch()}>נסה שוב</Button>
            </div>
          ) : relatedInquiry ? (
            <InquiryThread messages={relatedInquiry.thread || []} onReply={handleThreadReply} />
          ) : (
            <div className="rounded-2xl border border-dashed p-5 text-center">
              <p className="text-sm font-bold">לא נמצא תיק בירור מקושר לתעודה {n.id}</p>
              <p className="mt-1 text-xs text-muted-foreground">אפשר לפתוח את לוח המשימות של הראל כדי לאתר או ליצור תיק מקושר.</p>
              <Button size="sm" className="mt-3" onClick={() => void handleOpenTask()} disabled={isOpeningTask}>
                {isOpeningTask ? "פותח משימה..." : "פתיחת תיק הבירור והמשימה"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
