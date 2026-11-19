export type CoverageStatus = "realizado" | "cero_confirmado" | "omitido" | "pendiente";

export interface Occurrence {
  containerId: string;
  scheduleId: string;
  day: string;
  status: CoverageStatus;
  weighings: number;
  zeroNote: string | null;
}

export interface CoverageSummary {
  realized: number;
  zeroConfirmed: number;
  omitted: number;
  pending: number;
  /** realizado + cero confirmado + omitido: mediciones cuyo día ya terminó o que ya tienen resultado. */
  evaluated: number;
  /** (realizado + cero) / evaluado, en %, con un decimal; null si no hay mediciones evaluadas. */
  percent: number | null;
}

/**
 * Cobertura = mediciones atendidas (con pesaje o con «cero confirmado») sobre las evaluadas.
 * Las pendientes de hoy no cuentan en el denominador (el día no termina) y se informan aparte.
 * Un contenedor sin pesaje y sin «cero» NO se considera cero: queda omitido.
 */
export function summarizeCoverage(occ: Occurrence[]): CoverageSummary {
  const n = (s: CoverageStatus) => occ.filter((o) => o.status === s).length;
  const realized = n("realizado");
  const zeroConfirmed = n("cero_confirmado");
  const omitted = n("omitido");
  const pending = n("pendiente");
  const evaluated = realized + zeroConfirmed + omitted;
  const percent = evaluated === 0 ? null : Math.round(((realized + zeroConfirmed) * 1000) / evaluated) / 10;
  return { realized, zeroConfirmed, omitted, pending, evaluated, percent };
}

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  realizado: "Realizado",
  cero_confirmado: "Cero confirmado",
  omitido: "Omitido",
  pendiente: "Pendiente (hoy)",
};

const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;
const WEEKDAY_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

/** [1,3,5] → "lun, mié, vie" (ISO: 1 = lunes … 7 = domingo). */
export function formatWeekdays(days: number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d - 1] ?? "?").join(", ");
}

export function weekdayName(isoDow: number): string {
  return WEEKDAY_NAMES[isoDow - 1] ?? "?";
}
