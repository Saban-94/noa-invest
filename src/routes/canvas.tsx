import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import DeliveryCanvasEditor from "@/components/DeliveryCanvasEditor";
import { type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import { askNoa } from "@/lib/ai.functions";
import noaStamp from "@/assets/noa.jpg";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bot, Sparkles, Send, ShieldCheck, AlertTriangle, ExternalLink, RefreshCw, PenTool, FolderCheck, Building, Loader2, Stamp } from "lucide-react";

export const Route = createFileRoute("/canvas")({
  component: CanvasPageRoute,
});

const CUSTOMERS_ROOT_DRIVE_URL =
  "https://drive.google.com/drive/folders/1JGNbTlmB5yBH_cLOApKTvE39CEL6roFF";

function CanvasPageRoute() {
  const { data: notesList, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["live-notes-canvas"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
        טוען תעודות מהגיליון...
      </div>
    );
  }

  if (error || !notesList) {
    return (
      <div className="p-6 max-w-xl mx-auto" dir="rtl">
        <Card className="p-5 space-y-3 border-red-500/40 bg-red-500/5">
          <div className="flex items-center gap-2 font-bold text-red-700">
            <AlertTriangle className="h-4 w-4" /> לא ניתן לטעון תעודות מהגיליון
          </div>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "שגיאה לא ידועה"}
          </p>
          <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ml-1 ${isFetching ? "animate-spin" : ""}`} />
            נסה שוב
          </Button>
        </Card>
      </div>
    );
  }

  if (notesList.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
        אין עדיין תעודות בגיליון.
      </div>
    );
  }

  return <CanvasWorkspace notesList={notesList} isLoadingNotes={isFetching} refetchNotes={refetch} />;
}

function CanvasWorkspace({
  notesList,
  isLoadingNotes,
  refetchNotes,
}: {
  notesList: DeliveryNote[];
  isLoadingNotes: boolean;
  refetchNotes: () => unknown;
}) {
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notesList[0].id);
  useEffect(() => {
    if (notesList.length > 0 && !notesList.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(notesList[0].id);
    }
  }, [notesList, selectedNoteId]);

  const currentNote = useMemo(() => {
    const raw = notesList.find((n) => n.id === selectedNoteId) || notesList[0];
    return {
      ...raw,
      items: Array.isArray(raw.items) ? raw.items : [],
      deposits: {
        bales60002: raw.deposits?.bales60002 || { delivered: 0, billed: 0 },
        pallets60060: raw.deposits?.pallets60060 || { delivered: 0, billed: 0 },
      },
    };
  }, [notesList, selectedNoteId]);

  const {
    data: scanImageSrc,
    isLoading: isLoadingScan,
    error: scanError,
    refetch: refetchScan,
  } = useQuery({
    queryKey: ["scan", currentNote.fileId],
    enabled: !!currentNote.fileId,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: currentNote.fileId as string } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  const [chatMessages, setChatMessages] = useState<
    { id: string; sender: "noa" | "rami"; text: string; timestamp: string }[]
  >([]);
  const [userInput, setUserInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isThinking]);

  const buildContext = useCallback(() => {
    const n = currentNote;
    const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
    const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };
    return [
      "מסך: קנבס תעודת משלוח",
      `תעודה: ${n.id} comax=${n.comaxOrder || n.id}`,
      `לקוח: ${n.customer || "—"} (${n.customerNo || "—"})`,
      `כתובת: ${n.siteAddress || n.site || n.address || "—"}`,
      `נהג: ${n.driver || "—"} | מחסן: ${n.yard || "—"}`,
      `פקדונות 60002: ${b.delivered}/${b.billed} | 60060: ${p.delivered}/${p.billed}`,
      `איתוראן: ${n.gps?.note || "אין"}`,
      "constraints.noLiveGps=true",
      "עני רק לפי העובדות. אל תמציאי.",
    ].join("\n");
  }, [currentNote]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isThinking) return;
    const query = userInput.trim();
    const userMsg = {
      id: `rami-${Date.now()}`,
      sender: "rami" as const,
      text: query,
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setUserInput("");
    setIsThinking(true);
    try {
      const history = [...chatMessages, userMsg].slice(-12).map((m) => ({
        role: (m.sender === "rami" ? "user" : "assistant") as "user" | "assistant",
        content: m.text,
      }));
      const res = await askNoa({ data: { messages: history, context: buildContext() } });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `noa-${Date.now()}`,
          sender: "noa",
          text: res.text,
          timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "noa",
          text: `שגיאה: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]" dir="rtl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(59,130,246,0.1),_transparent_45%)]"
      />
      <div className="mx-auto max-w-[1600px] space-y-4 p-3 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-gradient-to-l from-amber-500/10 to-transparent px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <FolderCheck className="h-4 w-4 text-amber-700" />
            <span className="font-bold text-amber-950">קנבס תעודות · חמ״ל ראמי</span>
          </div>
          <div className="flex items-center gap-2">
            <img src="/sing-rami.jpg" alt="חותמת ראמי" className="h-8 w-8 rounded-lg object-cover ring-1 ring-blue-500/30" />
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Stamp className="h-3 w-3" /> חותמת ראמי
            </Badge>
            <a href={CUSTOMERS_ROOT_DRIVE_URL} target="_blank" rel="noreferrer" className="font-bold text-amber-900 hover:underline">
              Drive <ExternalLink className="inline h-3 w-3" />
            </a>
            <Link to="/customers" className="font-bold text-amber-900 hover:underline flex items-center gap-1">
              <Building className="h-3 w-3" /> תיק לקוח
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border bg-card/80 p-4 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">קנבס תעודות · מוח נועה</h1>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Bot className="h-3 w-3 text-emerald-600" /> askNoa
            </Badge>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Button size="sm" variant="ghost" onClick={() => refetchNotes()} disabled={isLoadingNotes}>
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingNotes ? "animate-spin" : ""}`} />
            </Button>
            {notesList.map((note) => (
              <Button
                key={note.id}
                size="sm"
                variant={selectedNoteId === note.id ? "default" : "outline"}
                onClick={() => setSelectedNoteId(note.id)}
                className="shrink-0 text-xs"
              >
                #{note.comaxOrder || note.id} {note.customer}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <Card className="space-y-3 rounded-2xl p-4">
              <div className="flex items-center justify-between border-b pb-2 text-xs">
                <span className="font-bold">
                  תעודה #{currentNote.comaxOrder || currentNote.id} · {currentNote.customer}
                </span>
                {currentNote.driveUrl && (
                  <a href={currentNote.driveUrl} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
                    PDF מקורי
                  </a>
                )}
              </div>
              {!currentNote.fileId ? (
                <p className="p-6 text-center text-sm text-red-700">אין קובץ סריקה מקושר</p>
              ) : isLoadingScan ? (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  <RefreshCw className="ml-2 inline h-4 w-4 animate-spin" /> טוען סריקה...
                </p>
              ) : scanError || !scanImageSrc ? (
                <div className="space-y-2 p-6 text-center">
                  <p className="text-sm font-bold text-red-700">לא ניתן לטעון סריקה</p>
                  <Button size="sm" onClick={() => refetchScan()}>נסה שוב</Button>
                </div>
              ) : (
                <DeliveryCanvasEditor
                  key={currentNote.id}
                  note={currentNote}
                  imageSrc={scanImageSrc}
                  stampSrc="/sing-rami.jpg"
                  secondaryStampSrc={noaStamp}
                />
              )}
            </Card>
          </div>

          <div className="lg:col-span-5">
            <Card className="flex h-[min(720px,calc(100dvh-12rem))] flex-col overflow-hidden rounded-2xl border-emerald-500/15">
              <div className="flex items-center gap-2 border-b border-emerald-500/10 bg-gradient-to-l from-emerald-500/10 p-3">
                <img src={noaStamp} alt="נועה" className="h-9 w-9 rounded-2xl object-cover ring-2 ring-emerald-500/50" />
                <div>
                  <h3 className="flex items-center gap-1 text-sm font-bold">
                    נועה AI · מוח חי <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Gemini · הקשר תעודה · בלי המצאות</p>
                </div>
                <Badge className="mr-auto gap-1 text-[10px]" variant="outline">
                  <ShieldCheck className="h-3 w-3" /> בקרה
                </Badge>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.sender === "rami" ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[92%] whitespace-pre-wrap rounded-2xl p-3 shadow-sm ${
                        msg.sender === "rami"
                          ? "bg-primary text-primary-foreground"
                          : "border bg-card"
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="mt-1 text-[9px] text-muted-foreground">
                      {msg.sender === "rami" ? "ראמי" : "נועה"} · {msg.timestamp}
                    </span>
                  </div>
                ))}
                {isThinking && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    נועה חושבת...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
              <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
                <input
                  type="text"
                  placeholder="שאל את נועה על התעודה..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  disabled={isThinking}
                  className="flex-1 rounded-xl border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <Button type="submit" size="sm" disabled={isThinking || !userInput.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                  {isThinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
