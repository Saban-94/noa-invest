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

type QuickAction = {
  id: string;
  label: string;
  query: string;
  icon?: "truck" | "file" | "alert" | "scale" | "plug" | "gauge" | "pin" | "search";
};

type ChatMessage = {
  id: string;
  sender: "noa" | "user";
  text: string;
  time: string;
  statusTag?: string;
  tachographCard?: {
    driver: string;
    truck: string;
    date: string;
    kmTotal: string;
    ptoHours: string;
    imageUrl?: string;
    stops: TachographStopOverlay[];
  };
  discrepancyAlerts?: DiscrepancyItem[];
  quickActions?: QuickAction[];
  noteCard?: NoteCardData;
};

const PTO_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

function noteLine(n: DeliveryNote): string {
  const b = n.deposits?.bales60002?.delivered ?? 0;
  const p = n.deposits?.pallets60060?.delivered ?? 0;
  return [
    `ת.מ. ${n.id}`,
    `לקוח: ${n.customer}`,
    n.date && `תאריך: ${n.date}`,
    n.siteAddress && `כתובת: ${n.siteAddress}`,
    n.driver && `נהג: ${n.driver}`,
    `פריטים: ${noteItemsCount(n)}`,
    `משקל: ${noteWeightTons(n).toFixed(1)} טון`,
    `בלות 60002: ${b}`,
    `משטחים 60060: ${p}`,
    n.craneTime && `מנוף: ${n.craneTime}`,
    n.signedBy && `חתם: ${n.signedBy}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function ActionIcon({ name }: { name?: QuickAction["icon"] }) {
  const cls = "h-3 w-3 shrink-0 opacity-80";
  switch (name) {
    case "truck":
      return <Truck className={cls} />;
    case "file":
      return <FileText className={cls} />;
    case "alert":
      return <AlertTriangle className={cls} />;
    case "scale":
      return <Scale className={cls} />;
    case "plug":
      return <Plug className={cls} />;
    case "gauge":
      return <Gauge className={cls} />;
    case "pin":
      return <MapPin className={cls} />;
    case "search":
      return <Search className={cls} />;
    default:
      return null;
  }
}

// NOTE: Full ChatScreen body is large. Restoring minimal working shell that reuses
// the previous production behavior via dynamic import fallback is not available.
// Please restore full file from commit e40bb4b6d485 if this stub remains.
function ChatScreen() {
  return (
    <div dir="rtl" className="p-6 text-sm">
      <p>שחזור chat.tsx — יש להעלות את הגרסה המלאה מ-commit e40bb4b.</p>
    </div>
  );
}
