import "server-only";
import { withActor } from "@/lib/db";
import type { Actor } from "@/modules/identity/types";
import type { DestinationType, EvidenceKind, MovementType } from "./schema";

export interface DestinationItem {
  id: string;
  name: string;
  type: DestinationType;
  active: boolean;
  dataOrigin: "real" | "demo";
}

export async function listDestinations(actor: Actor, opts: { onlyActive?: boolean } = {}): Promise<DestinationItem[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<{ id: string; name: string; type: DestinationType; active: boolean; data_origin: "real" | "demo" }>(
        `select id, name, type, active, data_origin from hc.destinations ${opts.onlyActive ? "where active" : ""} order by data_origin, type, name`,
      );
      return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, active: r.active, dataOrigin: r.data_origin }));
    },
    { readOnly: true },
  );
}

export interface MovableBatch {
  id: string;
  refNo: number;
  materialName: string;
  dataOrigin: "real" | "demo";
  totalG: number;
  balances: { zoneId: string; zoneName: string; balanceG: number }[];
}

/** Lotes con saldo disponible dentro del ámbito del actor (RLS), más recientes primero. */
export async function listMovableBatches(actor: Actor): Promise<MovableBatch[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<{
        id: string;
        ref_no: number;
        material_name: string;
        data_origin: "real" | "demo";
        zone_id: string;
        zone_name: string;
        balance_g: number;
      }>(
        `select b.id, b.ref_no, m.name as material_name, b.data_origin, l.zone_id, z.name as zone_name, l.balance_g
           from hc.batches b
           join hc.materials m on m.id = b.material_id
           join hc.batch_location_balances l on l.batch_id = b.id and l.balance_g > 0
           join hc.zones z on z.id = l.zone_id and z.active
          order by b.ref_no desc, z.name
          limit 600`,
      );
      const map = new Map<string, MovableBatch>();
      for (const r of rows) {
        let b = map.get(r.id);
        if (!b) {
          b = { id: r.id, refNo: r.ref_no, materialName: r.material_name, dataOrigin: r.data_origin, totalG: 0, balances: [] };
          map.set(r.id, b);
        }
        b.balances.push({ zoneId: r.zone_id, zoneName: r.zone_name, balanceG: r.balance_g });
        b.totalG += r.balance_g;
      }
      return [...map.values()];
    },
    { readOnly: true },
  );
}

export async function listActiveZones(actor: Actor): Promise<{ id: string; name: string }[]> {
  return withActor(
    actor.userId,
    async (db) => (await db.query<{ id: string; name: string }>("select id, name from hc.zones where active order by name")).rows,
    { readOnly: true },
  );
}

export interface MovementItem {
  id: string;
  refNo: number;
  type: MovementType | "correccion";
  quantityG: number;
  fromZone: string | null;
  toZone: string | null;
  destinationName: string | null;
  destinationType: DestinationType | null;
  occurredAt: Date;
  createdByName: string;
  reason: string | null;
  correctsRef: number | null;
  correctedByRef: number | null;
  evidence: { id: string; kind: EvidenceKind; reference: string; note: string | null; createdAt: Date; createdByName: string }[];
  verifications: { id: string; status: "confirmada" | "rechazada"; notes: string | null; decidedAt: Date; decidedByName: string }[];
}

/** Movimientos de un lote (RLS por ubicación) con su evidencia y el historial de verificaciones. */
export async function listBatchMovements(actor: Actor, batchId: string): Promise<MovementItem[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const ms = await db.query<{
        id: string;
        ref_no: number;
        type: MovementType | "correccion";
        quantity_g: number;
        from_zone: string | null;
        to_zone: string | null;
        destination_name: string | null;
        destination_type: DestinationType | null;
        occurred_at: Date;
        created_by_name: string;
        reason: string | null;
        corrects_ref: number | null;
        corrected_by_ref: number | null;
      }>(
        `select m.id, m.ref_no, m.type, m.quantity_g, zf.name as from_zone, zt.name as to_zone,
                d.name as destination_name, d.type as destination_type, m.occurred_at,
                p.display_name as created_by_name, m.reason,
                o.ref_no as corrects_ref, c.ref_no as corrected_by_ref
           from hc.movements m
           join hc.profiles p on p.id = m.created_by
           left join hc.zones zf on zf.id = m.from_location_id
           left join hc.zones zt on zt.id = m.to_location_id
           left join hc.destinations d on d.id = m.destination_id
           left join hc.movements o on o.id = m.corrects_movement_id
           left join hc.movements c on c.corrects_movement_id = m.id
          where m.batch_id = $1
          order by m.ref_no`,
        [batchId],
      );
      if (ms.rows.length === 0) return [];
      const ids = ms.rows.map((m) => m.id);
      const ev = await db.query<{ id: string; movement_id: string; kind: EvidenceKind; reference: string; note: string | null; created_at: Date; by: string }>(
        `select e.id, e.movement_id, e.kind, e.reference, e.note, e.created_at, p.display_name as by
           from hc.movement_evidence e join hc.profiles p on p.id = e.created_by
          where e.movement_id = any($1::uuid[]) order by e.created_at, e.id`,
        [ids],
      );
      const ver = await db.query<{ id: string; movement_id: string; status: "confirmada" | "rechazada"; notes: string | null; decided_at: Date; by: string }>(
        `select v.id, v.movement_id, v.status, v.notes, v.decided_at, p.display_name as by
           from hc.movement_verifications v join hc.profiles p on p.id = v.decided_by
          where v.movement_id = any($1::uuid[]) order by v.decided_at, v.id`,
        [ids],
      );
      return ms.rows.map((m) => ({
        id: m.id,
        refNo: m.ref_no,
        type: m.type,
        quantityG: m.quantity_g,
        fromZone: m.from_zone,
        toZone: m.to_zone,
        destinationName: m.destination_name,
        destinationType: m.destination_type,
        occurredAt: m.occurred_at,
        createdByName: m.created_by_name,
        reason: m.reason,
        correctsRef: m.corrects_ref,
        correctedByRef: m.corrected_by_ref,
        evidence: ev.rows
          .filter((e) => e.movement_id === m.id)
          .map((e) => ({ id: e.id, kind: e.kind, reference: e.reference, note: e.note, createdAt: e.created_at, createdByName: e.by })),
        verifications: ver.rows
          .filter((v) => v.movement_id === m.id)
          .map((v) => ({ id: v.id, status: v.status, notes: v.notes, decidedAt: v.decided_at, decidedByName: v.by })),
      }));
    },
    { readOnly: true },
  );
}

/** Estado de valorización de un despacho: derivado de la última verificación (no es un movimiento). */
export function valorizationStatus(m: Pick<MovementItem, "type" | "evidence" | "verifications" | "correctedByRef">):
  | "pendiente_evidencia"
  | "pendiente_verificacion"
  | "confirmada"
  | "rechazada"
  | "corregido"
  | null {
  if (m.type !== "despacho") return null;
  if (m.correctedByRef !== null) return "corregido";
  const last = m.verifications[m.verifications.length - 1];
  if (last) return last.status;
  return m.evidence.length === 0 ? "pendiente_evidencia" : "pendiente_verificacion";
}
