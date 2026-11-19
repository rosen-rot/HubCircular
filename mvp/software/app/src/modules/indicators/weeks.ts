import { addDays } from "@/lib/time";

/** Lunes (ISO) de la semana que contiene la fecha YYYY-MM-DD. */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/** Lunes de todas las semanas que tocan el rango [from, to], sin huecos (las semanas sin datos valen cero). */
export function weekStartsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

/** La semana es parcial si el rango no la cubre completa (lunes a domingo). */
export function isPartialWeek(weekStart: string, from: string, to: string): boolean {
  return from > weekStart || to < addDays(weekStart, 6);
}

/** Máximo "redondo" (1, 2, 5 × 10^k) ≥ value, con 4 divisiones sugeridas. */
export function niceAxisMax(value: number): { max: number; step: number } {
  if (!(value > 0)) return { max: 4, step: 1 };
  const rough = value / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  const stepBase = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  const step = stepBase * pow;
  return { max: Math.ceil(value / step) * step, step };
}
