import "server-only";
import { withActor, type Queryable } from "@/lib/db";
import { santiagoToday } from "@/lib/time";
import type { Actor } from "@/modules/identity/types";
import type { Occurrence, CoverageStatus } from "./coverage";
import type { DataOrigin, IndicatorFilters } from "./filters";

/** Límite de filas de las exportaciones detalladas; si se alcanza, la exportación lo avisa. */
export const EXPORT_ROW_LIMIT = 20_000;
export const MOVEMENT_LIST_LIMIT = 100;

const T0 = "(($1::date)::timestamp at time zone 'America/Santiago')";
const T1 = "((($2::date) + 1)::timestamp at time zone 'America/Santiago')";

export type { Kpis, WeeklyRow, ContainerInfo } from "./queries-types";
import type { Kpis, WeeklyRow, ContainerInfo } from "./queries-types";

export interface Indicators {
  kpis: Kpis;
  weekly: WeeklyRow[];
  occurrences: Occurrence[];
  containers: Record<string, ContainerInfo>;
  /** Pesajes en días sin medición esperada, de contenedores con calendario (informativo). */
  unplannedWeighings: number;
  /** ¿Existe algún pesaje de origen real en el ámbito del actor (cualquier fecha)? */
  hasRealData: boolean;
}

interface KpiRow {
  [k: string]: number;
}

const toKpis = (r: KpiRow): Kpis => ({
  capturedG: r.o_captured_g!,
  weighings: r.o_weighings!,
  contaminated: r.o_contaminated!,
  dispatchedG: r.o_dispatched_g!,
  dispatchedConfirmedG: r.o_dispatched_confirmed_g!,
  dispatchedRejectedG: r.o_dispatched_rejected_g!,
  dispatchedPendingG: r.o_dispatched_pending_g!,
  dispatchedPendingNoEvidenceG: r.o_dispatched_pending_no_evidence_g!,
  reusedG: r.o_reused_g!,
  reusedBackedG: r.o_reused_backed_g!,
  rejectedG: r.o_rejected_g!,
  adjustInG: r.o_adjust_in_g!,
  adjustOutG: r.o_adjust_out_g!,
  transferInG: r.o_transfer_in_g!,
  transferOutG: r.o_transfer_out_g!,
  openingG: r.o_opening_g!,
  closingG: r.o_closing_g!,
  currentG: r.o_current_g!,
});

interface OccRow {
  o_container_id: string;
  o_schedule_id: string;
  day: string;
  o_status: CoverageStatus;
  o_weighings: number;
  o_zero_note: string | null;
}

const toOcc = (r: OccRow): Occurrence => ({
  containerId: r.o_container_id,
  scheduleId: r.o_schedule_id,
  day: r.day,
  status: r.o_status,
  weighings: r.o_weighings,
  zeroNote: r.o_zero_note,
});

async function occurrencesQuery(db: Queryable, from: string, to: string, zone: string | null, material: string | null, origin: DataOrigin): Promise<Occurrence[]> {
  const { rows } = await db.query<OccRow>(
    `select o_container_id, o_schedule_id, o_expected_on::text as day, o_status, o_weighings, o_zero_note
       from hc.coverage_occurrences($1::date, $2::date, $3, $4, $5)`,
    [from, to, zone, material, origin],
  );
  return rows.map(toOcc);
}

async function containerInfo(db: Queryable, ids: string[]): Promise<Record<string, ContainerInfo>> {
  if (ids.length === 0) return {};
  const { rows } = await db.query<{ id: string; code: string; material_name: string; zone_name: string; data_origin: DataOrigin }>(
    `select c.id, c.code, m.name as material_name, z.name as zone_name, c.data_origin
       from hc.containers c
       join hc.materials m on m.id = c.material_id
       join hc.stations s on s.id = c.station_id
       join hc.zones z on z.id = s.zone_id
      where c.id = any($1::uuid[])`,
    [ids],
  );
  return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, code: r.code, materialName: r.material_name, zoneName: r.zone_name, dataOrigin: r.data_origin }]));
}

