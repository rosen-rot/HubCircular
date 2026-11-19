import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { buildClientConfig, quoteRole } from "./db-config";

// int8 (bigint) → number. Las masas están acotadas a 1.000.000 g y las referencias son secuencias
// pequeñas: están muy por debajo de 2^53, por lo que la conversión es segura.
types.setTypeParser(20, (v) => Number(v));

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

const globalForPool = globalThis as unknown as { __hcPool?: Pool };

function appRole(): string | null {
  const role = (process.env.DB_APP_ROLE ?? "hc_app").trim();
  return role ? quoteRole(role) : null;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida. Copie .env.example a .env.local y complete los valores.");
  }
  // El rol de aplicación NO se fija como opción de arranque (`-c role=`): el pooler de Supabase en modo
  // transacción no la respeta. Se aplica con SET LOCAL ROLE dentro de cada transacción (ver `begin`).
  const pool = new Pool({
    ...buildClientConfig(connectionString),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[db] error en cliente inactivo:", err.message));
  return pool;
}

/** Abre transacción y baja a rol de privilegios mínimos; `set local` se revierte solo al terminar la transacción. */
async function begin(client: PoolClient, readOnly: boolean): Promise<void> {
  const role = appRole();
  const mode = readOnly ? "begin read only" : "begin";
  await client.query(role ? `${mode}; set local role ${role}` : mode);
}

export function getPool(): Pool {
  globalForPool.__hcPool ??= createPool();
  return globalForPool.__hcPool;
}

/** Consultas SIN actor (solo funciones de autenticación). No usar para leer datos de negocio. */
export const anon: Queryable = {
  async query(text, values) {
    const client = await getPool().connect();
    try {
      await begin(client, false);
      const result = await client.query(text, values);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },
};

/**
 * Ejecuta `fn` en una transacción con el actor fijado (`hc.actor_id`), de modo que las políticas RLS
 * filtren por su rol y ámbito aunque el código de aplicación olvide un filtro.
 */
export async function withActor<T>(
  actorId: string,
  fn: (db: Queryable) => Promise<T>,
  opts: { readOnly?: boolean } = {},
): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await begin(client, opts.readOnly === true);
    await client.query("select set_config('hc.actor_id', $1, true)", [actorId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
