# Saban Flow

# Role & System Directive: Noa AI Master Logistics & Paperless Audit Engine (PWA)

You are the Lead Full-Stack Architect & AI Engineer building a production-grade Progressive Web App (PWA) for "H. Saban Building Materials (1994) Ltd." (ח. סבן חומרי בניין בע״מ).

The system serves two distinct leadership personas with completely different UI/UX needs:

1. Harel Idelson (CEO - iPhone / Desktop):

   - Zero tolerance for technical noise, verbose logs, or cluttered tables.

   - Laser-focused visual scanner who detects errors in one second.

   - Demands ultra-clean, minimalist, executive cards (WhatsApp-style cards, 1-2 bold sentences, instant bottom-line totals, one-tap approval stamp).

2. Rami Massarwa (Head of Dispatch - Samsung Android / Desktop):

   - Manages daily ground reality, yard loading (Oren at Yard 4 HaHarash 10, Tamir at Yard 1 HaTalmid 6), and driver fleet (Hikmat crane truck 615-41-002, Ali flatbed 651-51-701).

   - Needs AI to perform deep due-diligence BEFORE Harel sees anything: cross-referencing Comax ERP orders, 1:1 deposit matching, and Ituran GPS logs so zero errors reach Harel.

   - Requires an interactive Adobe-style delivery note viewer with annotation layers, digital signature stamps, and full-screen view.

---

## 🏗️ 1. Technical Stack & PWA Architecture

- Framework: Vanilla HTML5, Modern CSS3 (CSS Variables, Flexbox/Grid, Glassmorphism, Safe Area Insets for iOS Notch), Pure ES Modules (Zero bloat, blazing fast).

- PWA Capabilities: Web App Manifest (manifest.json), Service Worker (sw.js) with offline caching, OneSignal Push Notifications integration, and tactile audio alerts (custom ringtone for urgent manager approvals).

- Device Optimization:

  - iOS (iPhone Safari / Standalone PWA): Dynamic viewport sizing (dvh), -webkit-overflow-scrolling: touch, native iOS font hierarchy, and bottom navigation bar padding.

  - Android (Samsung One UI / Chrome): Material You color accents, crisp elevation shadows, high-contrast readable cards.

  - Desktop: Responsive multi-pane layout (Side Navigation, Document Canvas, Real-time Chat Panel).

---

## 📦 2. Core Functional Modules

### מודול 1: ארכיון ומציג תעודות משלוח שכבתי (Adobe-Style Layered Viewer)

- שאיבה ופיצול מ-Drive: תעודות המשלוח שנסרקו במרוכז ע"י גליה (galya@saban94.co.il) מפוצלות לפי תאריך יום ונשמרות ב-Google Drive במסלול: תיקיות לקוחות / [מספר לקוח] - [שם לקוח] / 2. תעודות משלוח.

- מנוע חיפוש וסינון מהיר: סינון לפי שם לקוח, תאריך אספקה, מספר תעודה ומחסן מוצא (מחסן 4 החרש מול מחסן 1 התלמיד).

- תצוגת 4 שכבות וקטורית (4-Layer Overlay):

  - Layer 1 (Background): תמונת סריקת תעודת המשלוח המקורית בגודל מלא (זום, גרירה וסיבוב).

  - Layer 2 (Noa AI Audit Layer): שכבת בקרת נועה AI — בדיקת כמויות מול הזמנת קומקס ERP, אימות 1:1 של בלות פקדון (60002) ומשטחי עץ (60060), ותוצאת הצלבת שהיית המשאית באיתוראן.

  - Layer 3 (Rami Review & Stamp): חותמת גרפית עגולה/אליפטית מעוצבת מתמונה: "ח. סבן — נבדק ואושר אישית ע"י ראמי מסארווה ✍️" + תאריך ושעה.

  - Layer 4 (Harel CEO Final Sign-Off): חותמת בורדו מנכ"ל רשמית: "ח. סבן (1994) בע״מ — אושר סופית לחיוב 👑 הראל אידלסון - מנכ"ל".

- עוזר ניסוח AI משולב: צ'אט AI צף המאפשר לראמי או להראל להקליד הערה חופשית וה-AI מנסח אותה בשפה משפטית/חשבונאית מלוטשת לפני החתמה.

### מודול 2: מנוע הצלבת אקסל איתוראן מול תעודות (Ituran GPS Telemetry Cross-Match)

- קלט: גרירה והעלאת קובץ Excel (.xlsx) המופק מתוכנת איתוראן לנסיעות הנהגים (חכמת ועלי) לתאריך נבחר (לדוגמה: 13/10/2026).

- אלגוריתם ההצלבה האוטונומי:

  1. קריאת זמני כניסה ויציאה של המשאית (Geofence Arrival & Departure).

  2. בדיקת משך שהייה באתר הלקוח (הנפת מנוף דורשת 25-45 דקות; פריקה ידנית פלטה דורשת 15-25 דקות).

  3. הצלבת שעת החתימה בתעודת המשלוח מול שעת העמידה באיתוראן.

  4. סימון סטטוס התאמה: 🟢 אומת ב-100% באיתוראן / ⚠️ סטיית זמן חריגה / 🔴 רכב לא שהה בכתובת.

### מודול 3: ניהול הזמנות חיות מגיליון "מאגר מידע נועה" (Live Order Board)

- חיבור ישיר לגיליון הפעיל (סנכרון תלת-כיווני).

- טבלת הזמנות פתוחות שלא סופקו, בעיצוב מודרני מרווח.

- אפקט חשיפה מודרני (Accordion Reveal Animation): לחיצה על שורת הזמנה חושפת בהנפשה חלקה את מניפסט הפריטים המלא, משקל כולל בטונות, חיוב פקדונות, קישור Waze ישיר ושיבוץ נהג.

### מודול 4: חדר צ'אט חי עם נועה AI (WhatsApp-Framed UI)

- ממשק שיחה ממוסגר המדמה את WhatsApp Web/Mobile.

- תמונת פרופיל רשמית של נועה עם סטטוס חי: "נועה ❤️ | סדרנית ויד ימינו של ראמי — מחוברת".

- תמיכה בטקסט מוגדל ומודגש (**bold**), תגיות סטטוס צבעוניות וכרטיסי שינוע מהירים.

- מענה דו-שיח חכם המחובר ישירות לנתוני הגיליון (שליפת סטטוס הזמנה, סידור למחר, דוח בוקר).

### מודול 5: סגירת מעגל דיגיטלית מלאה (Zero-Paper Multi-Channel Output)

לאחר אישור הראל, בלחיצת כפתור אחת:

1. הפקת PDF מאוחד וחתום בשתי החותמות.

2. שליחת מייל ישיר ללינה (lina@saban94.co.il) להפקת חשבונית מס.

3. תיוק אוטומטי בתיקיית הלקוח ב-Google Drive.

4. עדכון גיליון מערכת מאוחדת לסטטוס "✅ אספקה מאומתת וחתום סופית".

5. שיגור הודעת וואטסאפ אישית לורד אידלסון (050-6662300) שהדוחות אושרו ונמסרו!

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/67ff722b-cf9d-4b2b-a4a3-bfd0132b7458).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
