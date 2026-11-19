import { randomBytes } from "node:crypto";
import type { Client } from "pg";
import { hashPassword } from "../../src/modules/identity/password";

/**
 * Datos de DEMOSTRACIÓN (data_origin = 'demo'). No representan al Hub Providencia ni mediciones reales:
 * los nombres, zonas, materiales y tara son ejemplos para ensayar la plataforma (docs/11, docs/14).
 * Es idempotente: puede ejecutarse varias veces.
 */
export const DEMO_USERS = {
  admin: { email: "admin@demo.hubcircular.test", name: "Administrador DEMO", role: "administrador" as const, scope: null },
  operator: { email: "operador@demo.hubcircular.test", name: "Operador DEMO (Cowork)", role: "operador" as const, scope: "Z01" },
  reader: { email: "lector@demo.hubcircular.test", name: "Lector DEMO", role: "lector" as const, scope: null },
};

export interface DemoPasswords {
  admin: string;
  operator: string;
  reader: string;
}

export function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

export interface SeedOptions {
  passwords: DemoPasswords;
  /** Parámetros scrypt reducidos solo para pruebas automatizadas. */
  fastHash?: boolean;
}

export async function seedDemo(db: Client, opts: SeedOptions): Promise<void> {
  await db.query("begin");
  try {
    const building = await upsert(db, "hc.buildings", "name = $1 and data_origin = 'demo'", ["Edificio DEMO"], "name, data_origin", "$1, 'demo'");
    const z01 = await upsertZone(db, building, "Cowork DEMO");
    const z02 = await upsertZone(db, building, "Laboratorio DEMO");
    const zones: Record<string, string> = { Z01: z01, Z02: z02 };

    const s01 = await upsertStation(db, z01, "DEMO-Z01-EST01", "Estación 01 · Cowork (demo)");
    const s02 = await upsertStation(db, z02, "DEMO-Z02-EST01", "Estación 01 · Laboratorio (demo)");
    // Contenedor global donde se junta de todo (información del equipo, 2026-11-18; no confirmada por el Hub). Ver docs/21.
    const sGlobal = await upsertStation(db, z01, "DEMO-Z01-GLOBAL", "Contenedor global · Cowork (demo)");

    const mat: Record<string, string> = {};
    for (const [code, name] of [
      ["CARTON", "Cartón y papel (demo)"],
      ["PET", "Botellas PET (demo)"],
      ["PEAD", "Envases PEAD (demo)"],
      ["ALUMINIO", "Latas de aluminio (demo)"],
      // Material para contenedores sin material único. Los indicadores de «reciclable capturado» NO deben mezclarlo con el segregado.
      ["DEMO-MIXTO", "Mixto / no clasificable (demo)"],
    ] as const) {
      mat[code] = await upsertMaterial(db, code, name);
    }

    await upsertContainer(db, s01, mat.CARTON!, "DEMO-Z01-EST01-CARTON", 1200);
    await upsertContainer(db, s01, mat.PET!, "DEMO-Z01-EST01-PET", 350);
    await upsertContainer(db, s02, mat.ALUMINIO!, "DEMO-Z02-EST01-ALUMINIO", 500);
    // Sin tara nominal: se desconoce el peso del contenedor global; el operador la ingresa en cada pesaje.
    await upsertContainer(db, sGlobal, mat["DEMO-MIXTO"]!, "DEMO-Z01-GLOBAL-MIXTO", null);

    // Destinos de ejemplo (no existe un gestor real definido; ver docs/21). Un destino DEMO solo admite lotes DEMO.
    await upsertDestination(db, "Gestor de residuos DEMO", "gestor");
    await upsertDestination(db, "Reutilización interna DEMO", "reutilizacion");
    await upsertDestination(db, "Otro destino DEMO", "otro");

    const hashOpts = opts.fastHash ? { N: 2 ** 10, r: 8, p: 1 } : {};
    for (const key of ["admin", "operator", "reader"] as const) {
      const u = DEMO_USERS[key];
      const userId = await upsertProfile(db, u.email, u.name);
      await db.query(
        `insert into hc.local_credentials (user_id, password_hash) values ($1, $2)
         on conflict (user_id) do update set password_hash = excluded.password_hash, failed_attempts = 0, locked_until = null, updated_at = now()`,
        [userId, await hashPassword(opts.passwords[key], hashOpts)],
      );
      const zoneId = u.scope ? zones[u.scope]! : null;
      await db.query(
        `insert into hc.user_roles (user_id, role, zone_id) values ($1, $2, $3)
         on conflict (user_id, role, coalesce(zone_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing`,
        [userId, u.role, zoneId],
      );
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

async function upsert(db: Client, table: string, where: string, whereParams: unknown[], cols: string, vals: string): Promise<string> {
  const found = await db.query<{ id: string }>(`select id from ${table} where ${where}`, whereParams);
  if (found.rows[0]) return found.rows[0].id;
  const ins = await db.query<{ id: string }>(`insert into ${table} (${cols}) values (${vals}) returning id`, whereParams);
  return ins.rows[0]!.id;
}

async function upsertZone(db: Client, buildingId: string, name: string): Promise<string> {
  const f = await db.query<{ id: string }>("select id from hc.zones where building_id = $1 and name = $2", [buildingId, name]);
  if (f.rows[0]) return f.rows[0].id;
  const r = await db.query<{ id: string }>(
    "insert into hc.zones (building_id, name, data_origin) values ($1, $2, 'demo') returning id",
    [buildingId, name],
  );
  return r.rows[0]!.id;
}

async function upsertStation(db: Client, zoneId: string, code: string, name: string): Promise<string> {
  const f = await db.query<{ id: string }>("select id from hc.stations where code = $1", [code]);
  if (f.rows[0]) return f.rows[0].id;
  const r = await db.query<{ id: string }>(
    "insert into hc.stations (zone_id, code, name, data_origin) values ($1, $2, $3, 'demo') returning id",
    [zoneId, code, name],
  );
  return r.rows[0]!.id;
}

async function upsertMaterial(db: Client, code: string, name: string): Promise<string> {
  const f = await db.query<{ id: string }>("select id from hc.materials where code = $1", [code]);
  if (f.rows[0]) return f.rows[0].id;
  const r = await db.query<{ id: string }>(
    "insert into hc.materials (code, name, data_origin) values ($1, $2, 'demo') returning id",
    [code, name],
  );
  return r.rows[0]!.id;
}

async function upsertContainer(db: Client, stationId: string, materialId: string, code: string, tareG: number | null): Promise<void> {
  await db.query(
    `insert into hc.containers (station_id, material_id, code, tare_g, data_origin) values ($1, $2, $3, $4, 'demo')
     on conflict (code) do nothing`,
    [stationId, materialId, code, tareG],
  );
}

async function upsertDestination(db: Client, name: string, type: "gestor" | "reutilizacion" | "otro"): Promise<void> {
  await db.query(
    `insert into hc.destinations (name, type, data_origin) values ($1, $2, 'demo')
     on conflict (lower(btrim(name)), data_origin) do nothing`,
    [name, type],
  );
}

async function upsertProfile(db: Client, email: string, name: string): Promise<string> {
  const f = await db.query<{ id: string }>("select id from hc.profiles where email = $1", [email]);
  if (f.rows[0]) return f.rows[0].id;
  const r = await db.query<{ id: string }>("insert into hc.profiles (email, display_name) values ($1, $2) returning id", [email, name]);
  return r.rows[0]!.id;
}
