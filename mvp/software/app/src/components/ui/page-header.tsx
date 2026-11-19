import type { LucideIcon } from "lucide-react";

/** Encabezado de página: icono, título, subtítulo y acciones a la derecha. El título es el único <h1> de la pantalla. */
export function PageHeader({ icon: Icon, title, subtitle, actions }: { icon?: LucideIcon; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white" aria-hidden="true">
            <Icon className="h-6 w-6" />
          </span>
        ) : null}
        <div>
          <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 max-w-3xl text-slate-700">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
