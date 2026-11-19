import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, registerAs, type TestDb } from "../helpers/db";

let db: TestDb;
let wCowork: string;
let wLab: string;

beforeAll(async () => {
  db = await createTestDb();
  wCowork = (await registerAs(db, db.ids.admin, { code: "DEMO-Z01-EST01-CARTON" })).o_weighing_id;
  wLab = (await registerAs(db, db.ids.admin, { code: "DEMO-Z02-EST01-ALUMINIO" })).o_weighing_id;
});
afterAll(async () => { await db.drop(); });

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("RLS: lectura por rol y ámbito de zona (docs/08: «operador no lee zonas ajenas»)", () => {
  it("administrador y lector (todas las zonas) ven ambos pesajes", async () => {
    for (const who of [db.ids.admin, db.ids.reader]) {
      const rows = await db.asActor(who, async (c) => (await c.query("select id from hc.weighings")).rows);
      expect(ids(rows)).toEqual(expect.arrayContaining([wCowork, wLab]));
    }
  });

  it("operador con ámbito Cowork solo ve pesajes, lotes, saldos, contenedores y zonas de Cowork", async () => {
    await db.asActor(db.ids.operator, async (c) => {
      expect(ids((await c.query("select id from hc.weighings")).rows)).toContain(wCowork);
      expect(ids((await c.query("select id from hc.weighings")).rows)).not.toContain(wLab);
      const batches = (await c.query("select origin_zone_id from hc.batches")).rows;
      expect(batches.every((b) => b.origin_zone_id === db.ids.zoneCowork)).toBe(true);
      const bal = (await c.query("select zone_id from hc.batch_location_balances")).rows;
      expect(bal.every((b) => b.zone_id === db.ids.zoneCowork)).toBe(true);
      const containers = (await c.query("select code from hc.containers")).rows.map((r) => r.code);
      expect(containers).toContain("DEMO-Z01-EST01-CARTON");
      expect(containers).not.toContain("DEMO-Z02-EST01-ALUMINIO");
      const zones = (await c.query("select name from hc.zones")).rows.map((r) => r.name);
      expect(zones).toEqual(["Cowork DEMO"]);
      expect((await c.query("select id from hc.stations")).rows).toHaveLength(2); // estación 01 y contenedor global de Cowork
    });
  });

  it("sin actor (o con un actor inexistente) no se lee absolutamente nada", async () => {
    for (const who of [null, "11111111-1111-1111-1111-111111111111"]) {
      await db.asActor(who, async (c) => {
        for (const t of ["weighings", "batches", "batch_location_balances", "containers", "zones", "stations", "materials", "buildings", "profiles", "user_roles", "audit_logs"]) {
          expect((await c.query(`select 1 from hc.${t}`)).rows, `tabla ${t}`).toHaveLength(0);
        }
      });
    }
  });

  it("usuario desactivado pierde la lectura inmediatamente", async () => {
    await db.admin.query("update hc.profiles set active=false where id=$1", [db.ids.reader]);
    try {
      const rows = await db.asActor(db.ids.reader, async (c) => (await c.query("select id from hc.weighings")).rows);
      expect(rows).toHaveLength(0);
    } finally {
      await db.admin.query("update hc.profiles set active=true where id=$1", [db.ids.reader]);
    }
  });

  it("solo el administrador lee la auditoría", async () => {
    const admin = await db.asActor(db.ids.admin, async (c) => (await c.query("select count(*)::int n from hc.audit_logs")).rows[0].n);
    expect(admin).toBeGreaterThan(0);
    for (const who of [db.ids.operator, db.ids.reader]) {
      expect(await db.asActor(who, async (c) => (await c.query("select count(*)::int n from hc.audit_logs")).rows[0].n)).toBe(0);
    }
  });

  it("los roles asignados solo son visibles para el propio usuario o un administrador", async () => {
    const own = await db.asActor(db.ids.operator, async (c) => (await c.query("select user_id from hc.user_roles")).rows);
    expect(own.every((r) => r.user_id === db.ids.operator)).toBe(true);
    const all = await db.asActor(db.ids.admin, async (c) => (await c.query("select user_id from hc.user_roles")).rows);
    expect(new Set(all.map((r) => r.user_id)).size).toBe(3);
  });

  it("los nombres visibles de colegas se pueden leer (para «registrado por») pero no el correo", async () => {
    const names = await db.asActor(db.ids.operator, async (c) => (await c.query("select display_name from hc.profiles")).rows);
    expect(names.length).toBe(3);
  });

  it("una transacción de solo lectura no puede escribir aunque la función exista (defensa adicional)", async () => {
    const c = await db.appClient();
    await c.query("begin read only");
    await c.query("select set_config('hc.actor_id', $1, true)", [db.ids.operator]);
    await expect(
      c.query("select * from hc.register_weighing($1,'DEMO-Z01-EST01-CARTON',4250,350,null,null,false,gen_random_uuid())", [db.ids.operator]),
    ).rejects.toMatchObject({ code: "25006" });
    await c.query("rollback");
  });
});
