import "server-only";
import { withActor } from "@/lib/db";
import { santiagoDayRangeToUtc } from "@/lib/time";
import type { Actor } from "@/modules/identity/types";
import { parseRefQuery } from "@/modules/weighing/refs";
import type { BatchFilters } from "./filters";

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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Lista de lotes (pantalla /lotes)
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const BATCH_PAGE_SIZE = 20;

export interface BatchListItem {
  id: string;
  refNo: number;
  materialName: string;
  originZoneName: string | null;
  createdAt: Date;
  initialG: number;
  balanceG: number;
  dataOrigin: "real" | "demo";
}

export interface BatchList {
  rows: BatchListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Totales de TODO el conjunto filtrado (no solo la página). */
  totals: { initialG: number; balanceG: number; withBalance: number };
}

/**
 * Lotes del origen elegido, con su saldo actual. El ámbito por zona lo impone la RLS (igual que la ficha del lote).
 * Los totales se calculan sobre todo el conjunto filtrado, nunca mezclando origen real con DEMO.
 */
export async function listBatches(actor: Actor, f: BatchFilters): Promise<BatchList> {
  const params: unknown[] = [f.origin];
  const where: string[] = ["b.data_origin = $1"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("$n", `$${params.length}`));
  };
  const range = santiagoDayRangeToUtc(f.from, f.to);
  if (range.from) add("b.created_at >= $n", range.from);
  if (range.to) add("b.created_at < $n", range.to);
  if (f.materialId) add("b.material_id = $n", f.materialId);
  if (f.zoneId) add("exists (select 1 from hc.batch_location_balances lz where lz.batch_id = b.id and lz.balance_g > 0 and hc.zone_within(lz.zone_id, $n))", f.zoneId);
  const ref = f.ref ? parseRefQuery(f.ref) : null;
  if (ref?.kind === "batch") add("b.ref_no = $n", ref.n);
  else if (ref?.kind === "weighing") add("w.ref_no = $n", ref.n);
  else if (ref?.kind === "container") add("c.code ilike $n", `%${ref.text.replace(/[\\%_]/g, "\\$&")}%`);
  if (f.status === "sin_saldo") where.push("coalesce(bal.total, 0) <= 0");
  if (f.status === "completo") where.push("coalesce(bal.total, 0) > 0 and coalesce(bal.total, 0) >= b.initial_g");
  if (f.status === "parcial") where.push("coalesce(bal.total, 0) > 0 and coalesce(bal.total, 0) < b.initial_g");

  const from = `
    from hc.batches b
    join hc.materials m on m.id = b.material_id
    join hc.weighings w on w.id = b.weighing_id
    left join hc.containers c on c.id = w.container_id
    left join hc.zones z on z.id = b.origin_zone_id
    left join (select batch_id, sum(balance_g)::bigint as total from hc.batch_location_balances group by batch_id) bal on bal.batch_id = b.id
    where ${where.join(" and ")}`;

  return withActor(
    actor.userId,
    async (db) => {
      const t = await db.query<{ n: number; initial_g: number; balance_g: number; with_balance: number }>(
        `select count(*)::int as n, coalesce(sum(b.initial_g), 0)::bigint as initial_g,
                coalesce(sum(coalesce(bal.total, 0)), 0)::bigint as balance_g,
                (count(*) filter (where coalesce(bal.total, 0) > 0))::int as with_balance ${from}`,
        params,
      );
      const rows = await db.query<{
        id: string; ref_no: number; material_name: string; origin_zone_name: string | null; created_at: Date;
        initial_g: number; balance_g: number; data_origin: "real" | "demo";
      }>(
        `select b.id, b.ref_no, m.name as material_name, z.name as origin_zone_name, b.created_at, b.initial_g,
                coalesce(bal.total, 0)::bigint as balance_g, b.data_origin ${from}
          order by b.created_at desc, b.ref_no desc limit ${BATCH_PAGE_SIZE} offset ${(f.page - 1) * BATCH_PAGE_SIZE}`,
        params,
      );
      const x = t.rows[0]!;
      return {
        rows: rows.rows.map((r) => ({
          id: r.id, refNo: r.ref_no, materialName: r.material_name, originZoneName: r.origin_zone_name,
          createdAt: r.created_at, initialG: Number(r.initial_g), balanceG: Number(r.balance_g), dataOrigin: r.data_origin,
        })),
        total: x.n,
        page: f.page,
        pageSize: BATCH_PAGE_SIZE,
        totals: { initialG: Number(x.initial_g), balanceG: Number(x.balance_g), withBalance: x.with_balance },
      };
    },
    { readOnly: true },
  );
}
