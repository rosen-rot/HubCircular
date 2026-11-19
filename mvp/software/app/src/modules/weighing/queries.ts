import "server-only";
import { withActor } from "@/lib/db";
import { santiagoDayRangeToUtc } from "@/lib/time";
import type { Actor } from "@/modules/identity/types";
import { parseRefQuery } from "./refs";

export interface WeighingRecord {
  id: string;
  refNo: number;
  occurredAt: Date;
  createdAt: Date;
  grossG: number;
  tareG: number;
  netG: number;
  notes: string | null;
  contaminationObserved: boolean;
  dataOrigin: "real" | "demo";
  source: string;
  containerCode: string | null;
  materialName: string;
  zoneName: string | null;
  createdByName: string | null;
  batchId: string | null;
  batchRef: number | null;
}

export interface HistoryFilters {
  from?: string; // YYYY-MM-DD (hora local de Santiago)
  to?: string;
  materialId?: string;
  zoneId?: string;
  userId?: string;
  ref?: string;
  page?: number;
}

export const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  ref_no: number;
  occurred_at: Date;
  created_at: Date;
  gross_g: number;
  tare_g: number;
  net_g: number;
  notes: string | null;
  contamination_observed: boolean;
  data_origin: "real" | "demo";
  source: string;
  container_code: string | null;
  material_name: string;
  zone_name: string | null;
  created_by_name: string | null;
  batch_id: string | null;
  batch_ref: number | null;
}

const SELECT = `
  select w.id, w.ref_no, w.occurred_at, w.created_at, w.gross_g, w.tare_g, w.net_g, w.notes,
         w.contamination_observed, w.data_origin, w.source,
         c.code as container_code, m.name as material_name, z.name as zone_name,
         p.display_name as created_by_name, b.id as batch_id, b.ref_no as batch_ref
    from hc.weighings w
    left join hc.containers c on c.id = w.container_id
    join hc.materials m on m.id = w.material_id
    left join hc.zones z on z.id = w.zone_id
    left join hc.profiles p on p.id = w.created_by
    left join hc.batches b on b.weighing_id = w.id`;

function toRecord(r: Row): WeighingRecord {
  return {
    id: r.id,
    refNo: r.ref_no,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
    grossG: r.gross_g,
    tareG: r.tare_g,
    netG: r.net_g,
    notes: r.notes,
    contaminationObserved: r.contamination_observed,
    dataOrigin: r.data_origin,
    source: r.source,
    containerCode: r.container_code,
    materialName: r.material_name,
    zoneName: r.zone_name,
    createdByName: r.created_by_name,
    batchId: r.batch_id,
    batchRef: r.batch_ref,
  };
}

/** Historial filtrado. Parámetros siempre enlazados ($n); el ámbito por zona lo impone la RLS. */
export async function listWeighings(
  actor: Actor,
  f: HistoryFilters,
): Promise<{ rows: WeighingRecord[]; total: number; page: number; pageSize: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("$n", `$${params.length}`));
  };

  const range = santiagoDayRangeToUtc(f.from, f.to);
  if (range.from) add("w.occurred_at >= $n", range.from);
  if (range.to) add("w.occurred_at < $n", range.to);
  if (f.materialId && UUID.test(f.materialId)) add("w.material_id = $n", f.materialId);
  if (f.zoneId && UUID.test(f.zoneId)) add("hc.zone_within(w.zone_id, $n)", f.zoneId);
  if (f.userId && UUID.test(f.userId)) add("w.created_by = $n", f.userId);
  const ref = f.ref ? parseRefQuery(f.ref) : null;
  if (ref?.kind === "weighing") add("w.ref_no = $n", ref.n);
  if (ref?.kind === "batch") add("b.ref_no = $n", ref.n);
  if (ref?.kind === "container") add("c.code ilike $n", `%${ref.text.replace(/[\\%_]/g, "\\$&")}%`);

  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const page = Math.max(1, Math.floor(f.page ?? 1));

  return withActor(
    actor.userId,
    async (db) => {
      const count = await db.query<{ n: number }>(
        `select count(*)::int as n from hc.weighings w
           left join hc.containers c on c.id = w.container_id
           left join hc.batches b on b.weighing_id = w.id ${clause}`,
        params,
      );
      const rows = await db.query<Row>(
        `${SELECT} ${clause} order by w.occurred_at desc, w.ref_no desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
        params,
      );
      return { rows: rows.rows.map(toRecord), total: count.rows[0]!.n, page, pageSize: PAGE_SIZE };
    },
    { readOnly: true },
  );
}

export async function getWeighing(actor: Actor, id: string): Promise<WeighingRecord | null> {
  if (!UUID.test(id)) return null;
  return withActor(
    actor.userId,
    async (db) => {
      const r = await db.query<Row>(`${SELECT} where w.id = $1`, [id]);
      return r.rows[0] ? toRecord(r.rows[0]) : null;
    },
    { readOnly: true },
  );
}

export interface TodaySummary {
  real: { weighings: number; netG: number };
  demo: { weighings: number; netG: number };
  /** Últimos pesajes registrados por la propia persona (de cualquier día), más recientes primero. */
  mine: { id: string; refNo: number; occurredAt: Date; containerCode: string | null; materialName: string; netG: number; dataOrigin: "real" | "demo" }[];
}

/** Resumen del día (hora de Chile) dentro del ámbito del actor, con origen real y DEMO por separado, y sus últimos registros. */
export async function getTodaySummary(actor: Actor): Promise<TodaySummary> {
  return withActor(
    actor.userId,
    async (db) => {
      const t = await db.query<{ data_origin: "real" | "demo"; n: number; g: number }>(
        `select w.data_origin, count(*)::int as n, coalesce(sum(w.net_g), 0)::bigint as g
           from hc.weighings w
          where hc._local_day(w.occurred_at) = hc._today_cl() and hc._in_view(w.zone_id, null)
          group by w.data_origin`,
      );
      const get = (o: "real" | "demo") => {
        const r = t.rows.find((x) => x.data_origin === o);
        return { weighings: r?.n ?? 0, netG: Number(r?.g ?? 0) };
      };
      const mine = await db.query<{
        id: string; ref_no: number; occurred_at: Date; container_code: string | null; material_name: string; net_g: number; data_origin: "real" | "demo";
      }>(
        `select w.id, w.ref_no, w.occurred_at, c.code as container_code, m.name as material_name, w.net_g, w.data_origin
           from hc.weighings w
           left join hc.containers c on c.id = w.container_id
           join hc.materials m on m.id = w.material_id
          where w.created_by = $1
          order by w.occurred_at desc, w.ref_no desc limit 5`,
        [actor.userId],
      );
      return {
        real: get("real"),
        demo: get("demo"),
        mine: mine.rows.map((r) => ({
          id: r.id, refNo: r.ref_no, occurredAt: r.occurred_at, containerCode: r.container_code,
          materialName: r.material_name, netG: Number(r.net_g), dataOrigin: r.data_origin,
        })),
      };
    },
    { readOnly: true },
  );
}
