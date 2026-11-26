import "server-only";
import { withActor } from "@/lib/db";
import { addDays, santiagoDayRangeToUtc, santiagoToday } from "@/lib/time";
import type { DataOrigin } from "@/modules/indicators/filters";
import type { Actor } from "@/modules/identity/types";
import { formatBatchRef, formatWeighingRef } from "@/modules/weighing/refs";
import {
  accumulationRule,
  contaminationRule,
  missedMeasurementsRule,
  RULES,
  THRESHOLDS,
  type BalanceRow,
  type ContainerOccurrences,
  type OccurrenceStatus,
  type Opportunity,
  type RuleId,
  type ZoneWeighing,
} from "./rules";

export interface RuleResult {
  rule: (typeof RULES)[number];
  /** Qué se revisó (para decir «sin casos» con base). */
  evaluated: string;
  cases: Opportunity[];
}

export interface OpportunitiesReport {
  origin: DataOrigin;
  evaluatedAt: Date;
  results: RuleResult[];
  total: number;
}

/**
 * Evalúa las tres reglas con lo que el actor puede ver (RLS por zona) y SOLO el origen pedido: real o DEMO, nunca juntos.
 * Solo lectura; no guarda nada.
 */
export async function getOpportunities(actor: Actor, origin: DataOrigin, now: Date = new Date()): Promise<OpportunitiesReport> {
  const today = santiagoToday(now);
  return withActor(
    actor.userId,
    async (db) => {
      // 1. Saldos vigentes por lote y zona (fecha de captación = la del pesaje que creó el lote).
      const bal = await db.query<{
        batch_id: string; ref_no: string; zone_id: string; zone_name: string; material_id: string; material_name: string;
        balance_g: string; occurred_at: Date;
      }>(
        `select b.id as batch_id, b.ref_no::text, bl.zone_id, z.name as zone_name, b.material_id, m.name as material_name,
                bl.balance_g::text, w.occurred_at
           from hc.batch_location_balances bl
           join hc.batches b on b.id = bl.batch_id
           join hc.weighings w on w.id = b.weighing_id
           join hc.zones z on z.id = bl.zone_id
           join hc.materials m on m.id = b.material_id
          where bl.balance_g > 0 and b.data_origin = $1`,
        [origin],
      );
      const balances: BalanceRow[] = bal.rows.map((r) => ({
        batchId: r.batch_id,
        batchRef: formatBatchRef(Number(r.ref_no)),
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        materialId: r.material_id,
        materialName: r.material_name,
        balanceG: Number(r.balance_g),
        capturedAt: r.occurred_at,
      }));

      // 2. Mediciones esperadas de los últimos N días (misma función que el tablero; hoy queda «pendiente»).
      const covFrom = addDays(today, -(THRESHOLDS.omitidas.windowDays - 1));
      const occ = await db.query<{ o_container_id: string; day: string; o_status: OccurrenceStatus; code: string; zone_name: string; material_name: string }>(
        `select o.o_container_id, o.o_expected_on::text as day, o.o_status, c.code, z.name as zone_name, m.name as material_name
           from hc.coverage_occurrences($1::date, $2::date, null, null, $3) o
           join hc.containers c on c.id = o.o_container_id
           join hc.stations s on s.id = c.station_id
           join hc.zones z on z.id = s.zone_id
           join hc.materials m on m.id = c.material_id`,
        [covFrom, today, origin],
      );
      const byContainer = new Map<string, ContainerOccurrences>();
      for (const r of occ.rows) {
        const c = byContainer.get(r.o_container_id) ?? {
          containerId: r.o_container_id, code: r.code, zoneName: r.zone_name, materialName: r.material_name, occurrences: [],
        };
        c.occurrences.push({ day: r.day, status: r.o_status });
        byContainer.set(r.o_container_id, c);
      }

      // 3. Pesajes de los últimos N días por zona, con su marca de contaminación.
      const contFrom = santiagoDayRangeToUtc(addDays(today, -(THRESHOLDS.contaminacion.windowDays - 1))).from!;
      const wq = await db.query<{ id: string; ref_no: string; zone_id: string; zone_name: string; occurred_at: Date; contamination_observed: boolean }>(
        `select w.id, w.ref_no::text, w.zone_id, z.name as zone_name, w.occurred_at, w.contamination_observed
           from hc.weighings w
           join hc.zones z on z.id = w.zone_id
          where w.data_origin = $1 and w.occurred_at >= $2 and w.occurred_at <= $3`,
        [origin, contFrom, now],
      );
      const weighings: ZoneWeighing[] = wq.rows.map((r) => ({
        weighingId: r.id,
        weighingRef: formatWeighingRef(Number(r.ref_no)),
        zoneId: r.zone_id,
        zoneName: r.zone_name,
        occurredAt: r.occurred_at,
        contaminated: r.contamination_observed,
      }));

      const zonesWithBalance = new Set(balances.map((b) => `${b.zoneId}|${b.materialId}`)).size;
      const zonesWithWeighings = new Set(weighings.map((w) => w.zoneId)).size;
      const evaluated: Record<RuleId, string> = {
        acumulacion: `${zonesWithBalance} combinación${zonesWithBalance === 1 ? "" : "es"} de material y zona con saldo.`,
        omitidas: `${byContainer.size} contenedor${byContainer.size === 1 ? "" : "es"} con mediciones esperadas en el período.`,
        contaminacion: `${weighings.length} pesaje${weighings.length === 1 ? "" : "s"} en ${zonesWithWeighings} zona${zonesWithWeighings === 1 ? "" : "s"}.`,
      };
      const cases: Record<RuleId, Opportunity[]> = {
        acumulacion: accumulationRule(balances, now),
        omitidas: missedMeasurementsRule([...byContainer.values()]),
        contaminacion: contaminationRule(weighings),
      };
      const results = RULES.map((rule) => ({ rule, evaluated: evaluated[rule.id], cases: cases[rule.id] }));
      return { origin, evaluatedAt: now, results, total: results.reduce((s, r) => s + r.cases.length, 0) };
    },
    { readOnly: true },
  );
}
