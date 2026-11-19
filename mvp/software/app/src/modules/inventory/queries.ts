import "server-only";
import { withActor } from "@/lib/db";
import type { Actor } from "@/modules/identity/types";

export interface BatchDetail {
  id: string;
  refNo: number;
  initialG: number;
  materialName: string;
  originZoneName: string | null;
  createdAt: Date;
  dataOrigin: "real" | "demo";
  weighingId: string;
  weighingRef: number;
  balances: { zoneId: string; zoneName: string | null; balanceG: number }[];
  totalBalanceG: number;
}

interface BatchRow {
  id: string;
  ref_no: number;
  initial_g: number;
  material_name: string;
  origin_zone_name: string | null;
  created_at: Date;
  data_origin: "real" | "demo";
  weighing_id: string;
  weighing_ref: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lote con su saldo por ubicación (zona). En Fase 1 el saldo es el neto inicial; los movimientos llegan en la iteración 2. */
export async function getBatchDetail(actor: Actor, id: string): Promise<BatchDetail | null> {
  if (!UUID.test(id)) return null;
  return withActor(
    actor.userId,
    async (db) => {
      const b = await db.query<BatchRow>(
        `select b.id, b.ref_no, b.initial_g, m.name as material_name, z.name as origin_zone_name,
                b.created_at, b.data_origin, w.id as weighing_id, w.ref_no as weighing_ref
           from hc.batches b
           join hc.materials m on m.id = b.material_id
           join hc.weighings w on w.id = b.weighing_id
           left join hc.zones z on z.id = b.origin_zone_id
          where b.id = $1`,
        [id],
      );
      const row = b.rows[0];
      if (!row) return null;
      const bal = await db.query<{ zone_id: string; zone_name: string | null; balance_g: number }>(
        `select l.zone_id, z.name as zone_name, l.balance_g
           from hc.batch_location_balances l left join hc.zones z on z.id = l.zone_id
          where l.batch_id = $1 order by z.name`,
        [id],
      );
      const balances = bal.rows.map((r) => ({ zoneId: r.zone_id, zoneName: r.zone_name, balanceG: r.balance_g }));
      return {
        id: row.id,
        refNo: row.ref_no,
        initialG: row.initial_g,
        materialName: row.material_name,
        originZoneName: row.origin_zone_name,
        createdAt: row.created_at,
        dataOrigin: row.data_origin,
        weighingId: row.weighing_id,
        weighingRef: row.weighing_ref,
        balances,
        totalBalanceG: balances.reduce((s, x) => s + x.balanceG, 0),
      };
    },
    { readOnly: true },
  );
}
