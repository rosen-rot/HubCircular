import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_USERS, seedDemo } from "../../db/seed/demo";
import { createTestDb, PASSWORDS, registerAs, type TestDb } from "../helpers/db";

const GLOBAL = "DEMO-Z01-GLOBAL-MIXTO";
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});

describe("contenedor global mixto (DEMO)", () => {
  it("el seed crea el material y el contenedor sin tara nominal, marcados como demo", async () => {
    const r = await db.admin.query(
      `select m.code as material, m.data_origin as m_origin, c.data_origin as c_origin, c.tare_g
         from hc.containers c join hc.materials m on m.id = c.material_id where c.code = $1`,
      [GLOBAL],
    );
    expect(r.rows[0]).toEqual({ material: "DEMO-MIXTO", m_origin: "demo", c_origin: "demo", tare_g: null });
  });

  it("el operador de la zona puede pesarlo: neto calculado por la BD, material mixto, origen demo", async () => {
    const w = await registerAs(db, db.ids.operator, { code: GLOBAL, gross: 12_400, tare: 3_100 });
    expect(w.o_net_g).toBe(9_300);
    const r = await db.admin.query(
      `select m.code as material, w.data_origin from hc.weighings w join hc.materials m on m.id = w.material_id where w.id = $1`,
      [w.o_weighing_id],
    );
    expect(r.rows[0]).toEqual({ material: "DEMO-MIXTO", data_origin: "demo" });
  });

  it("el operador de otra zona no puede pesarlo", async () => {
    await expect(registerAs(db, db.ids.operator, { code: "DEMO-Z02-EST01-ALUMINIO" })).rejects.toThrow();
  });

  it("el seed sigue siendo idempotente con el contenedor nuevo", async () => {
    await seedDemo(db.admin, { passwords: PASSWORDS, fastHash: true });
    const r = await db.admin.query("select count(*)::int as n from hc.containers where code = $1", [GLOBAL]);
    expect(r.rows[0].n).toBe(1);
    expect(DEMO_USERS.operator.scope).toBe("Z01");
  });
});
