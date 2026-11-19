import { isValidDateString } from "@/lib/time";
import type { DataOrigin } from "@/modules/indicators/filters";

export const VALORIZATION_STATES = ["pendiente_evidencia", "pendiente_verificacion", "confirmada", "rechazada", "corregido"] as const;
export type ValorizationState = (typeof VALORIZATION_STATES)[number];
export const MOVEMENT_FILTER_TYPES = ["traslado", "despacho", "reutilizacion", "rechazo", "ajuste", "correccion"] as const;
export type MovementFilterType = (typeof MOVEMENT_FILTER_TYPES)[number];

export interface MovementFilters {
  from: string;
  to: string;
  type: MovementFilterType | null;
  state: ValorizationState | null;
  ref: string;
  origin: DataOrigin;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtros de /movimientos desde la URL. Nunca falla: lo inválido se ignora. Origen por defecto «real». */
export function parseMovementFilters(raw: Raw): MovementFilters {
  const from = one(raw.from);
  const to = one(raw.to);
  const type = one(raw.tipo);
  const state = one(raw.estado);
  const page = Math.floor(Number(one(raw.page)));
  return {
    from: isValidDateString(from) ? from : "",
    to: isValidDateString(to) ? to : "",
    type: (MOVEMENT_FILTER_TYPES as readonly string[]).includes(type) ? (type as MovementFilterType) : null,
    state: (VALORIZATION_STATES as readonly string[]).includes(state) ? (state as ValorizationState) : null,
    ref: one(raw.ref).slice(0, 32),
    origin: one(raw.origin) === "demo" ? "demo" : "real",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
  };
}

export const parseSelectedMovement = (raw: Raw): string | null => (UUID.test(one(raw.mov)) ? one(raw.mov) : null);

/** «M-12» o «m12» → movimiento 12; «L-7» → lote 7; otra cosa → null (se ignora). */
export function parseMovementRef(input: string): { kind: "movement" | "batch"; n: number } | null {
  const m = /^([MmLl])-?0*(\d{1,9})$/.exec(input.trim());
  if (!m) return null;
  return { kind: m[1]!.toUpperCase() === "L" ? "batch" : "movement", n: Number(m[2]) };
}
