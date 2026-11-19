import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { DEMO_USERS } from "../../db/seed/demo";
import { createTestDb, type TestDb } from "../helpers/db";

/**
 * Verifica src/lib/db.ts tal como funcionará contra Supabase: se conecta con un rol de alto privilegio
 * (aquí `postgres`) SIN opción de arranque `-c role=` y baja a hc_app con SET LOCAL ROLE en cada transacción.
 */
let db: TestDb;
let dbmod: typeof import("../../src/lib/db");

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  const g = globalThis as unknown as { __hcPool?: Pool };
  delete g.__hcPool;
  dbmod = await import("../../src/lib/db");
});

afterAll(async () => {
  const g = globalThis as unknown as { __hcPool?: Pool };
  await g.__hcPool?.end().catch(() => undefined);
  delete g.__hcPool;
  await db.drop();
});

describe("rol de aplicación vía SET LOCAL ROLE", () => {
  it("dentro de withActor la sesión es hc_app", async () => {
    const who = await dbmod.withActor(db.ids.admin, async (q) => (await q.query<{ r: string }>("select current_user as r")).rows[0]!.r);
    expect(who).toBe("hc_app");
  });

  it("dentro de anon la sesión también es hc_app", async () => {
    const who = (await dbmod.anon.query<{ r: string }>("select current_user as r")).rows[0]!.r;
    expect(who).toBe("hc_app");
  });

  it("el rol no se filtra entre transacciones del pool (fuera de la transacción vuelve al rol de conexión)", async () => {
    await dbmod.withActor(db.ids.admin, async () => undefined);
    const client = await dbmod.getPool().connect();
    try {
      const r = (await client.query<{ r: string }>("select current_user as r")).rows[0]!.r;
      expect(r).not.toBe("hc_app");
    } finally {
      client.release();
    }
  });

  it("RLS efectiva: el operador de Z01 no ve la zona de laboratorio; el administrador ve ambas", async () => {
    const op = await dbmod.withActor(db.ids.operator, async (q) => (await q.query("select id from hc.zones")).rows.length, { readOnly: true });
    const ad = await dbmod.withActor(db.ids.admin, async (q) => (await q.query("select id from hc.zones")).rows.length, { readOnly: true });
    expect(op).toBe(1);
    expect(ad).toBe(2);
  });

  it("sin actor no se ve nada de negocio", async () => {
    const n = (await dbmod.anon.query("select id from hc.zones")).rows.length;
    expect(n).toBe(0);
  });

  it("registra un pesaje y es idempotente usando solo la capa db.ts", async () => {
    const key = crypto.randomUUID();
    const run = () =>
      dbmod.withActor(db.ids.operator, async (q) =>
        (await q.query("select * from hc.register_weighing($1,$2,$3,$4,$5,$6,$7,$8)", [db.ids.operator, "DEMO-Z01-EST01-CARTON", 4250, 350, null, null, false, key])).rows[0] as {
          o_net_g: number;
          o_duplicate: boolean;
        },
      );
    const a = await run();
    const b = await run();
    expect(a.o_net_g).toBe(3900);
    expect(a.o_duplicate).toBe(false);
    expect(b.o_duplicate).toBe(true);
  });

  it("hc_app no puede escribir directamente en tablas de negocio", async () => {
    await expect(
      dbmod.withActor(db.ids.admin, (q) => q.query("update hc.zones set name = 'x'")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("el flujo de autenticación local funciona bajo SET LOCAL ROLE", async () => {
    const { rows } = await dbmod.anon.query("select * from hc.auth_get_credentials($1)", [DEMO_USERS.admin.email]);
    expect(rows.length).toBe(1);
  });
});
