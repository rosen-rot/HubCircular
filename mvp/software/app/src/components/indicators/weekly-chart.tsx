import { formatKg } from "@/modules/weighing/units";
import { addDays } from "@/lib/time";
import { isPartialWeek, niceAxisMax, weekStartsBetween } from "@/modules/indicators/weeks";
import type { WeeklyRow } from "@/modules/indicators/queries";

/** Paleta categórica validada (validate_palette.js, modo claro): pasa separación CVD y piso de visión normal. */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];
const OTHER_COLOR = "#8b8b86";
const OTHER_LABEL = "Otros materiales";
const SURFACE = "#ffffff";

const W = 760;
const H = 300;
const M = { top: 12, right: 12, bottom: 44, left: 60 };

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

interface Props {
  weekly: WeeklyRow[];
  /** Materiales del origen elegido en orden estable (por nombre): el color sigue a la entidad, no al ranking. */
  materials: { id: string; name: string }[];
  from: string;
  to: string;
}

/**
 * Captación semanal por material (columnas apiladas, semanas de lunes a domingo en hora de Chile).
 * SVG propio: sin dependencias, con leyenda, títulos por segmento y tabla de datos equivalente.
 */
export function WeeklyChart({ weekly, materials, from, to }: Props) {
  const weeks = weekStartsBetween(from, to);
  const slot = (id: string) => {
    const i = materials.findIndex((m) => m.id === id);
    return i >= 0 && i < SERIES.length ? i : -1; // -1 ⇒ «Otros»
  };
  const legend: { key: string; name: string; color: string }[] = [];
  const present = new Set(weekly.map((r) => r.materialId));
  for (const m of materials) {
    const s = slot(m.id);
    if (s >= 0 && present.has(m.id)) legend.push({ key: m.id, name: m.name, color: SERIES[s]! });
  }
  const hasOther = weekly.some((r) => slot(r.materialId) < 0);
  if (hasOther) legend.push({ key: "other", name: OTHER_LABEL, color: OTHER_COLOR });

  type Seg = { key: string; name: string; color: string; g: number; n: number };
  const byWeek = weeks.map((w) => {
    const segs: Seg[] = [];
    for (const l of legend) {
      const rows = weekly.filter((r) => r.weekStart === w && (l.key === "other" ? slot(r.materialId) < 0 : r.materialId === l.key));
      const g = rows.reduce((a, r) => a + r.capturedG, 0);
      const n = rows.reduce((a, r) => a + r.weighings, 0);
      if (g > 0) segs.push({ key: l.key, name: l.name, color: l.color, g, n });
    }
    return { week: w, segs, total: segs.reduce((a, s) => a + s.g, 0), partial: isPartialWeek(w, from, to) };
  });

  const maxKg = Math.max(0, ...byWeek.map((b) => b.total)) / 1000;
  const { max, step } = niceAxisMax(maxKg);
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const band = innerW / weeks.length;
  const barW = Math.min(44, Math.max(6, band * 0.62));
  const y = (kg: number) => M.top + innerH - (kg / max) * innerH;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(6)));
  const labelEvery = Math.ceil(weeks.length / 12);
  const anyPartial = byWeek.some((b) => b.partial);
  const total = byWeek.reduce((a, b) => a + b.total, 0);
  const summary = `Captación semanal por material, del ${dm(from)} al ${dm(to)}: total ${formatKg(total)} en ${weeks.length} semana${weeks.length === 1 ? "" : "s"}.`;

  return (
    <figure className="space-y-3">
      <figcaption className="text-sm text-slate-700">
        {legend.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Leyenda de materiales">
            {legend.map((l) => (
              <li key={l.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: l.color }} />
                <span>{l.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          "Sin captaciones en el período."
        )}
      </figcaption>

      {total > 0 ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full max-w-full" focusable="false">
          <title>{summary}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#e2e2de" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="#52514e">
                {new Intl.NumberFormat("es-CL").format(t)}
              </text>
            </g>
          ))}
          <text x={14} y={M.top + innerH / 2} transform={`rotate(-90 14 ${M.top + innerH / 2})`} textAnchor="middle" fontSize={12} fill="#52514e">
            kilogramos
          </text>
          {byWeek.map((b, i) => {
            const x = M.left + band * i + (band - barW) / 2;
            let acc = 0;
            return (
              <g key={b.week}>
                {b.segs.map((s) => {
                  const y0 = y(acc / 1000);
                  acc += s.g;
                  const y1 = y(acc / 1000);
                  return (
                    <rect key={s.key} x={x} y={y1} width={barW} height={Math.max(0, y0 - y1)} fill={s.color} stroke={SURFACE} strokeWidth={2}>
                      <title>{`Semana del ${dm(b.week)}${b.partial ? " (parcial)" : ""} · ${s.name}: ${formatKg(s.g)} (${s.n} pesaje${s.n === 1 ? "" : "s"})`}</title>
                    </rect>
                  );
                })}
                {i % labelEvery === 0 ? (
                  <text x={x + barW / 2} y={H - M.bottom + 16} textAnchor="middle" fontSize={12} fill="#52514e">
                    {dm(b.week)}
                    {b.partial ? "*" : ""}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="#8b8b86" strokeWidth={1} />
          <text x={M.left + innerW / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="#52514e">
            Semana (lunes de inicio, dd/mm)
          </text>
        </svg>
      ) : null}

      {anyPartial ? <p className="text-sm text-slate-600">* Semana parcial: el período elegido no la cubre completa (de lunes a domingo).</p> : null}

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-brand-900">Ver tabla de datos</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="sr-only">Captación semanal por material, en kilogramos</caption>
            <thead>
              <tr className="text-slate-800">
                <th scope="col" className="px-2 py-1">Semana</th>
                {legend.map((l) => (
                  <th key={l.key} scope="col" className="px-2 py-1 text-right">{l.name}</th>
                ))}
                <th scope="col" className="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {byWeek.map((b) => (
                <tr key={b.week}>
                  <th scope="row" className="whitespace-nowrap px-2 py-1 font-normal">
                    {dm(b.week)} – {dm(addDays(b.week, 6))}
                    {b.partial ? " (parcial)" : ""}
                  </th>
                  {legend.map((l) => {
                    const s = b.segs.find((x) => x.key === l.key);
                    return (
                      <td key={l.key} className="px-2 py-1 text-right tabular-nums">{s ? formatKg(s.g) : "—"}</td>
                    );
                  })}
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{formatKg(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
