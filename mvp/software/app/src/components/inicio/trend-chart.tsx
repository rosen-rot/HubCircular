import { niceAxisMax } from "@/modules/indicators/weeks";
import { formatKg } from "@/modules/weighing/units";
import type { HomeDay } from "@/modules/inicio/queries";

const COLOR = "#2a78d6";
const W = 520;
const H = 240;
const M = { top: 12, right: 14, bottom: 30, left: 46 };
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export type TrendMetric = "kg" | "n";

/** Tendencia diaria (hora de Chile): línea de 2 px con área suave, puntos con título al pasar el cursor y tabla equivalente. */
export function TrendChart({ daily, metric }: { daily: HomeDay[]; metric: TrendMetric }) {
  const val = (d: HomeDay) => (metric === "kg" ? d.capturedG / 1000 : d.weighings);
  const maxV = Math.max(0, ...daily.map(val));
  const { max, step } = niceAxisMax(metric === "n" ? Math.max(maxV, 4) : maxV);
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i: number) => M.left + (daily.length <= 1 ? iw / 2 : (i * iw) / (daily.length - 1));
  const y = (v: number) => M.top + ih - (v / max) * ih;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
  const line = daily.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(val(d)).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(daily.length - 1).toFixed(1)} ${y(0)} L ${x(0).toFixed(1)} ${y(0)} Z`;
  const unit = metric === "kg" ? "kg" : "pesajes";
  const labelIdx = [...new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1])];
  const label = (d: HomeDay) => (metric === "kg" ? formatKg(d.capturedG) : `${d.weighings} pesaje${d.weighings === 1 ? "" : "s"}`);
  const fmtTick = (t: number) => (metric === "kg" ? String(Math.round(t * 100) / 100).replace(".", ",") : String(t));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Tendencia diaria en ${unit}. La tabla siguiente trae los mismos datos.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-700 text-[13px]">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={COLOR} fillOpacity={0.12} />
        <path d={line} fill="none" stroke={COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {daily.map((d, i) => (
          <g key={d.day}>
            <circle cx={x(i)} cy={y(val(d))} r={daily.length > 40 ? 0 : 3.5} fill={COLOR} stroke="#ffffff" strokeWidth={2} />
            <circle cx={x(i)} cy={y(val(d))} r={Math.max(6, Math.min(14, iw / daily.length / 2))} fill="transparent">
              <title>{`${dm(d.day)}: ${label(d)}`}</title>
            </circle>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === daily.length - 1 ? "end" : "middle"} className="fill-slate-700 text-[13px]">
            {dm(daily[i]!.day)}
          </text>
        ))}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-700">Ver los datos en tabla</summary>
        <div className="mt-2 max-h-56 overflow-auto" tabIndex={0} role="region" aria-label="Tabla de datos de la tendencia (se desplaza)">
          <table className="w-full text-left">
            <caption className="sr-only">Pesajes y kilogramos por día</caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-700">
                <th scope="col" className="py-1 pr-3">Día</th>
                <th scope="col" className="py-1 pr-3 text-right">Captado</th>
                <th scope="col" className="py-1 text-right">Pesajes</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day} className="border-b border-slate-100">
                  <th scope="row" className="py-1 pr-3 font-normal">{dm(d.day)}</th>
                  <td className="py-1 pr-3 text-right tabular-nums">{formatKg(d.capturedG)}</td>
                  <td className="py-1 text-right tabular-nums">{d.weighings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
