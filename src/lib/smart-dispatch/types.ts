// src/lib/smart-dispatch/types.ts
// הגדרות טיפוסים למערכת סידור חכם – ח. סבן חומרי בניין

export type MeasurementSource = "ituran" | "handwritten" | "fleet_default" | "manual";

export interface IturanRawRow {
  messageTime: string; // זמן הודעה: dd/MM/yyyy HH:mm:ss
  identTag: string; // תג זיהוי (למשל: "651-51-701 משאית איסוזו")
  direction?: string; // כיוון
  distanceKm: number; // מרחק בק"מ מצטבר
  driverName: string; // שם נהג (למשל: "נהג קבוע:\nעלי אבו עידה")
  address: string; // כתובת (למשל: "משה שרת 9, הוד השרון")
  speed?: number; // מהירות
  stateName: string; // שם מצב (למשל: ".פתיחת PTO", ".סגירת PTO")
  alertName?: string; // שם התראה
  origGeoArea?: string; // אזור גיאוגראפי מקורי
  currGeoArea?: string; // אזור גיאוגראפי נוכחי
  stopDurationStr?: string; // משך עצירה (כטקסט)
  stopEndTimeStr?: string; // זמן סיום עצירה
}

export interface PtoEvent {
  id: string;
  truck: string; // רישוי: "651-51-701"
  openTime: string; // dd/MM/yyyy HH:mm:ss
  closeTime?: string; // dd/MM/yyyy HH:mm:ss
  durationMin?: number;
  isOrphan: boolean;
  orphanReason?: "missing_open" | "missing_close";
}

export interface IturanStop {
  id: string; // מזהה עצירה ייחודי
  truck: string; // מספר רישוי מנורמל XXX-XX-XXX
  driver: string; // שם נהג נקי
  date: string; // dd/MM/yyyy
  startTime: string; // dd/MM/yyyy HH:mm:ss
  endTime: string; // dd/MM/yyyy HH:mm:ss
  durationMin: number; // מחושב מהפרש הזמנים
  address: string; // כתובת מלאה
  normalizedSiteKey: string; // מפתח אתר: עיר|רחוב|מספר
  cumulativeKm: number; // ק"מ מצטבר בסיום
  driveDurationMin?: number; // נסיעה מהעצירה הקודמת בדקות
  driveKm?: number; // ק"מ מהעצירה הקודמת
  ptoEvents: PtoEvent[];
  matchedVisitKey?: string; // מפתח ביקור שהוצלב
}

export interface HandwrittenCraneWindow {
  rawText: string;
  type: "unloading" | "waiting";
  startStr: string; // HH:mm
  endStr: string; // HH:mm
  durationMin: number;
  isReversed: boolean; // סיום <= התחלה
  isOutlier: boolean; // מעל 240 דקות
  flags: string[];
}

export interface GalyaDeliveryNote {
  receiptDate?: string; // תאריך קליטה
  docDate: string; // תאריך תעודה (dd/MM/yyyy)
  docTime: string; // שעת תעודה (שעת הדפסה, לא שעת פריקה!)
  noteId: string; // מס' תעודת משלוח
  orderId?: string; // מס' הזמנה
  customerNo?: string; // מס' לקוח
  customerName: string; // שם לקוח
  deliveryAddress: string; // כתובת אספקה
  driverRaw?: string; // נהג
  truckRaw?: string; // רישוי / משאית
  docLink?: string; // קישור לתעודה
  itemsSummary?: string; // פריטים
  depositsSummary?: string; // פיקדונות
  craneTimeRaw?: string; // זמני מנוף / המתנה
  sourceFile?: string; // קובץ מקור
  page?: string; // עמוד
  extractStatus?: string; // סטטוס חילוץ
  uniqueKey?: string; // מפתח ייחודי
  approvalStatus?: string; // סטטוס אישור
  signedLink?: string; // קישור חתום
  ramiApproval?: string; // אישור ראמי
  harelApproval?: string; // אישור הראל
  approvalNote?: string; // הערת אישור