/** Todos los indicadores del tablero, en una sola transacción de lectura bajo el ámbito del actor. */
export async function getIndicators(actor: Actor, f: IndicatorFilters): Promise<Indicators> {
  return withActor(
    actor.userId,
    async (db) => {
      const args = [f.from, f.to, f.zoneId, f.materialId, f.origin];
      const k = await db.query<KpiRow>("select * from hc.kpi_summary($1::date,$2::date,$3,$4,$5)", args);
      const w = await db.query<{ week_start: string; o_material_id: string; material_name: string; o_captured_g: number; o_weighings: number }>(
        `select k.o_week_start::text as week_start, k.o_material_id, m.name as material_name, k.o_captured_g, k.o_weighings
           from hc.kpi_weekly($1::date,$2::date,$3,$4,$5) k join hc.materials m on m.id = k.o_material_id
          order by k.o_week_start, m.name`,
        args,
      );
      const occurrences = await occurrencesQuery(db, f.from, f.to, f.zoneId, f.materialId, f.origin);
      const u = await db.query<{ n: number }>("select count(*)::int as n from hc.unplanned_weighings($1::date,$2::date,$3,$4,$5)", args);
      const real = await db.query<{ ok: boolean }>("select exists (select 1 from hc.weighings where data_origin = 'real' and hc.actor_in_scope(zone_id)) as ok");
      const containers = await containerInfo(db, [...new Set(occurrences.map((o) => o.containerId))]);
      return {
        kpis: toKpis(k.rows[0]!),
        weekly: w.rows.map((r) => ({ weekStart: r.week_start, materialId: r.o_material_id, materialName: r.material_name, capturedG: r.o_captured_g, weighings: r.o_weighings })),
        occurrences,
        containers,
        unplannedWeighings: u.rows[0]!.n,
        hasRealData: real.rows[0]!.ok,
      };
    },
    { readOnly: true },
  );
}

export interface IndicatorOptions {
  zones: { id: string; name: string }[];
  materials: { id: string; name: string }[];
}

/** Opciones de filtro del origen elegido (el selector nunca mezcla materiales/zonas reales con DEMO). */
export async function loadIndicatorOptions(actor: Actor, origin: DataOrigin): Promise<IndicatorOptions> {
  return withActor(
    actor.userId,
    async (db) => {
      const z = await db.query<{ id: string; name: string }>("select id, name from hc.zones where data_origin = $1 order by name", [origin]);
      const m = await db.query<{ id: string; name: string }>("select id, name from hc.materials where data_origin = $1 order by name", [origin]);
      return { zones: z.rows, materials: m.rows };
    },
    { readOnly: true },
  );
}

export interface PeriodMovement {
  id: string;
  refNo: number;
  type: string;
  quantityG: number;
  occurredAt: Date;
  fromName: string | null;
  toName: string | null;
  destinationName: string | null;
  batchId: string;
  batchRef: number;
  materialName: string;
  verification: "confirmada" | "rechazada" | "pendiente" | null;
  evidenceCount: number;
}

