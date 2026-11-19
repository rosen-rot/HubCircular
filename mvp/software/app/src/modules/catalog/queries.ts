import "server-only";
import { withActor } from "@/lib/db";
import type { Actor } from "@/modules/identity/types";

export interface ContainerOption {
  id: string;
  code: string;
  tareG: number | null;
  dataOrigin: "real" | "demo";
  active: boolean;
  fullyActive: boolean;
  materialName: string;
  materialCode: string;
  stationName: string;
  zoneId: string;
  zoneName: string;
}

interface ContainerRow {
  id: string;
  code: string;
  tare_g: number | null;
  data_origin: "real" | "demo";
  active: boolean;
  fully_active: boolean;
  material_name: string;
  material_code: string;
  station_name: string;
  zone_id: string;
  zone_name: string;
}

/** Contenedores visibles para el actor (RLS aplica el ámbito por zona). */
export async function listContainers(actor: Actor, opts: { onlyUsable?: boolean } = {}): Promise<ContainerOption[]> {
  return withActor(
    actor.userId,
    async (db) => {
      const { rows } = await db.query<ContainerRow>(
        `select c.id, c.code, c.tare_g, c.data_origin, c.active,
                (c.active and s.active and z.active and m.active) as fully_active,
                m.name as material_name, m.code as material_code,
                s.name as station_name, z.id as zone_id, z.name as zone_name
           from hc.containers c
           join hc.stations s on s.id = c.station_id
           join hc.zones z on z.id = s.zone_id
           join hc.materials m on m.id = c.material_id
          ${opts.onlyUsable ? "where c.active and s.active and z.active and m.active" : ""}
          order by z.name, s.name, c.code`,
      );
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        tareG: r.tare_g,
        dataOrigin: r.data_origin,
        active: r.active,
        fullyActive: r.fully_active,
        materialName: r.material_name,
        materialCode: r.material_code,
        stationName: r.station_name,
        zoneId: r.zone_id,
        zoneName: r.zone_name,
      }));
    },
    { readOnly: true },
  );
}

export interface FilterOptions {
  materials: { id: string; name: string }[];
  zones: { id: string; name: string }[];
  users: { id: string; name: string }[];
}

export async function loadFilterOptions(actor: Actor): Promise<FilterOptions> {
  return withActor(
    actor.userId,
    async (db) => {
      // Secuencial: un cliente de `pg` no admite consultas concurrentes dentro de una misma transacción.
      const m = await db.query<{ id: string; name: string }>("select id, name from hc.materials order by name");
      const z = await db.query<{ id: string; name: string }>("select id, name from hc.zones order by name");
      const u = await db.query<{ id: string; name: string }>(
        "select id, display_name as name from hc.profiles where active order by display_name",
      );
      return { materials: m.rows, zones: z.rows, users: u.rows };
    },
    { readOnly: true },
  );
}
