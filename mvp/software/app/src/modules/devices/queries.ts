import "server-only";
import { withActor } from "@/lib/db";
import type { Actor } from "@/modules/identity/types";
import type { DataOrigin } from "@/modules/indicators/filters";
import { deviceState, type DeviceState, type ReadingQuality } from "./schema";

export interface DeviceReading {
  id: string;
  effectiveAt: Date;
  receivedAt: Date;
  clockOk: boolean;
  weightG: number | null;
  distanceMm: number | null;
  fillPercent: number | null;
  quality: ReadingQuality;
  firmwareVersion: string | null;
}

export interface DeviceItem {
  id: string;
  code: string;
  name: string;
  containerId: string;
  containerCode: string;
  zoneName: string;
  materialName: string;
  tokenPrefix: string;
  staleAfterMinutes: number;
  dataOrigin: DataOrigin;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  tokenRotatedAt: Date | null;
  createdAt: Date;
  state: DeviceState;
  readings24h: number;
  sensorErrors24h: number;
  clockIssues24h: number;
  last: DeviceReading | null;
}

interface Row {
  id: string;
  device_code: string;
  name: string;
  container_id: string;
  container_code: string;
  zone_name: string;
  material_name: string;
  token_prefix: string;
  stale_after_minutes: number;
  data_origin: DataOrigin;
  last_seen_at: Date | null;
  revoked_at: Date | null;
  token_rotated_at: Date | null;
  created_at: Date;
  readings_24h: number;
  sensor_errors_24h: number;
  clock_issues_24h: number;
  r_id: string | null;
  r_effective_at: Date | null;
  r_received_at: Date | null;
  r_clock_ok: boolean | null;
  r_weight_g: number | null;
  r_distance_mm: number | null;
  r_fill_percent: string | null;
  r_quality: ReadingQuality | null;
  r_firmware: string | null;
}

/**
 * Dispositivos visibles para el actor (la RLS aplica el ámbito por zona del contenedor). No se lee el hash del token:
 * el rol de aplicación no tiene permiso sobre esa columna.
 */
export async function listDevices(actor: Actor, now: Date = new Date()): Promise<DeviceItem[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<Row>(
        `select d.id, d.device_code, d.name, d.container_id, c.code as container_code, z.name as zone_name, m.name as material_name,
                d.token_prefix, d.stale_after_minutes, d.data_origin, d.last_seen_at, d.revoked_at, d.token_rotated_at, d.created_at,
                (select count(*)::int from hc.sensor_readings x where x.device_id = d.id and x.received_at > now() - interval '24 hours') as readings_24h,
                (select count(*)::int from hc.sensor_readings x where x.device_id = d.id and x.received_at > now() - interval '24 hours' and x.quality = 'sensor_error') as sensor_errors_24h,
                (select count(*)::int from hc.sensor_readings x where x.device_id = d.id and x.received_at > now() - interval '24 hours' and not x.clock_ok) as clock_issues_24h,
                r.id as r_id, r.effective_at as r_effective_at, r.received_at as r_received_at, r.clock_ok as r_clock_ok,
                r.weight_g as r_weight_g, r.distance_mm as r_distance_mm, r.fill_percent::text as r_fill_percent,
                r.quality as r_quality, r.firmware_version as r_firmware
           from hc.devices d
           join hc.containers c on c.id = d.container_id
           join hc.stations s on s.id = c.station_id
           join hc.zones z on z.id = s.zone_id
           join hc.materials m on m.id = c.material_id
           left join hc.sensor_readings r on r.id = d.last_reading_id
          order by (d.revoked_at is not null), d.device_code`,
      );
      return rows.map((r) => ({
        id: r.id,
        code: r.device_code,
        name: r.name,
        containerId: r.container_id,
        containerCode: r.container_code,
        zoneName: r.zone_name,
        materialName: r.material_name,
        tokenPrefix: r.token_prefix,
        staleAfterMinutes: r.stale_after_minutes,
        dataOrigin: r.data_origin,
        lastSeenAt: r.last_seen_at,
        revokedAt: r.revoked_at,
        tokenRotatedAt: r.token_rotated_at,
        createdAt: r.created_at,
        state: deviceState({ revokedAt: r.revoked_at, lastSeenAt: r.last_seen_at, staleAfterMinutes: r.stale_after_minutes }, now),
        readings24h: r.readings_24h,
        sensorErrors24h: r.sensor_errors_24h,
        clockIssues24h: r.clock_issues_24h,
        last:
          r.r_id && r.r_effective_at && r.r_received_at && r.r_quality
            ? {
                id: r.r_id,
                effectiveAt: r.r_effective_at,
                receivedAt: r.r_received_at,
                clockOk: r.r_clock_ok ?? true,
                weightG: r.r_weight_g,
                distanceMm: r.r_distance_mm,
                fillPercent: r.r_fill_percent === null ? null : Number(r.r_fill_percent),
                quality: r.r_quality,
                firmwareVersion: r.r_firmware,
              }
            : null,
      }));
    },
    { readOnly: true },
  );
}

export interface RecentReading extends DeviceReading {
  deviceCode: string;
  containerCode: string;
  dataOrigin: DataOrigin;
}

/** Últimas lecturas (de solo lectura; informativas, no son captación). */
export async function listRecentReadings(actor: Actor, limit = 15): Promise<RecentReading[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<{
        id: string; device_code: string; container_code: string; data_origin: DataOrigin;
        effective_at: Date; received_at: Date; clock_ok: boolean; weight_g: number | null; distance_mm: number | null;
        fill_percent: string | null; quality: ReadingQuality; firmware_version: string | null;
      }>(
        `select r.id, d.device_code, c.code as container_code, r.data_origin, r.effective_at, r.received_at, r.clock_ok,
                r.weight_g, r.distance_mm, r.fill_percent::text as fill_percent, r.quality, r.firmware_version
           from hc.sensor_readings r
           join hc.devices d on d.id = r.device_id
           join hc.containers c on c.id = r.container_id
          order by r.received_at desc, r.id
          limit $1`,
        [limit],
      );
      return rows.map((r) => ({
        id: r.id,
        deviceCode: r.device_code,
        containerCode: r.container_code,
        dataOrigin: r.data_origin,
        effectiveAt: r.effective_at,
        receivedAt: r.received_at,
        clockOk: r.clock_ok,
        weightG: r.weight_g,
        distanceMm: r.distance_mm,
        fillPercent: r.fill_percent === null ? null : Number(r.fill_percent),
        quality: r.quality,
        firmwareVersion: r.firmware_version,
      }));
    },
    { readOnly: true },
  );
}
