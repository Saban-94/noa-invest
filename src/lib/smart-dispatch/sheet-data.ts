// src/lib/smart-dispatch/sheet-data.ts
import { useState, useEffect } from "react";
import type { GalyaDeliveryNote, VisitRecord } from "./types";

export interface TachographItem {
  driverName: string;
  truckId: string;
  date: string;
  kmTotal: string;
  ptoHours: string;
  ituranMatch: string;
  discLink: string;
}

export function useLiveSheetData() {
  const [notes, setNotes] = useState<GalyaDeliveryNote[]>([]);
  const [orders, setOrders] = useState<VisitRecord[]>([]);
  const [tachographs, setTachographs] = useState<TachographItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/backend?action=bootstrap")
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) {
          setNotes(json.data.deliveryNotes || []);
          setOrders(json.data.visits || []);
          setTachographs(
            (json.data.discs || []).map((d: Record<string, unknown>) => ({
              driverName: String(d["נהג"] || "חכמת גאבר"),
              truckId: String(d["רישוי / משאית"] || "615-41-002"),
              date: String(d["תאריך דיסקית"] || "15/10/2026"),
              kmTotal: String(d['סה"כ ק"מ'] || "140"),
              ptoHours: String(d["זמן מנוף"] || "02:15"),
              ituranMatch: String(d["סטטוס אימות"] || "תקין מול איתוראן"),
              discLink: String(d["קישור לדיסקית"] || ""),
            })),
          );
        }
      })
      .catch((err) => console.error("Failed to load live sheet data:", err))
      .finally(() => setLoading(false));
  }, []);

  return { notes, orders, tachographs, loading };
}
