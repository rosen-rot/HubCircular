import { cn } from "@/lib/utils";

export interface TimelineEvent {
  key: string;
  title: React.ReactNode;
  when?: string;
  detail?: React.ReactNode;
  tone?: "ok" | "warn" | "neutral";
}

const DOT = { ok: "bg-brand-600", warn: "bg-amber-500", neutral: "bg-slate-400" } as const;

/** Línea de tiempo vertical (lista ordenada). El orden es el cronológico recibido; no se infiere nada que no esté registrado. */
export function Timeline({ events, label }: { events: TimelineEvent[]; label: string }) {
  return (
    <ol aria-label={label} className="relative space-y-4 border-l-2 border-slate-200 pl-5">
      {events.map((e) => (
        <li key={e.key} className="relative" data-testid="evento">
          <span className={cn("absolute -left-[1.6rem] top-1.5 h-3 w-3 rounded-full ring-2 ring-white", DOT[e.tone ?? "neutral"])} aria-hidden="true" />
          <div className="text-sm font-semibold text-slate-900">{e.title}</div>
          {e.when ? <div className="text-xs text-slate-600">{e.when}</div> : null}
          {e.detail ? <div className="mt-0.5 text-sm text-slate-700">{e.detail}</div> : null}
        </li>
      ))}
    </ol>
  );
}
