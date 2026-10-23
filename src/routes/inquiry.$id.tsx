import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchLiveNotes } from "@/lib/api";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import DeliveryCanvasEditor from "@/components/DeliveryCanvasEditor";
import { Card } from "@/components/ui/card";
import { Loader2, AlertTriangle, Send, UserCheck, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/inquiry/$id")({
  component: InquiryPage,
});

function InquiryPage() {
  const { id } = Route.useParams();
  
  const { data: notes, isLoading, error } = useQuery({
    queryKey: ["live-notes"],
    queryFn: fetchLiveNotes,
    staleTime: 30000,
  });

  const n = notes?.find((x) => x.id === id);

  const { data: scanSrc, isLoading: isLoadingScan } = useQuery({
    queryKey: ["scan", n?.fileId],
    enabled: !!n?.fileId,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: n!.fileId! } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  const [message, setMessage] = useState("");

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin inline" /> טוען...</div>;
  if (!n) return <div className="p-8 text-center">תעודה לא נמצאה</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6" dir="rtl">
      <Card className="p-4">
        <h1 className="text-xl font-bold mb-4">טיפול בבירור תעודה #{id}</h1>
        
        {isLoadingScan ? (
            <div className="h-96 flex items-center justify-center">טוען קנבס...</div>
        ) : scanSrc ? (
            <DeliveryCanvasEditor note={n} imageSrc={scanSrc} />
        ) : (
            <div className="h-64 flex items-center justify-center">אין סריקה זמינה</div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold mb-2">שיח בירור (ראמי ↔ הראל)</h2>
        <div className="h-48 overflow-y-auto border rounded p-2 mb-4 bg-muted/20">
          {/* כאן יבוא לוג השיחה מהגיליון */}
          <div className="text-xs text-muted-foreground italic">אין הודעות עדיין...</div>
        </div>

        <textarea 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full h-32 border rounded p-2 mb-2 text-sm"
            placeholder="כתוב מענה להראל..."
        />
        
        <Button onClick={() => toast.success("הודעה נשלחה להראל!")} className="gap-2">
          <Send className="h-4 w-4" /> שלח תשובה להראל
        </Button>
      </Card>
    </div>
  );
}