/** Movimientos efectivos del período (soporte de los indicadores): más recientes primero, con tope. */
export async function listPeriodMovements(actor: Actor, f: IndicatorFilters): Promise<{ rows: PeriodMovement[]; truncated: boolean }> {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<{
        id: string; ref_no: number; type: string; quantity_g: number; occurred_at: Date;
        from_name: string | null; to_name: string | null; destination_name: string | null;
        batch_id: string; batch_ref: number; material_name: string; last_status: "confirmada" | "rechazada" | null; evidence_count: number;
      }>(
        `select m.id, m.ref_no, m.type, m.quantity_g, m.occurred_at, zf.name as from_name, zt.name as to_name, d.name as destination_name,
                b.id as batch_id, b.ref_no as batch_ref, mat.name as material_name,
                (select v.status from hc.movement_verifications v where v.movement_id = m.id order by v.decided_at desc, v.id desc limit 1) as last_status,
                (select count(*)::int from hc.movement_evidence e where e.movement_id = m.id) as evidence_count
           from hc.effective_movements() m
           join hc.batches b on b.id = m.batch_id
           join hc.materials mat on mat.id = b.material_id
           left join hc.zones zf on zf.id = m.from_location_id
           left join hc.zones zt on zt.id = m.to_location_id
           left join hc.destinations d on d.id = m.destination_id
          where m.occurred_at >= ${T0} and m.occurred_at < ${T1}
            and m.data_origin = $5
            and ($4::uuid is null or b.material_id = $4)
            and (hc._in_view(m.from_location_id, $3) or hc._in_view(m.to_location_id, $3))
          order by m.occurred_at desc, m.ref_no desc
          limit ${MOVEMENT_LIST_LIMIT + 1}`,
        [f.from, f.to, f.zoneId, f.materialId, f.origin],
      );
      return {
        truncated: rows.length > MOVEMENT_LIST_LIMIT,
        rows: rows.slice(0, MOVEMENT_LIST_LIMIT).map((r) => ({
          id: r.id,
          refNo: r.ref_no,
          type: r.type,
          quantityG: r.quantity_g,
          occurredAt: r.occurred_at,
          fromName: r.from_name,
          toName: r.to_name,
          destinationName: r.destination_name,
          batchId: r.batch_id,
          batchRef: r.batch_ref,
          materialName: r.material_name,
          verification: r.type === "despacho" ? (r.last_status ?? "pendiente") : null,
          evidenceCount: r.evidence_count,
        })),
      };
    },
    { readOnly: true },
  );
}

// ---------------------------------------------------------------------------------------------------
// Exportaciones detalladas (CSV). Misma base de filtros, ámbito y origen que el tablero.
// ---------------------------------------------------------------------------------------------------
const LOCAL = (col: string) => `to_char(${col} at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI:SS')`;

export async function exportWeighings(actor: Actor, f: IndicatorFilters) {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<Record<string, string | number | boolean | null>>(
        `select w.ref_no as pesaje, ${LOCAL("w.occurred_at")} as fecha_local, c.code as contenedor, m.name as material, z.name as zona,
                w.gross_g as bruto_g, w.tare_g as tara_g, w.net_g as neto_g, w.contamination_observed as contaminacion,
                b.ref_no as lote, w.source as fuente, w.data_origin as origen
           from hc.weighings w
           join hc.containers c on c.id = w.container_id
           join hc.materials m on m.id = w.material_id
           join hc.zones z on z.id = w.zone_id
           left join hc.batches b on b.weighing_id = w.id
          where w.occurred_at >= ${T0} and w.occurred_at < ${T1} and w.data_origin = $5
            and hc._in_view(w.zone_id, $3) and ($4::uuid is null or w.material_id = $4)
          order by w.occurred_at, w.ref_no
          limit ${EXPORT_ROW_LIMIT + 1}`,
        [f.from, f.to, f.zoneId, f.materialId, f.origin],
      );
      return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: rows.length > EXPORT_ROW_LIMIT };
    },
    { readOnly: true },
  );
}

export async function exportMovements(actor: Actor, f: IndicatorFilters) {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<Record<string, string | number | boolean | null>>(
        `select m.ref_no as movimiento, ${LOCAL("m.occurred_at")} as fecha_local, m.type as tipo,
                (m.type <> 'correccion' and not exists (select 1 from hc.movements c where c.corrects_movement_id = m.id)) as efectivo,
                b.ref_no as lote, mat.name as material, m.quantity_g as cantidad_g,
                zf.name as desde, zt.name as hasta, d.name as destino,
                case when m.type = 'despacho' then coalesce((select v.status from hc.movement_verifications v where v.movement_id = m.id order by v.decided_at desc, v.id desc limit 1), 'pendiente') end as valorizacion,
                (select count(*)::int from hc.movement_evidence e where e.movement_id = m.id) as evidencias,
                m.reason as motivo, o.ref_no as corrige_movimiento, m.data_origin as origen
           from hc.movements m
           join hc.batches b on b.id = m.batch_id
           join hc.materials mat on mat.id = b.material_id
           left join hc.zones zf on zf.id = m.from_location_id
           left join hc.zones zt on zt.id = m.to_location_id
           left join hc.destinations d on d.id = m.destination_id
           left join hc.movements o on o.id = m.corrects_movement_id
          where m.occurred_at >= ${T0} and m.occurred_at < ${T1} and m.data_origin = $5
            and ($4::uuid is null or b.material_id = $4)
            and (hc._in_view(m.from_location_id, $3) or hc._in_view(m.to_location_id, $3))
          order by m.occurred_at, m.ref_no
          limit ${EXPORT_ROW_LIMIT + 1}`,
        [f.from, f.to, f.zoneId, f.materialId, f.origin],
      );
      return { rows: rows.slice(0, EXPORT_ROW_LIMIT), truncated: rows.length > EXPORT_ROW_LIMIT };
    },
    { readOnly: true },
  );
}

