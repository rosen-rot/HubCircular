/**
 * Reglas explicables de oportunidad de mejora (Iteración 5, docs/06 «Reglas de oportunidad mínimas», ADR-031).
 * Funciones puras: reciben datos ya filtrados por ámbito y origen (real o DEMO, nunca juntos) y la hora actual.
 * Cada caso muestra el umbral, lo observado, la evidencia (registros) y la fecha de evaluación. Las sugerencias son
 * prudentes: no afirman causas a partir de una fluctuación aislada.
 *
 * UMBRALES PROVISIONALES: fijos en el código hasta que el Hub los acuerde (docs/11). Cambiarlos aquí cambia la
 * evaluación y el texto mostrado; documentar el cambio en docs/29.
 */
export const THRESHOLDS = {
  acumulacion: { minG: 20_000, minDays: 14 },
  omitidas: { windowDays: 14, minMissed: 3, minScheduled: 5, minCoverage: 0.8 },
  contaminacion: { windowDays: 30, minWeighings: 10, minShare: 0.3 },
} as const;

export type RuleId = keyof typeof THRESHOLDS;

export const RULES: { id: RuleId; name: string; question: string; threshold: string; suggestion: string }[] = [
  {
    id: "acumulacion",
    name: "Acumulación prolongada",
    question: "¿Hay material que lleva mucho tiempo esperando retiro?",
    threshold: `Saldo de un material en una zona de ${THRESHOLDS.acumulacion.minG / 1000} kg o más y su lote más antiguo con ${THRESHOLDS.acumulacion.minDays} días o más.`,
    suggestion: "Revisar la frecuencia de retiro de ese material en esa zona o coordinar un despacho.",
  },
  {
    id: "omitidas",
    name: "Mediciones omitidas",
    question: "¿Hay contenedores que no se están midiendo cuando corresponde?",
    threshold: `En los últimos ${THRESHOLDS.omitidas.windowDays} días: ${THRESHOLDS.omitidas.minMissed} o más mediciones omitidas, o cobertura menor a ${Math.round(THRESHOLDS.omitidas.minCoverage * 100)} % con ${THRESHOLDS.omitidas.minScheduled} o más mediciones esperadas.`,
    suggestion: "Asignar un responsable o programar un recordatorio para ese contenedor; si ya no se usa, terminar su calendario.",
  },
  {
    id: "contaminacion",
    name: "Contaminación frecuente",
    question: "¿Llega material mezclado o sucio con frecuencia a alguna zona?",
    threshold: `En los últimos ${THRESHOLDS.contaminacion.windowDays} días, una zona con ${THRESHOLDS.contaminacion.minWeighings} o más pesajes y ${Math.round(THRESHOLDS.contaminacion.minShare * 100)} % o más marcados con contaminación observada.`,
    suggestion: "Revisar la señalética y la información junto a los contenedores de esa zona.",
  },
];

export interface Evidence {
  label: string;
  href?: string;
}

export interface Opportunity {
  /** Estable para la misma regla y alcance (sirve de key y de ancla). */
  key: string;
  rule: RuleId;
  scope: string;
  /** Lo observado, cuantificado. */
  finding: string;
  evidence: Evidence[];
  /** Cuántos registros respaldan el caso (la lista puede venir recortada). */
  evidenceTotal: number;
  /** Para ordenar dentro de la regla (mayor = más relevante). */
  weight: number;
}

