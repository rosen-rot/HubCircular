import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "pg";

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(dir = path.join(process.cwd(), "db", "migrations")): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((name) => {
      // Se normaliza CRLF→LF: en Windows Git puede convertir los saltos de línea y el checksum no debe cambiar por ello.
      const sql = readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

const LOCK_KEY = 7_340_021; // clave arbitraria de advisory lock para serializar migraciones

/** Aplica migraciones pendientes, cada una en su transacción; falla si una ya aplicada fue modificada. */
export async function runMigrations(client: Client, dir?: string): Promise<{ applied: string[]; skipped: string[] }> {
  const migrations = loadMigrations(dir);
  await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    await client.query("create schema if not exists hc");
    await client.query(`
      create table if not exists hc.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )`);
    const { rows } = await client.query<{ name: string; checksum: string }>("select name, checksum from hc.schema_migrations");
    const done = new Map(rows.map((r) => [r.name, r.checksum]));
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const m of migrations) {
      const prev = done.get(m.name);
      if (prev) {
        if (prev !== m.checksum) {
          throw new Error(`La migración ya aplicada ${m.name} fue modificada (checksum distinto). Cree una migración nueva.`);
        }
        skipped.push(m.name);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(m.sql);
        await client.query("insert into hc.schema_migrations (name, checksum) values ($1, $2)", [m.name, m.checksum]);
        await client.query("commit");
        applied.push(m.name);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Falló la migración ${m.name}: ${(err as Error).message}`);
      }
    }
    return { applied, skipped };
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

export interface MigrationPlan {
  applied: string[];
  pending: string[];
  /** Migraciones aplicadas cuyo archivo cambió (checksum distinto) o que ya no existen en el repositorio. */
  conflicts: string[];
}

/** Compara el repositorio con la BD SIN escribir nada (no crea el esquema ni la tabla de control). */
export async function planMigrations(client: Client, dir?: string): Promise<MigrationPlan> {
  const migrations = loadMigrations(dir);
  const exists = (await client.query<{ t: string | null }>("select to_regclass('hc.schema_migrations')::text as t")).rows[0]?.t;
  const done = new Map<string, string>();
  if (exists) {
    const { rows } = await client.query<{ name: string; checksum: string }>("select name, checksum from hc.schema_migrations");
    for (const r of rows) done.set(r.name, r.checksum);
  }
  const known = new Set(migrations.map((m) => m.name));
  const conflicts = [
    ...migrations.filter((m) => done.has(m.name) && done.get(m.name) !== m.checksum).map((m) => `${m.name} (modificada)`),
    ...[...done.keys()].filter((n) => !known.has(n)).map((n) => `${n} (no existe en el repositorio)`),
  ];
  return {
    applied: migrations.filter((m) => done.has(m.name)).map((m) => m.name),
    pending: migrations.filter((m) => !done.has(m.name)).map((m) => m.name),
    conflicts,
  };
}
