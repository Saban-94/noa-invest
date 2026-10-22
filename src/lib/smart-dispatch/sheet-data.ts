// src/lib/sheet-data.ts
import { useState, useEffect } from "react";
import { DeliveryNoteRow, TachographDiscRow } from "./types";

export function useLiveSheetData() {
  const [notes, setNotes] = useState<DeliveryNoteRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tachographs, setTachographs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/backend?action=bootstrap")
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) {
          setNotes(json.data.deliveryNotes || []);
          setOrders(json.data.visits || []);
          setTachographs(
            (json.data.discs || []).map((d: any) => ({
              driverName: d["נהג"] || "חכמת",
              truckId: d["רישוי / משאית"] || "615-41-002",
              date: d["תאריך דיסקית"] || "היום",
              kmTotal: d['סה"כ ק"מ'] || "140",
              ptoHours: d["זמן מנוף"] || "02:15",
              ituranMatch: "תקין מול איתוראן",
              discLink: d["קישור לדיסקית"] || "",
            }))
          );
        }
      })
      .catch((err) => console.error("Failed to load live sheet data:", err))
      .finally(() => setLoading(false));
  }, []);

  return { notes, orders, tachographs, loading };
}  