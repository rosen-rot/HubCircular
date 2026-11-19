import type { DataOrigin } from "@/modules/indicators/filters";

export const HOME_PERIODS = [7, 30, 90] as const;
export type HomePeriod = (typeof HOME_PERIODS)[number];
export const DEFAULT_HOME_PERIOD: HomePeriod = 30;

export interface HomeFilters {
  days: HomePeriod;
  origin: DataOrigin;
}

export function parseHomeFilters(raw: Record<string, string | string[] | undefined>): HomeFilters {
  const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  const d = Number(one(raw.days));
  const days = (HOME_PERIODS as readonly number[]).includes(d) ? (d as HomePeriod) : DEFAULT_HOME_PERIOD;
  return { days, origin: one(raw.origin) === "demo" ? "demo" : "real" };
}

/** Variación porcentual con un decimal; null si el período anterior no tiene base de comparación. */
export function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) * 1000) / before) / 10;
}

