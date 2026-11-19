import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// int8 (bigint) → number. Las masas están acotadas a 1.000.000 g y las referencias son secuencias
// pequeñas: están muy por debajo de 2^53, por lo que la conversión es segura.
types.setTypeParser(20, (v) => Number(v));

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

const globalForPool = globalThis as unknown as { __hcPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida. Copie .env.example a .env.local y complete los valores.");
  }
  const role = (process.env.DB_APP_ROLE ?? "hc_app").trim();
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // La aplicación opera siempre como el rol de privilegios mínimos (RLS efectiva).
    ...(role ? { options: `-c role=${role}` } : {}),
  });
  pool.on("error", (err) => console.error("[db] error en cliente inactivo:", err.message));
  return pool;
}

export function getPool(): Pool {
  globalForPool.__hcPool ??= createPool();
  return globalForPool.__hcPool;
}

/** Consultas SIN actor (solo funciones de autenticación). No usar para leer datos de negocio. */
export const anon: Queryable = {
  query: (text, values) => getPool().query(text, values),
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
    await client.query(opts.readOnly ? "begin read only" : "begin");
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
