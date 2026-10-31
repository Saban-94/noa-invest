import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import noa from "@/assets/noa.jpg";
import {
  Send,
  CheckCheck,
  Truck,
  FileText,
  Gauge,
  AlertTriangle,
  RefreshCw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Loader2,
  MapPin,
  Scale,
  Plug,
  Search,
  History,
  PanelRight,
} from "lucide-react";
import {
  TachographCanvasViewer,
  type TachographStopOverlay,
} from "@/components/chat/TachographCanvasViewer";
import {
  CrossReferenceInspector,
  type DiscrepancyItem,
} from "@/components/chat/CrossReferenceInspector";
import { NotePreviewCard, type NoteCardData } from "@/components/chat/NotePreviewCard";
import { ChatContextPanel, type ContextPanelSelection } from "@/components/chat/ChatContextPanel";
import { ChatHistoryDrawer } from "@/components/chat/ChatHistoryDrawer";
import {
  loadChatSessions,
  saveChatSessions,
  upsertChatSession,
  sessionTitleFromMessages,
  type ChatSession,
} from "@/lib/chat-history";
import { playDispatchChime } from "@/lib/audio-alerts";
import { fetchLiveNotes } from "@/lib/api";
import { listPtoFn } from "@/lib/notes-api.functions";
import { askNoa } from "@/lib/ai.functions";
import { noteItemsCount, noteWeightTons, type DeliveryNote } from "@/lib/data";
import {
  pairPtoEvents,
  analyzePto,
  buildTruckSummaries,
  israelTime,
} from "@/lib/smart-dispatch/pto-pairing";
import {
  asksCurrentGps,
  asksSourceStatus,
  buildNoaContext,
  describeSources,
  evidenceFromMeta,
  EVIDENCE_LABEL_HE,
  formatNotesSummary,
  gpsUnavailableMessage,
  type BackendMeta,
} from "@/lib/chat-grounding";

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>) => ({
    customerNo: typeof search.customerNo === "string" && /^\d{3,10}$/.test(search.customerNo)
      ? search.customerNo
      : undefined,
    review:
      search.review === true ||
      search.review === "1" ||
      search.review === "true" ||
      search.review === "yes",
  }),
  head: () => ({
    meta: [
      { title: "נועה AI — חמ״ל לוגיסטי | ח. סבן" },
      {
        name: "description",
        content: "חמ״ל צ׳אט: תעודות, PTO, פקדונות והצלבות מול גיליון חי.",
      },
    ],
  }),
  component: ChatScreen,
});

// TEMP: full screen restored from commit e40bb4b + customer-scoped patches.
// If this marker remains, the full body failed to upload — restore from git history e40bb4b.
function ChatScreen() {
  return (
    <div dir="rtl" className="flex min-h-[50vh] items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-lg font-bold">שחזור צ׳אט בתהליך</h1>
        <p className="text-sm text-muted-foreground">
          הקובץ chat.tsx נפגם בדחיפה חלקית. יש לשחזר מ-commit e40bb4b או לאשר דחיפה מלאה מחדש.
        </p>
        <a className="text-primary underline" href="/">
          חזרה לראשי
        </a>
      </div>
    </div>
  );
}
