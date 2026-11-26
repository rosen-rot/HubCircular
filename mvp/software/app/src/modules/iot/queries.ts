import "server-only";
import { withActor } from "@/lib/db";
import { assertCan } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";
import type { ReadingQuality } from "./schema";

export interface LatestReading {
  id: string;
  receivedAt: Date;
  measuredAt: Date | null;
  weightG: number | null;
  distanceMm: number | null;
  fillPercent: number | null;
  quality: ReadingQuality;
  rssiDbm: number | null;
  firmwareVersion: string | null;
  simulated: boolean;
}

export interface DeviceStatus {
  id: string;
  code: string;
  kind: "sensor" | "simulator";
  active: boolean;
  lastSeenAt: Date | null;
  containerCode: string;
  containerTareG: number | null;
  containerDemo: boolean;
  materialName: string;
  zoneName: string;
  latest: LatestReading | null;
  readingsLastHour: number;
}

interface Row {
  id: string;
  code: string;
  kind: "sensor" | "simulator";
  active: boolean;
  last_seen_at: Date | null;
  container_code: string;
  container_tare_g: number | null;
  container_origin: "real" | "demo";
  material_name: string;
  zone_name: string;
  readings_last_hour: number;
  r_id: string | null;
  r_received_at: Date | null;
  r_measured_at: Date | null;
  r_weight_g: number | null;
  r_distance_mm: number | null;
  r_fill_percent: string | null;
  r_quality: ReadingQuality | null;
  r_rssi_dbm: number | null;
  r_firmware: string | null;
  r_simulated: boolean | null;
}

const SQL = `
  select d.id, d.code, d.kind, d.active, d.last_seen_at,
         c.code as container_code, c.tare_g as container_tare_g, c.data_origin as container_origin,
         m.name as material_name, z.name as zone_name,
         (select count(*)::int from hc.sensor_readings x where x.device_id = d.id and x.received_at > now() - interval '1 hour') as readings_last_hour,
         r.id as r_id, r.received_at as r_received_at, r.measured_at as r_measured_at, r.weight_g as r_weight_g,
         r.distance_mm as r_distance_mm, r.fill_percent::text as r_fill_percent, r.quality as r_quality,
         r.rssi_dbm as r_rssi_dbm, r.firmware_version as r_firmware, r.simulated as r_simulated
    from hc.devices d
    join hc.containers c on c.id = d.container_id
    join hc.stations s on s.id = c.station_id
    join hc.zones z on z.id = s.zone_id
    join hc.materials m on m.id = c.material_id
    left join lateral (
      select * from hc.sensor_readings r where r.device_id = d.id order by r.received_at desc limit 1
    ) r on true
   where ($1::text is null or c.code = $1)
   order by d.kind, d.code`;

function toStatus(row: Row): DeviceStatus {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    active: row.active,
    lastSeenAt: row.last_seen_at,
    containerCode: row.container_code,
    containerTareG: row.container_tare_g,
    containerDemo: row.container_origin === "demo",
    materialName: row.material_name,
    zoneName: row.zone_name,
    readingsLastHour: row.readings_last_hour,
    latest: row.r_id
      ? {
          id: row.r_id,
          receivedAt: row.r_received_at!,
          measuredAt: row.r_measured_at,
          weightG: row.r_weight_g,
          distanceMm: row.r_distance_mm,
          fillPercent: row.r_fill_percent == null ? null : Number(row.r_fill_percent),
          quality: row.r_quality!,
          rssiDbm: row.r_rssi_dbm,
          firmwareVersion: row.r_firmware,
          simulated: row.r_simulated!,
        }
      : null,
  };
}

/** Dispositivos visibles en el ámbito del actor (RLS por contenedor) con su última lectura. */
export async function listDeviceStatus(actor: Actor | null, opts: { containerCode?: string } = {}): Promise<DeviceStatus[]> {
  assertCan(actor, "catalog:read");
  const rows = await withActor(actor.userId, async (db) => (await db.query<Row>(SQL, [opts.containerCode ?? null])).rows, { readOnly: true });
  return rows.map(toStatus);
}

export interface RecentReading extends LatestReading {
  deviceCode: string;
}

/** Últimas lecturas (para la tabla del panel en vivo). */
export async function listRecentReadings(actor: Actor | null, limit = 20): Promise<RecentReading[]> {
  assertCan(actor, "catalog:read");
  const rows = await withActor(
    actor.userId,
    async (db) =>
      (
        await db.query<{
          id: string; device_code: string; received_at: Date; measured_at: Date | null; weight_g: number | null; distance_mm: number | null;
          fill_percent: string | null; quality: ReadingQuality; rssi_dbm: number | null; firmware_version: string | null; simulated: boolean;
        }>(
          `select r.id, d.code as device_code, r.received_at, r.measured_at, r.weight_g, r.distance_mm, r.fill_percent::text as fill_percent,
                  r.quality, r.rssi_dbm, r.firmware_version, r.simulated
             from hc.sensor_readings r join hc.devices d on d.id = r.device_id
            order by r.received_at desc limit $1`,
          [Math.min(Math.max(limit, 1), 100)],
        )
      ).rows,
    { readOnly: true },
  );
  return rows.map((r) => ({
    id: r.id,
    deviceCode: r.device_code,
    receivedAt: r.received_at,
    measuredAt: r.measured_at,
    weightG: r.weight_g,
    distanceMm: r.distance_mm,
    fillPercent: r.fill_percent == null ? null : Number(r.fill_percent),
    quality: r.quality,
    rssiDbm: r.rssi_dbm,
    firmwareVersion: r.firmware_version,
    simulated: r.simulated,
  }));
}