export async function exportCoverage(actor: Actor, f: IndicatorFilters) {
  const data = await getIndicators(actor, f);
  return { occurrences: data.occurrences, containers: data.containers };
}

// ---------------------------------------------------------------------------------------------------
// Calendarios y «cero confirmado»
// ---------------------------------------------------------------------------------------------------
export interface ScheduleRow {
  id: string;
  containerId: string;
  weekdays: number[];
  startOn: string;
  endOn: string | null;
  createdByName: string;
  endedByName: string | null;
}

export interface ContainerSchedules {
  container: ContainerInfo & { active: boolean };
  schedules: ScheduleRow[];
}

/** Contenedores visibles con su historial de calendarios (más reciente primero). */
export async function listContainerSchedules(actor: Actor): Promise<ContainerSchedules[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const c = await db.query<{ id: string; code: string; material_name: string; zone_name: string; data_origin: DataOrigin; active: boolean }>(
        `select c.id, c.code, m.name as material_name, z.name as zone_name, c.data_origin, c.active
           from hc.containers c
           join hc.materials m on m.id = c.material_id
           join hc.stations s on s.id = c.station_id
           join hc.zones z on z.id = s.zone_id
          order by c.data_origin, z.name, c.code`,
      );
      const s = await db.query<{
        id: string; container_id: string; weekdays: number[]; start_on: string; end_on: string | null; created_by_name: string; ended_by_name: string | null;
      }>(
        `select ms.id, ms.container_id, ms.weekdays, ms.start_on::text as start_on, ms.end_on::text as end_on,
                cu.display_name as created_by_name, eu.display_name as ended_by_name
           from hc.measurement_schedules ms
           join hc.profiles cu on cu.id = ms.created_by
           left join hc.profiles eu on eu.id = ms.ended_by
          order by ms.start_on desc, ms.created_at desc`,
      );
      const byContainer = new Map<string, ScheduleRow[]>();
      for (const r of s.rows) {
        const list = byContainer.get(r.container_id) ?? [];
        list.push({ id: r.id, containerId: r.container_id, weekdays: r.weekdays.map(Number), startOn: r.start_on, endOn: r.end_on, createdByName: r.created_by_name, endedByName: r.ended_by_name });
        byContainer.set(r.container_id, list);
      }
      return c.rows.map((r) => ({
        container: { id: r.id, code: r.code, materialName: r.material_name, zoneName: r.zone_name, dataOrigin: r.data_origin, active: r.active },
        schedules: byContainer.get(r.id) ?? [],
      }));
    },
    { readOnly: true },
  );
}

export interface TodayMeasurement {
  occurrence: Occurrence;
  container: ContainerInfo;
}

/** Mediciones esperadas HOY dentro del ámbito del actor (ambos orígenes; cada una lleva su insignia). */
export async function listTodayMeasurements(actor: Actor): Promise<{ today: string; items: TodayMeasurement[] }> {
  const today = santiagoToday();
  return withActor(
    actor.userId,
    async (db) => {
      const occ = [...(await occurrencesQuery(db, today, today, null, null, "real")), ...(await occurrencesQuery(db, today, today, null, null, "demo"))];
      const containers = await containerInfo(db, [...new Set(occ.map((o) => o.containerId))]);
      const items = occ
        .filter((o) => containers[o.containerId])
        .map((o) => ({ occurrence: o, container: containers[o.containerId]! }))
        .sort((a, b) => a.container.dataOrigin.localeCompare(b.container.dataOrigin) || a.container.code.localeCompare(b.container.code));
      return { today, items };
    },
    { readOnly: true },
  );
}
