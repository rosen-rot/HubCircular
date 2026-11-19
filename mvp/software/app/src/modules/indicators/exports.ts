import { summarizeCoverage, COVERAGE_LABEL, type Occurrence } from "./coverage";
import { toCsv, type CsvValue } from "./csv";
import type { IndicatorFilters } from "./filters";
import type { ContainerInfo, Kpis } from "./queries-types";

/** Encabezados de las exportaciones de detalle. DEBEN coincidir con los alias SQL de queries.ts. */
export const WEIGHING_HEADERS = ["pesaje", "fecha_local", "contenedor", "material", "zona", "bruto_g", "tara_g", "neto_g", "contaminacion", "lote", "fuente", "origen"] as const;
export const MOVEMENT_HEADERS = ["movimiento", "fecha_local", "tipo", "efectivo", "lote", "material", "cantidad_g", "desde", "hasta", "destino", "valorizacion", "evidencias", "motivo", "corrige_movimiento", "origen"] as const;

export const TIME_ZONE_NOTE = "America/Santiago";

/** Una tabla lista para escribir: la misma que se usa para el CSV y para la hoja de Excel (así no pueden divergir). */
export interface Table {
  headers: string[];
  rows: CsvValue[][];
}

export function detailTable(headers: readonly string[], rows: Record<string, CsvValue>[], truncatedAt?: number): Table {
  const body: CsvValue[][] = rows.map((r) => headers.map((h) => r[h] ?? null));
  if (truncatedAt) body.push([`# Exportación truncada a ${truncatedAt} filas: acote el período o los filtros`, ...headers.slice(1).map(() => null)]);
  return { headers: [...headers], rows: body };
}

export function detailCsv(headers: readonly string[], rows: Record<string, CsvValue>[], truncatedAt?: number): string {
  const t = detailTable(headers, rows, truncatedAt);
  return toCsv(t.headers, t.rows);
}

export interface KpiOptions {
  kpis: Kpis;
  occurrences: Occurrence[];
  filters: IndicatorFilters;
  zoneName: string | null;
  materialName: string | null;
}

export function kpiTable(opts: KpiOptions): Table {
  const { kpis: k, filters: f } = opts;
  const cov = summarizeCoverage(opts.occurrences);
  const pct = cov.percent === null ? "sin datos" : `${String(cov.percent).replace(".", ",")} %`;
  const rows: [string, CsvValue, string][] = [
    ["captado", k.capturedG, "g"],
    ["pesajes", k.weighings, "n"],
    ["pesajes_con_contaminacion", k.contaminated, "n"],
    ["despachado", k.dispatchedG, "g"],
    ["despachado_valorizacion_confirmada", k.dispatchedConfirmedG, "g"],
    ["despachado_verificacion_rechazada", k.dispatchedRejectedG, "g"],
    ["despachado_sin_decision", k.dispatchedPendingG, "g"],
    ["despachado_sin_decision_sin_evidencia", k.dispatchedPendingNoEvidenceG, "g"],
    ["reutilizado", k.reusedG, "g"],
    ["reutilizado_con_evidencia", k.reusedBackedG, "g"],
    ["rechazado", k.rejectedG, "g"],
    ["ajustes_entrada", k.adjustInG, "g"],
    ["ajustes_salida", k.adjustOutG, "g"],
    ["traslados_entrada_al_ambito", k.transferInG, "g"],
    ["traslados_salida_del_ambito", k.transferOutG, "g"],
    ["inventario_inicio", k.openingG, "g"],
    ["inventario_cierre", k.closingG, "g"],
    ["inventario_actual", k.currentG, "g"],
    ["cobertura_con_pesaje", cov.realized, "n"],
    ["cobertura_cero_confirmado", cov.zeroConfirmed, "n"],
    ["cobertura_omitidas", cov.omitted, "n"],
    ["cobertura_pendientes_hoy", cov.pending, "n"],
    ["cobertura_porcentaje", pct, "%"],
  ];
  return {
    headers: ["indicador", "valor", "unidad", "desde", "hasta", "zona_horaria", "origen", "zona", "material"],
    rows: rows.map(([name, value, unit]) => [name, value, unit, f.from, f.to, TIME_ZONE_NOTE, f.origin, opts.zoneName ?? "todas", opts.materialName ?? "todos"]),
  };
}

export function kpiCsv(opts: KpiOptions): string {
  const t = kpiTable(opts);
  return toCsv(t.headers, t.rows);
}

export function coverageTable(occurrences: Occurrence[], containers: Record<string, ContainerInfo>): Table {
  return {
    headers: ["contenedor", "material", "zona", "fecha", "estado", "pesajes", "nota_cero", "origen"],
    rows: occurrences.map((o) => {
      const c = containers[o.containerId];
      return [c?.code ?? o.containerId, c?.materialName ?? null, c?.zoneName ?? null, o.day, COVERAGE_LABEL[o.status], o.weighings, o.zeroNote, c?.dataOrigin ?? null];
    }),
  };
}

export function coverageCsv(occurrences: Occurrence[], containers: Record<string, ContainerInfo>): string {
  const t = coverageTable(occurrences, containers);
  return toCsv(t.headers, t.rows);
}
