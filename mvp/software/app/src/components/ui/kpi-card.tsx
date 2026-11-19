import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  mint: "bg-tile-mint",
  sky: "bg-tile-sky",
  amber: "bg-tile-amber",
  lilac: "bg-tile-lilac",
} as const;

/** Tarjeta de resumen: icono, etiqueta, cifra grande y una línea de apoyo. La etiqueta es un <h3>. */
export function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "mint",
  children,
  help,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: keyof typeof TONES;
  children?: React.ReactNode;
  help?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl p-4", TONES[tone], className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-700" aria-hidden="true">
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-700">
            {label}
            {help}
          </h3>
          <p className="text-3xl font-bold tabular-nums text-brand-900">{value}</p>
        </div>
      </div>
      {children ? <div className="mt-2 space-y-0.5 text-sm text-slate-700">{children}</div> : null}
    </div>
  );
}
