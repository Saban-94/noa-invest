import type { ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Navigation,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE =
  "group relative inline-flex h-auto min-h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full px-5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none";

function Shine() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3 -translate-x-full -skew-x-12 bg-white/30 transition-transform duration-700 ease-out motion-safe:group-hover:translate-x-[400%] motion-reduce:hidden"
    />
  );
}

export function WazeButton({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  const href = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;

  return (
    <Button
      asChild
      className={`${BASE} bg-gradient-to-l from-sky-600 to-sky-500 text-white shadow-md shadow-sky-600/30 hover:-translate-y-0.5 hover:from-sky-700 hover:to-sky-600 hover:shadow-lg hover:shadow-sky-600/40 focus-visible:ring-sky-600 ${className}`}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`ניווט ב־Waze אל ${address}`}
      >
        <Shine />
        <Navigation
          className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:-rotate-12 motion-reduce:transform-none"
          aria-hidden="true"
        />
        <span className="relative z-10">ניווט ב־Waze</span>
      </a>
    </Button>
  );
}

export function CallButton({
  phone,
  name,
  className = "",
}: {
  phone: string;
  name: string;
  className?: string;
}) {
  const clean = phone.replace(/\D/g, "");

  if (!clean) {
    return (
      <Button
        type="button"
        disabled
        aria-label={`אין מספר טלפון עבור ${name}`}
        className={`${BASE} cursor-not-allowed bg-muted text-muted-foreground shadow-none ${className}`}
      >
        <Phone aria-hidden="true" />
        אין טלפון
      </Button>
    );
  }

  return (
    <Button
      asChild
      className={`${BASE} border border-slate-300 bg-slate-100 text-slate-800 shadow-sm hover:-translate-y-0.5 hover:bg-slate-200 hover:shadow-md focus-visible:ring-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 ${className}`}
    >
      <a href={`tel:${clean}`} aria-label={`חיוג ל${name}`}>
        <Phone
          className="transition-transform duration-300 group-hover:rotate-12 motion-reduce:transform-none"
          aria-hidden="true"
        />
        <span dir="ltr" className="tabular-nums">
          {phone}
        </span>
      </a>
    </Button>
  );
}

interface AdvanceStatusButtonProps {
  nextLabel: string | null;
  loading?: boolean;
  onAdvance: () => void;
  className?: string;
}

export function AdvanceStatusButton({
  nextLabel,
  loading = false,
  onAdvance,
  className = "",
}: AdvanceStatusButtonProps) {
  const done = nextLabel === null;

  return (
    <Button
      type="button"
      variant="outline"
      disabled={done || loading}
      onClick={onAdvance}
      aria-busy={loading}
      className={`${BASE} border-border bg-background text-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted hover:shadow-md focus-visible:ring-primary ${
        done
          ? "!cursor-default !opacity-100 border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          : ""
      } ${className}`}
    >
      {loading ? (
        <Loader2
          className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : done ? (
        <CheckCircle2 aria-hidden="true" />
      ) : null}
      <span>{done ? "הושלם" : `קדם ל${nextLabel}`}</span>
      {!done && !loading && (
        <ArrowLeft
          className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1 motion-reduce:transform-none"
          aria-hidden="true"
        />
      )}
    </Button>
  );
}

interface ToolIconButtonProps {
  icon: LucideIcon;
  /** תווית חובה עבור קוראי מסך ו-tooltip. */
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  children?: ReactNode;
  className?: string;
}

export function ToolIconButton({
  icon: Icon,
  label,
  onClick,
  pressed,
  children,
  className = "",
}: ToolIconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`${BASE} px-3 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary ${
        pressed ? "bg-primary/10 text-primary" : ""
      } ${className}`}
    >
      <Icon aria-hidden="true" />
      {children}
    </Button>
  );
}