  // שדות מוזרקים מימין (בלי לפגוע בקיימים):
  injectedSiteDurationMin?: number; // משך באתר
  injectedTravelMin?: number; // נסיעה
  injectedTravelKm?: number; // ק"מ נסיעה
  injectedArriveTime?: string; // הגעה
  injectedDepartTime?: string; // יציאה
  injectedPtoOpen?: string; // PTO פתיחה
  injectedPtoClose?: string; // PTO סגירה
  injectedPtoMin?: number; // PTO דק'
  injectedMeasurementSource?: MeasurementSource; // מקור מדידה
  injectedVisitKey?: string; // מפתח ביקור
}

export interface VisitRecord {
  visitKey: string; // מפתח ביקור ייחודי: תאריך_משאית_מפתחאתר
  date: string; // תאריך (dd/MM/yyyy)
  truck: string; // רישוי משאית (XXX-XX-XXX)
  driver: string; // נהג נקי
  city: string; // עיר
  streetAndNum: string; // רחוב ומספר
  fullAddress: string; // כתובת מלאה
  siteKey: string; // עיר|רחוב|מספר מנורמל
  customers: string[]; // שמות לקוחות
  customerNumbers: string[]; // מספרי לקוחות
  noteIds: string[]; // מספרי תעודות משלוח
  orderIds: string[]; // מספרי הזמנות
  notesCount: number; // כמות תעודות בביקור

  // נתוני מנוף בכתב יד
  handwrittenCraneRaw?: string;
  handwrittenUnloadMin?: number;
  handwrittenWaitingMin?: number;

  // נתוני איתוראן
  ituranArriveTime?: string;
  ituranDepartTime?: string;
  ituranDurationMin?: number;
  ptoOpenTime?: string;
  ptoCloseTime?: string;
  ptoDurationMin?: number;
  driveKm?: number;
  driveMin?: number;

  // ערכים סופיים לקביעת הסידור
  finalSiteDurationMin: number; // משך באתר לסידור
  measurementSource: MeasurementSource; // מקור המדידה
  qualityFlags: string[]; // דגלי איכות: "חלון מנוף הפוך", "משאית חסרה", וכו'
  matchScore?: number; // ניקוד הצלבת כתובת (0-5)
}

export interface CustomerSiteRecord {
  siteKey: string;
  city: string;
  address: string;
  customerNo?: string;
  customerName?: string;
  visitsCount: number;
  medianDurationMin: number; // P50
  p80DurationMin: number; // P80
  maxDurationMin: number;
  medianDriveMin: number;
  confidence: "high" | "medium" | "low";
  lastVisitDate: string;
  recentDurations: { date: string; minutes: number; source: MeasurementSource }[];
}

export interface CitySummaryRecord {
  city: string;
  visitsCount: number;
  medianDurationMin: number;
  p80DurationMin: number;
  medianDriveMin: number;
  sitesCount: number;
}

export interface EstimationRequest {
  customerNo?: string;
  address: string;
  city: string;
  targetDate?: string;
  targetTime?: string;
}

export interface EstimationResult {
  p50DurationMin: number; // P50 זמן באתר
  p80DurationMin: number; // P80 זמן באתר (לתכנון בטוח)
  medianDriveMin: number; // נסיעה חציונית
  totalP50Min: number; // סך הכל P50 (אתר + נסיעה)
  totalP80Min: number; // סך הכל P80 (אתר + נסיעה)
  sampleCount: number; // מספר מדידות
  confidence: "high" | "medium" | "low";
  hierarchyLevel: "אתר" | "לקוח" | "עיר" | "כלל הצי" | "ברירת מחדל";
  recentVisits: {
    date: string;
    minutes: number;
    source: MeasurementSource;
    truck?: string;
    noteId?: string;
  }[];
  suggestedFreeWindows?: {
    truck: string;
    from: string;
    to: string;
    availableMinutes: number;
  }[];
}

export interface DataQualityIssue {
  id: string;
  type:
    | "duplicate_note"
    | "reversed_window"
    | "outlier_window"
    | "missing_truck"
    | "unmatched_ituran_stop"
    | "orphan_pto";
  title: string;
  description: string;
  severity: "error" | "warning" | "info";
  entityId: string; // noteId / stopId / ptoId
  details: Record<string, unknown>;
  createdAt: string;
  status: "open" | "resolved" | "ignored";
}

export interface ErrorLogRecord {
  timestamp: string;
  component: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}
