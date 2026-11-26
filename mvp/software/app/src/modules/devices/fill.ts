import type { DeviceState, ReadingQuality } from "./schema";

/**
 * Cómo mostrar el llenado de un contenedor a partir del sensor. Reglas (revisión de diseño, docs/28):
 *  · Sin capacidad configurada NO se muestra porcentaje: no se puede interpretar sin saber el tamaño del contenedor.
 *  · Sin sensor, sensor revocado, sin lectura o lectura sin llenado (p. ej. error de sensor) → sin dato; nunca un «0 %».
 *  · Con dato pero sensor desactualizado → se muestra el último valor marcado como desactualizado.
 *  · Es un dato de SENSOR: no es captación ni kilogramos.
 */
export type FillView =
  | { kind: "sin_capacidad" }
  | { kind: "sin_sensor" }
  | { kind: "sin_dato"; reason: "revocado" | "sin_lecturas" | "error_sensor" | "sin_llenado" }
  | { kind: "ok"; percent: number; approxLiters: number; capacityL: number; stale: boolean };

export interface FillInput {
  capacityL: number | null;
  sensor: {
    state: DeviceState;
    last: { fillPercent: number | null; quality: ReadingQuality } | null;
  } | null;
}

export function fillView({ capacityL, sensor }: FillInput): FillView {
  if (capacityL === null || !Number.isInteger(capacityL) || capacityL <= 0) return { kind: "sin_capacidad" };
  if (!sensor) return { kind: "sin_sensor" };
  if (sensor.state === "revocado") return { kind: "sin_dato", reason: "revocado" };
  const last = sensor.last;
  if (!last) return { kind: "sin_dato", reason: "sin_lecturas" };
  if (last.quality === "sensor_error") return { kind: "sin_dato", reason: "error_sensor" };
  if (last.fillPercent === null || !Number.isFinite(last.fillPercent)) return { kind: "sin_dato", reason: "sin_llenado" };
  const percent = Math.min(100, Math.max(0, last.fillPercent));
  return {
    kind: "ok",
    percent,
    approxLiters: Math.round((capacityL * percent) / 100),
    capacityL,
    stale: sensor.state === "desactualizado",
  };
}

export const FILL_NO_DATA_TEXT: Record<Exclude<FillView["kind"], "ok">, string> = {
  sin_capacidad: "Sin capacidad definida",
  sin_sensor: "Sin sensor",
  sin_dato: "Sin dato de llenado",
};

export const FILL_REASON_TEXT: Record<Extract<FillView, { kind: "sin_dato" }>["reason"], string> = {
  revocado: "el sensor está revocado",
  sin_lecturas: "el sensor aún no envía lecturas",
  error_sensor: "la última lectura fue un error de sensor",
  sin_llenado: "la última lectura no trae llenado",
};

/** «65 %» / «65,5 %» con coma decimal. */
export function formatPercent(p: number): string {
  const r = Math.round(p * 10) / 10;
  return `${String(r).replace(".", ",")} %`;
}

/** Nivel visual del llenado (solo color; el texto siempre acompaña). */
export function fillLevel(p: number): "bajo" | "medio" | "alto" {
  if (p >= 80) return "alto";
  if (p >= 50) return "medio";
  return "bajo";
}

/** Valida la capacidad que escribe el administrador. Vacío = quitar capacidad (no mostrar llenado). */
export function parseCapacity(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "") return { ok: true, value: null };
  if (!/^\d{1,5}$/.test(s)) return { ok: false, error: "Ingrese un número entero de litros (sin decimales ni unidades)." };
  const n = Number(s);
  if (n < 1 || n > 10_000) return { ok: false, error: "La capacidad debe estar entre 1 y 10000 litros." };
  return { ok: true, value: n };
}
