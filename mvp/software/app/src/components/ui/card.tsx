import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "demo" | "ok" | "warn" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-800",
    demo: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
    ok: "bg-brand-100 text-brand-900",
    warn: "bg-red-100 text-red-900",
  } as const;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...props} />;
}

/** Los datos de demostración jamás deben confundirse con mediciones reales (prompt maestro §3). */
export function DemoBadge() {
  return <Badge tone="demo" title="Dato de demostración: no es una medición real">DEMO</Badge>;
}

export function Alert({
  tone = "info",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "info" | "success" | "error" | "warning" }) {
  const tones = {
    info: "border-sky-300 bg-sky-50 text-sky-950",
    success: "border-brand-500 bg-brand-50 text-brand-900",
    error: "border-red-600 bg-red-50 text-red-950",
    warning: "border-amber-500 bg-amber-50 text-amber-950",
  } as const;
  return (
    <div className={cn("rounded-lg border-l-4 px-4 py-3 text-sm", tones[tone], className)} {...props}>
      {children}
    </div>
  );
}
