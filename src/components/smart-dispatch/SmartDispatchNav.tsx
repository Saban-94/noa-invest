// src/components/smart-dispatch/SmartDispatchNav.tsx
// סרגל ניווט עליון בלשוניות למערכת "סידור חכם – ח. סבן חומרי בניין"
// לשוניות: ראשי | עלי | חכמת | Tachograph · איתוראן GPS | כתובות לקוחות | ערים ומרחקים | איכות נתונים | סטטוס חיבור

import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Truck,
  Disc,
  MapPin,
  Building2,
  ShieldAlert,
  Activity,
  Layers,
} from "lucide-react";
import { DriverAvatar } from "./DriverAvatar";

export const DISPATCH_TABS = [
  { to: "/", label: "ראשי", icon: LayoutDashboard },
  { to: "/ali", label: "עלי", icon: Truck, driver: "ali" as const },
  { to: "/hekmat", label: "חכמת", icon: Truck, driver: "hekmat" as const },
  { to: "/tachograph", label: "Tachograph · איתוראן GPS", icon: Disc },
  { to: "/sites", label: "כתובות לקוחות", icon: MapPin },
  { to: "/cities", label: "ערים ומרחקים", icon: Building2 },
  { to: "/quality", label: "איכות נתונים", icon: ShieldAlert },
  { to: "/status", label: "סטטוס חיבור", icon: Activity },
] as const;

export function SmartDispatchNav() {
  const { pathname } = useLocation();

  const isCurrent = (to: string) => {
    if (to === "/") return pathname === "/" || pathname === "/dispatch";
    return pathname.startsWith(to);
  };

  return (
    <nav className="w-full bg-card border-b border-border/70 sticky top-0 z-30 shadow-xs" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-3">
          {/* לוגו ומיתוג סבן */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-9 w-9 rounded-xl bg-emerald-900 text-white flex items-center justify-center font-display font-extrabold shadow-xs">
              סבן
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-extrabold text-sm text-foreground leading-tight">
                סידור חכם
              </div>
              <div className="text-[10px] text-muted-foreground">ח. סבן חומרי בניין</div>
            </div>
          </div>

          {/* לשוניות הניווט העליון */}
          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none flex-1 justify-start md:justify-center">
            {DISPATCH_TABS.map((tab) => {
              const active = isCurrent(tab.to);
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition shrink-0 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  {tab.driver ? (
                    <DriverAvatar driver={tab.driver} size="sm" className="h-4 w-4" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>

          {/* קישורים משניים לתעודות וקנבס */}
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <Link
              to="/notes"
              className="px-2.5 py-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted font-medium"
            >
              ארכיון תעודות
            </Link>
            <Link
              to="/canvas"
              className="px-2.5 py-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted font-medium"
            >
              עורך קנבס
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
