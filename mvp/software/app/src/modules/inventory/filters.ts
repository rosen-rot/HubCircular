import { isValidDateString } from "@/lib/time";
import type { DataOrigin } from "@/modules/indicators/filters";

/** Estado del lote derivado de su saldo (no se guarda: se calcula a partir de la captación inicial y el saldo actual). */
export type BatchStatus = "completo" | "parcial" | "sin_saldo";
export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  completo: "En inventario",
  parcial: "Saldo parcial",
  sin_saldo: "Sin saldo",
};

export function batchStatus(initialG: number, balanceG: number): BatchStatus {
  if (balanceG <= 0) return "sin_saldo";
  return balanceG >= initialG ? "completo" : "parcial";
}

export interface BatchFilters {
  from: string;
  to: string;
  materialId: string | null;
  zoneId: string | null;
  status: BatchStatus | null;
  ref: string;
  origin: DataOrigin;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Interpreta los filtros de /lotes desde la URL. Nunca falla: lo inválido se ignora. El origen por defecto es «real». */
export function parseBatchFilters(raw: Raw): BatchFilters {
  const from = one(raw.from);
  const to = one(raw.to);
  const material = one(raw.material);
  const zone = one(raw.zone);
  const status = one(raw.estado);
  const page = Math.floor(Number(one(raw.page)));
  return {
    from: isValidDateString(from) ? from : "",
    to: isValidDateString(to) ? to : "",
    materialId: UUID.test(material) ? material : null,
    zoneId: UUID.test(zone) ? zone : null,
    status: status === "completo" || status === "parcial" || status === "sin_saldo" ? status : null,
    ref: one(raw.ref).slice(0, 64),
    origin: one(raw.origin) === "demo" ? "demo" : "real",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
  };
}

/** Identificador del lote elegido para el panel de detalle (?lote=…), o null si no es un UUID. */
export function parseSelected(raw: Raw): string | null {
  const v = one(raw.lote);
  return UUID.test(v) ? v : null;
}
