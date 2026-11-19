export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
      <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />
      <span className="sr-only">Cargando historial…</span>
    </div>
  );
}