const MAX_EVIDENCE = 10;
const DAY_MS = 86_400_000;
const kg = (g: number) => `${(g / 1000).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const pct = (x: number) => `${Math.round(x * 100)} %`;
const dmy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

// ---------------------------------------------------------------------------------------------------
// 1. Acumulación prolongada
// ---------------------------------------------------------------------------------------------------
export interface BalanceRow {
  batchId: string;
  batchRef: string;
  zoneId: string;
  zoneName: string;
  materialId: string;
  materialName: string;
  balanceG: number;
  capturedAt: Date;
}

export function accumulationRule(rows: BalanceRow[], now: Date): Opportunity[] {
  const t = THRESHOLDS.acumulacion;
  const groups = new Map<string, BalanceRow[]>();
  for (const r of rows) {
    if (r.balanceG <= 0) continue;
    const k = `${r.zoneId}|${r.materialId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: Opportunity[] = [];
  for (const [k, list] of groups) {
    const total = list.reduce((s, r) => s + r.balanceG, 0);
    const oldest = list.reduce((a, r) => (r.capturedAt < a ? r.capturedAt : a), list[0]!.capturedAt);
    const days = Math.floor((now.getTime() - oldest.getTime()) / DAY_MS);
    if (total < t.minG || days < t.minDays) continue;
    const sorted = [...list].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    out.push({
      key: `acumulacion:${k}`,
      rule: "acumulacion",
      scope: `${list[0]!.materialName} · ${list[0]!.zoneName}`,
      finding: `${kg(total)} en inventario en ${list.length} lote${list.length === 1 ? "" : "s"}; el más antiguo lleva ${days} días.`,
      evidence: sorted.slice(0, MAX_EVIDENCE).map((r) => ({
        label: `${r.batchRef} · ${kg(r.balanceG)} · ${Math.floor((now.getTime() - r.capturedAt.getTime()) / DAY_MS)} días`,
        href: `/lotes/${r.batchId}`,
      })),
      evidenceTotal: list.length,
      weight: total * days,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------------------------------------------
// 2. Mediciones omitidas
// ---------------------------------------------------------------------------------------------------
export type OccurrenceStatus = "realizado" | "cero_confirmado" | "omitido" | "pendiente";

export interface ContainerOccurrences {
  containerId: string;
  code: string;
  zoneName: string;
  materialName: string;
  occurrences: { day: string; status: OccurrenceStatus }[];
}

export function missedMeasurementsRule(rows: ContainerOccurrences[]): Opportunity[] {
  const t = THRESHOLDS.omitidas;
  const out: Opportunity[] = [];
  for (const c of rows) {
    const done = c.occurrences.filter((o) => o.status === "realizado" || o.status === "cero_confirmado").length;
    const missed = c.occurrences.filter((o) => o.status === "omitido");
    // Las de hoy (pendientes) no cuentan: todavía se pueden hacer.
    const expected = done + missed.length;
    if (expected === 0) continue;
    const coverage = done / expected;
    const hit = missed.length >= t.minMissed || (expected >= t.minScheduled && coverage < t.minCoverage);
    if (!hit) continue;
    const days = missed.map((o) => o.day).sort().reverse();
    out.push({
      key: `omitidas:${c.containerId}`,
      rule: "omitidas",
      scope: `${c.code} · ${c.materialName} · ${c.zoneName}`,
      finding: `${missed.length} de ${expected} mediciones esperadas quedaron omitidas (cobertura ${pct(coverage)}).`,
      evidence: days.slice(0, MAX_EVIDENCE).map((d) => ({ label: `Omitida el ${dmy(d)}` })),
      evidenceTotal: missed.length,
      weight: missed.length * 1000 + Math.round((1 - coverage) * 100),
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------------------------------------------
// 3. Contaminación frecuente
// ---------------------------------------------------------------------------------------------------
export interface ZoneWeighing {
  weighingId: string;
  weighingRef: string;
  zoneId: string;
  zoneName: string;
  occurredAt: Date;
  contaminated: boolean;
}

export function contaminationRule(rows: ZoneWeighing[]): Opportunity[] {
  const t = THRESHOLDS.contaminacion;
  const byZone = new Map<string, ZoneWeighing[]>();
  for (const r of rows) byZone.set(r.zoneId, [...(byZone.get(r.zoneId) ?? []), r]);
  const out: Opportunity[] = [];
  for (const [zoneId, list] of byZone) {
    // Con pocos pesajes no se concluye nada (base insuficiente).
    if (list.length < t.minWeighings) continue;
    const bad = list.filter((r) => r.contaminated).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const share = bad.length / list.length;
    if (share < t.minShare) continue;
    out.push({
      key: `contaminacion:${zoneId}`,
      rule: "contaminacion",
      scope: list[0]!.zoneName,
      finding: `${bad.length} de ${list.length} pesajes con contaminación observada (${pct(share)}).`,
      evidence: bad.slice(0, MAX_EVIDENCE).map((r) => ({ label: r.weighingRef, href: `/pesajes/${r.weighingId}` })),
      evidenceTotal: bad.length,
      weight: Math.round(share * 1000) * 1000 + list.length,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
