import { randomBytes } from "node:crypto";
import { Client, types } from "pg";
import { seedDemo, DEMO_USERS } from "../../db/seed/demo";
import { runMigrations } from "../../src/lib/migrator";
import { assertSafeTestUrl } from "./guard";

types.setTypeParser(20, (v) => Number(v));

/** Conexión administrativa (dueño del esquema). Local por defecto; configurable con TEST_DATABASE_URL. */
export const ADMIN_URL = assertSafeTestUrl(process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres");

export const PASSWORDS = {
  admin: "Admin-demo-Passw0rd!",
  operator: "Operador-demo-Passw0rd!",
  reader: "Lector-demo-Passw0rd!",
};

export interface TestDb {
  name: string;
  url: string;
  admin: Client;
  ids: {
    admin: string;
    operator: string;
    reader: string;
    zoneCowork: string;
    zoneLab: string;
    materialCarton: string;
  };
  /** Cliente que opera como el rol de la aplicación (hc_app), con RLS efectiva. */
  appClient(): Promise<Client>;
  /** Ejecuta una función como `hc_app` dentro de una transacción con actor fijado. */
  asActor<T>(actorId: string | null, fn: (c: Client) => Promise<T>): Promise<T>;
  drop(): Promise<void>;
}

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<TestDb> {
  const name = `hc_test_${randomBytes(5).toString("hex")}`;
  const root = new Client({ connectionString: ADMIN_URL });
  await root.connect();
  await root.query(`create database ${name}`);
  await root.end();

  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  const admin = new Client({ connectionString: url });
  await admin.connect();
  await runMigrations(admin);
  if (opts.seed !== false) await seedDemo(admin, { passwords: PASSWORDS, fastHash: true });

  const one = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows[0]?.id as string;
  const ids = {
    admin: await one("select id from hc.profiles where email = $1", [DEMO_USERS.admin.email]),
    operator: await one("select id from hc.profiles where email = $1", [DEMO_USERS.operator.email]),
    reader: await one("select id from hc.profiles where email = $1", [DEMO_USERS.reader.email]),
    zoneCowork: await one("select id from hc.zones where name = 'Cowork DEMO'"),
    zoneLab: await one("select id from hc.zones where name = 'Laboratorio DEMO'"),
    materialCarton: await one("select id from hc.materials where code = 'CARTON'"),
  };

  const extraClients: Client[] = [];
  const appClient = async () => {
    const c = new Client({ connectionString: url, options: "-c role=hc_app" });
    await c.connect();
    extraClients.push(c);
    return c;
  };

  return {
    name,
    url,
    admin,
    ids,
    appClient,
    async asActor(actorId, fn) {
      const c = await appClient();
      try {
        await c.query("begin");
        if (actorId) await c.query("select set_config('hc.actor_id', $1, true)", [actorId]);
        const r = await fn(c);
        await c.query("commit");
        return r;
      } catch (e) {
        await c.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        await c.end().catch(() => undefined);
      }
    },
    async drop() {
      await Promise.all(extraClients.map((c) => c.end().catch(() => undefined)));
      await admin.end().catch(() => undefined);
      const r = new Client({ connectionString: ADMIN_URL });
      await r.connect();
      await r.query(`drop database if exists ${name} with (force)`);
      await r.end();
    },
  };
}

/** Llama a hc.register_weighing como `hc_app` con el actor indicado (transacción propia). */
export async function registerAs(
  db: TestDb,
  actorId: string,
  p: {
    code?: string;
    gross?: number | null;
    tare?: number | null;
    occurredAt?: Date | null;
    notes?: string | null;
    contamination?: boolean;
    key?: string;
  },
) {
  return db.asActor(actorId, async (c) => {
    const r = await c.query(
      "select * from hc.register_weighing($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        actorId,
        p.code ?? "DEMO-Z01-EST01-CARTON",
        p.gross === undefined ? 4250 : p.gross,
        p.tare === undefined ? 350 : p.tare,
        p.occurredAt ?? null,
        p.notes ?? null,
        p.contamination ?? false,
        p.key ?? crypto.randomUUID(),
      ],
    );
    return r.rows[0] as {
      o_weighing_id: string;
      o_batch_id: string;
      o_net_g: number;
      o_duplicate: boolean;
      o_weighing_ref: number;
      o_batch_ref: number;
    };
  });
}

export async function counts(db: TestDb) {
  const q = async (t: string) => Number((await db.admin.query(`select count(*)::int as n from hc.${t}`)).rows[0].n);
  return { weighings: await q("weighings"), batches: await q("batches"), balances: await q("batch_location_balances") };
}
