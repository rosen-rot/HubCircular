import { formatKg } from "@/modules/weighing/units";
import type { HomeMaterial } from "@/modules/inicio/queries";

/** Misma paleta categórica validada del tablero (separación CVD y piso de visión normal). */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];
const OTHER_COLOR = "#8b8b86";
const SURFACE = "#ffffff";
const C = 90;
const R = 64;
const SW = 26;

const pctText = (n: number) => `${String(n).replace(".", ",")} %`;
const pt = (a: number) => [C + R * Math.cos(a), C + R * Math.sin(a)] as const;

/** Reparto por material del reciclable captado: anillo SVG con leyenda (nombre, kg y %) que es también la tabla de datos. */
export function MaterialsDonut({ materials }: { materials: HomeMaterial[] }) {
  const total = materials.reduce((a, m) => a + m.capturedG, 0);
  if (total <= 0) {
    return <p className="py-6 text-center text-sm text-slate-700">Aún no hay pesajes en este período.</p>;
  }
  const shown = materials.slice(0, SERIES.length);
  const rest = materials.slice(SERIES.length).reduce((a, m) => a + m.capturedG, 0);
  const rows = [
    ...shown.map((m, i) => ({ key: m.id, name: m.name, g: m.capturedG, color: SERIES[i]! })),
    ...(rest > 0 ? [{ key: "otros", name: "Otros materiales", g: rest, color: OTHER_COLOR }] : []),
  ];
  const pct = (g: number) => Math.round((g * 1000) / total) / 10;

  let angle = -Math.PI / 2;
  const arcs = rows.map((r) => {
    const sweep = (r.g / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { ...r, start, end: angle, sweep };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label={`Reparto del reciclable captado por material. Total ${formatKg(total)}.`}>
        {arcs.length === 1 ? (
          <circle cx={C} cy={C} r={R} fill="none" stroke={arcs[0]!.color} strokeWidth={SW}>
            <title>{`${arcs[0]!.name}: ${formatKg(arcs[0]!.g)} (100 %)`}</title>
          </circle>
        ) : (
          arcs.map((a) => {
            const [x0, y0] = pt(a.start);
            const [x1, y1] = pt(a.end);
            return (
              <path
                key={a.key}
                d={`M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${a.sweep > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
                fill="none"
                stroke={a.color}
                strokeWidth={SW}
                strokeLinecap="butt"
              >
                <title>{`${a.name}: ${formatKg(a.g)} (${pctText(pct(a.g))})`}</title>
              </path>
            );
          })
        )}
        {arcs.length > 1
          ? arcs.map((a) => {
              const [x, y] = pt(a.start);
              const ix = C + (R - SW / 2 - 1) * Math.cos(a.start);
              const iy = C + (R - SW / 2 - 1) * Math.sin(a.start);
              const ox = C + (R + SW / 2 + 1) * Math.cos(a.start);
              const oy = C + (R + SW / 2 + 1) * Math.sin(a.start);
              void x;
              void y;
              return <line key={`g${a.key}`} x1={ix} y1={iy} x2={ox} y2={oy} stroke={SURFACE} strokeWidth={2} />;
            })
          : null}
        <text x={C} y={C - 2} textAnchor="middle" className="fill-brand-900 text-[18px] font-bold">
          {formatKg(total)}
        </text>
        <text x={C} y={C + 15} textAnchor="middle" className="fill-slate-700 text-[10px]">
          captados
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-slate-900">{r.name}</span>
            <span className="whitespace-nowrap tabular-nums text-slate-700">{formatKg(r.g)}</span>
            <span className="w-16 whitespace-nowrap text-right tabular-nums font-semibold text-slate-900">{pctText(pct(r.g))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
