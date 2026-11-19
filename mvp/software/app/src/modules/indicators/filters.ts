import { addDays, daysBetween, isValidDateString } from "@/lib/time";

export type DataOrigin = "real" | "demo";

export interface IndicatorFilters {
  /** Primer día local (America/Santiago), inclusive. */
  from: string;
  /** Último día local, inclusive. Nunca posterior a hoy. */
  to: string;
  zoneId: string | null;
  materialId: string | null;
  origin: DataOrigin;
}

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

/**
 * Interpreta los filtros del tablero a partir de la URL. Nunca falla: un valor inválido vuelve al valor por defecto
 * y se informa en `notices`, para que la persona sepa qué período se está mostrando realmente.
 * El origen por defecto es «real»: los datos DEMO solo se ven si se piden de forma explícita.
 */
export function parseIndicatorFilters(raw: Raw, today: string): { filters: IndicatorFilters; notices: string[] } {
  const notices: string[] = [];
  let to = one(raw.to);
  let from = one(raw.from);

  if (to && !isValidDateString(to)) {
    notices.push("La fecha «hasta» no es válida; se usó hoy.");
    to = "";
  }
  if (from && !isValidDateString(from)) {
    notices.push("La fecha «desde» no es válida; se usó el período por defecto.");
    from = "";
  }
  if (!to) to = today;
  if (to > today) {
    notices.push("La fecha «hasta» no puede ser futura; se usó hoy.");
    to = today;
  }
  if (!from) from = addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (from > to) {
    notices.push("La fecha «desde» era posterior a «hasta»; se usó el período por defecto.");
    from = addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  }
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    notices.push(`El período máximo es de ${MAX_RANGE_DAYS} días; se acortó el inicio.`);
    from = addDays(to, -(MAX_RANGE_DAYS - 1));
  }

  const zone = one(raw.zone);
  const material = one(raw.material);
  const origin: DataOrigin = one(raw.origin) === "demo" ? "demo" : "real";
  if (zone && !UUID.test(zone)) notices.push("La zona indicada no es válida; se muestran todas.");
  if (material && !UUID.test(material)) notices.push("El material indicado no es válido; se muestran todos.");

  return {
    filters: {
      from,
      to,
      zoneId: UUID.test(zone) ? zone : null,
      materialId: UUID.test(material) ? material : null,
      origin,
    },
    notices,
  };
}

/** ¿El período incluye el día de hoy (todavía incompleto)? */
export function includesToday(f: IndicatorFilters, today: string): boolean {
  return f.to >= today;
}

/** Parámetros de URL equivalentes (para enlaces y exportaciones). */
export function filtersToParams(f: IndicatorFilters, extra: Record<string, string> = {}): URLSearchParams {
  const q = new URLSearchParams({ from: f.from, to: f.to, origin: f.origin });
  if (f.zoneId) q.set("zone", f.zoneId);
  if (f.materialId) q.set("material", f.materialId);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q;
}
