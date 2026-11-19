import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "todo", label: "Todo junto", hint: "Un Excel (.xlsx) con 4 hojas: indicadores, pesajes, movimientos y cobertura." },
  { value: "kpis", label: "Solo indicadores", hint: "CSV con las cifras del resumen." },
  { value: "pesajes", label: "Solo pesajes", hint: "CSV con cada pesaje." },
  { value: "movimientos", label: "Solo movimientos", hint: "CSV con los movimientos de inventario." },
  { value: "cobertura", label: "Solo cobertura", hint: "CSV con las mediciones esperadas." },
] as const;

/**
 * Selector «¿Qué quieres descargar?». Es un formulario GET normal (sin JavaScript propio): lleva los filtros del tablero
 * como campos ocultos, de modo que lo descargado coincide con lo que se ve en pantalla y respeta el ámbito del usuario.
 */
export function ExportPicker({ filters }: { filters: Record<string, string> }) {
  return (
    <details className="relative">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-brand-600 bg-white px-4 py-2 text-base font-semibold text-brand-800 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden">
        Descargar datos
      </summary>
      <form
        method="get"
        action="/dashboard/export"
        aria-label="Descargar datos del tablero"
        className="absolute left-0 z-20 mt-2 w-[min(26rem,calc(100vw-2rem))] space-y-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-lg"
      >
        {Object.entries(filters).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-bold text-brand-900">¿Qué quieres descargar?</legend>
          {OPTIONS.map((o, i) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-2 py-1.5 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="kind" value={o.value} defaultChecked={i === 0} className="mt-1 h-5 w-5" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                <span className="block text-sm text-slate-700">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button type="submit">Descargar</Button>
        <p className="text-sm text-slate-700">Se descarga lo que ve en pantalla: el mismo período, zona, material y origen (reales o DEMO).</p>
      </form>
    </details>
  );
}
