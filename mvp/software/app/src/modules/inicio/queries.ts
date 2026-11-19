import "server-only";
import { withActor } from "@/lib/db";
import { addDays, daysBetween, santiagoToday } from "@/lib/time";
import type { Actor } from "@/modules/identity/types";
import { summarizeCoverage, type CoverageStatus } from "@/modules/indicators/coverage";
import type { DataOrigin } from "@/modules/indicators/filters";
import type { HomeFilters } from "./filters";

export interface HomeMaterial {
  id: string;
  name: string;
  capturedG: number;
}
export interface HomeDay {
  day: string;
  capturedG: number;
  weighings: number;
}
export interface HomeRecent {
  id: string;
  refNo: number;
  occurredAt: Date;
  containerCode: string | null;
  materialName: string;
  netG: number;
  createdByName: string | null;
  dataOrigin: DataOrigin;
}

export interface Home {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  capturedG: number;
  prevCapturedG: number;
  weighings: number;
  prevWeighings: number;
  currentG: number;
  weighingsToday: number;
  weighingsYesterday: number;
  activeContainers: number;
  materials: HomeMaterial[];
  daily: HomeDay[];
  todayCoverage: { total: number; realized: number; zeroConfirmed: number; pending: number; omitted: number };
  recent: HomeRecent[];
  hasRealData: boolean;
}

interface KRow {
  o_captured_g: number;
  o_weighings: number;
  o_current_g: number;
}

/**
 * Datos del Inicio en una sola transacción de lectura bajo el ámbito del actor.
 * Todo proviene de pesajes, movimientos y calendarios registrados: no hay cifras estimadas.
 */
export async function getHome(actor: Actor, f: HomeFilters): Promise<Home> {
  const today = santiagoToday();
  const to = today;
  const from = addDays(to, -(f.days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(f.days - 1));
  const yesterday = addDays(today, -1);

  return withActor(
    actor.userId,
    async (db) => {
      const kNow = await db.query<KRow>("select * from hc.kpi_summary($1::date,$2::date,null,null,$3)", [from, to, f.origin]);
      const kPrev = await db.query<KRow>("select * from hc.kpi_summary($1::date,$2::date,null,null,$3)", [prevFrom, prevTo, f.origin]);

      const mats = await db.query<{ id: string; name: string; g: number }>(
        `select k.o_material_id as id, m.name, sum(k.o_captured_g)::bigint as g
           from hc.kpi_weekly($1::date,$2::date,null,null,$3) k join hc.materials m on m.id = k.o_material_id
          group by 1, 2 having sum(k.o_captured_g) > 0 order by 3 desc, 2`,
        [from, to, f.origin],
      );

      const days = await db.query<{ d: string; g: number; n: number }>(
        `select hc._local_day(w.occurred_at)::text as d, sum(w.net_g)::bigint as g, count(*)::int as n
           from hc.weighings w
          where w.occurred_at >= (($1::date)::timestamp at time zone 'America/Santiago')
            and w.occurred_at <  ((($2::date) + 1)::timestamp at time zone 'America/Santiago')
            and w.data_origin = $3 and hc._in_view(w.zone_id, null)
          group by 1`,
        [from, to, f.origin],
      );
      const byDay = new Map(days.rows.map((r) => [r.d, r]));
      const daily: HomeDay[] = [];
      for (let i = 0; i < daysBetween(from, to) + 1; i++) {
        const d = addDays(from, i);
        const r = byDay.get(d);
        daily.push({ day: d, capturedG: Number(r?.g ?? 0), weighings: r?.n ?? 0 });
      }

      const cont = await db.query<{ n: number }>(
        `select count(*)::int as n
           from hc.containers c join hc.stations s on s.id = c.station_id
          where c.active and c.data_origin = $1 and hc._in_view(s.zone_id, null)`,
        [f.origin],
      );

      const cov = await db.query<{ o_status: CoverageStatus; o_weighings: number }>(
        "select o_status, o_weighings from hc.coverage_occurrences($1::date,$1::date,null,null,$2)",
        [today, f.origin],
      );
      const covSum = summarizeCoverage(
        cov.rows.map((r) => ({ containerId: "", scheduleId: "", day: today, status: r.o_status, weighings: r.o_weighings, zeroNote: null })),
      );

      const recent = await db.query<{
        id: string; ref_no: number; occurred_at: Date; container_code: string | null; material_name: string;
        net_g: number; created_by_name: string | null; data_origin: DataOrigin;
      }>(
        `select w.id, w.ref_no, w.occurred_at, c.code as container_code, m.name as material_name, w.net_g,
                p.display_name as created_by_name, w.data_origin
           from hc.weighings w
           left join hc.containers c on c.id = w.container_id
           join hc.materials m on m.id = w.material_id
           left join hc.profiles p on p.id = w.created_by
          where w.data_origin = $1 and hc._in_view(w.zone_id, null)
          order by w.occurred_at desc, w.ref_no desc limit 6`,
        [f.origin],
      );

      const real = await db.query<{ ok: boolean }>("select exists (select 1 from hc.weighings where data_origin = 'real' and hc.actor_in_scope(zone_id)) as ok");

      const todayRow = byDay.get(today);
      const yRow = byDay.get(yesterday);
      const k = kNow.rows[0]!;
      const kp = kPrev.rows[0]!;
      return {
        from,
        to,
        prevFrom,
        prevTo,
        capturedG: Number(k.o_captured_g),
        prevCapturedG: Number(kp.o_captured_g),
        weighings: Number(k.o_weighings),
        prevWeighings: Number(kp.o_weighings),
        currentG: Number(k.o_current_g),
        weighingsToday: todayRow?.n ?? 0,
        weighingsYesterday: yRow?.n ?? 0,
        activeContainers: cont.rows[0]!.n,
        materials: mats.rows.map((r) => ({ id: r.id, name: r.name, capturedG: Number(r.g) })),
        daily,
        todayCoverage: {
          total: cov.rows.length,
          realized: covSum.realized,
          zeroConfirmed: covSum.zeroConfirmed,
          pending: covSum.pending,
          omitted: covSum.omitted,
        },
        recent: recent.rows.map((r) => ({
          id: r.id, refNo: r.ref_no, occurredAt: r.occurred_at, containerCode: r.container_code,
          materialName: r.material_name, netG: Number(r.net_g), createdByName: r.created_by_name, dataOrigin: r.data_origin,
        })),
        hasRealData: real.rows[0]!.ok,
      };
    },
    { readOnly: true },
  );
}
