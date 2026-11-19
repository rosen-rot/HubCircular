import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/lib/migrator";
import { createTestDb, type TestDb } from "../helpers/db";

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.drop(); });

describe("migraciones", () => {
  it("son idempotentes: una segunda ejecución no aplica nada", async () => {
    const r = await runMigrations(db.admin);
    expect(r.applied).toEqual([]);
    expect(r.skipped.length).toBeGreaterThanOrEqual(5);
  });

  it("detectan una migración ya aplicada que fue modificada (checksum)", async () => {
    await db.admin.query("update hc.schema_migrations set checksum = 'x' where name = '0001_identity_audit.sql'");
    await expect(runMigrations(db.admin)).rejects.toThrow(/fue modificada/);
    // se restaura para no afectar otras pruebas
    const real = (await import("../../src/lib/migrator")).loadMigrations().find((m) => m.name === "0001_identity_audit.sql")!;
    await db.admin.query("update hc.schema_migrations set checksum = $1 where name = '0001_identity_audit.sql'", [real.checksum]);
  });
});

describe("privilegios del rol de aplicación (hc_app)", () => {
  it("NO puede escribir directamente en tablas de negocio (solo vía funciones)", async () => {
    const attempts = [
      "insert into hc.weighings (container_id, material_id, zone_id, gross_g, tare_g, occurred_at, created_by, idempotency_key, data_origin) select c.id, c.material_id, s.zone_id, 10, 1, now(), (select id from hc.profiles limit 1), gen_random_uuid(), 'demo' from hc.containers c join hc.stations s on s.id=c.station_id limit 1",
      "insert into hc.batches (weighing_id, origin_zone_id, material_id, initial_g, data_origin) select id, zone_id, material_id, net_g, data_origin from hc.weighings limit 1",
      "update hc.batch_location_balances set balance_g = 999999",
      "delete from hc.audit_logs",
      "insert into hc.materials (code, name) values ('HACK', 'hack')",
      "update hc.profiles set active = false",
    ];
    for (const sql of attempts) {
      await expect(db.asActor(db.ids.admin, (c) => c.query(sql)), sql).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege
    }
  });

  it("NO tiene acceso a credenciales ni sesiones, ni puede leer el correo de los perfiles", async () => {
    for (const sql of ["select * from hc.local_credentials", "select * from hc.local_sessions", "select email from hc.profiles", "select password_hash from hc.local_credentials"]) {
      await expect(db.asActor(db.ids.admin, (c) => c.query(sql)), sql).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("anon y authenticated (API de datos de Supabase) no ven nada: sin USAGE sobre el esquema", async () => {
    for (const role of ["anon", "authenticated"]) {
      const c = new Client({ connectionString: db.url, options: `-c role=${role}` });
      await c.connect();
      try {
        await expect(c.query("select * from hc.weighings")).rejects.toMatchObject({ code: "42501" });
        await expect(c.query("select * from hc.register_weighing(null,null,null,null,null,null,null,null)")).rejects.toMatchObject({ code: "42501" });
      } finally { await c.end(); }
    }
  });

  it("todas las tablas de hc tienen RLS habilitada", async () => {
    const { rows } = await db.admin.query(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='hc' and c.relkind='r' and not c.relrowsecurity and c.relname <> 'schema_migrations'",
    );
    expect(rows).toEqual([]);
  });
});

describe("inmutabilidad y auditoría append-only", () => {
  it("audit_logs no admite UPDATE, DELETE ni TRUNCATE (ni siquiera el dueño)", async () => {
    await db.admin.query("insert into hc.audit_logs (entity, action) values ('test','x')");
    await expect(db.admin.query("update hc.audit_logs set action = 'y'")).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("delete from hc.audit_logs")).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("truncate hc.audit_logs")).rejects.toMatchObject({ code: "HC423" });
  });
});

describe("restricciones de datos", () => {
  it("la tabla de pesajes impone masas válidas aunque se inserte directamente (dueño)", async () => {
    const base = await db.admin.query(
      "select c.id as cid, c.material_id as mid, s.zone_id as zid from hc.containers c join hc.stations s on s.id = c.station_id limit 1",
    );
    const { cid, mid, zid } = base.rows[0];
    const ins = (g: number, t: number) =>
      db.admin.query(
        "insert into hc.weighings (container_id, material_id, zone_id, gross_g, tare_g, occurred_at, created_by, idempotency_key, data_origin) values ($1,$2,$3,$4,$5, now(), $6, gen_random_uuid(), 'demo')",
        [cid, mid, zid, g, t, db.ids.admin],
      );
    await expect(ins(100, 100)).rejects.toMatchObject({ code: "23514" });
    await expect(ins(100, 200)).rejects.toMatchObject({ code: "23514" });
    await expect(ins(100, -1)).rejects.toMatchObject({ code: "23514" });
    await expect(ins(0, 0)).rejects.toMatchObject({ code: "23514" });
    await expect(ins(1_000_001, 0)).rejects.toMatchObject({ code: "23514" });
  });

  it("el saldo por lote y ubicación no puede ser negativo", async () => {
    await expect(
      db.admin.query("insert into hc.batch_location_balances (batch_id, zone_id, balance_g) values (gen_random_uuid(), $1, -1)", [db.ids.zoneCowork]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("los datos semilla están etiquetados como demo", async () => {
    const { rows } = await db.admin.query(
      "select (select count(*) from hc.containers where data_origin <> 'demo')::int a, (select count(*) from hc.materials where data_origin <> 'demo')::int b, (select count(*) from hc.zones where data_origin <> 'demo')::int c",
    );
    expect(rows[0]).toEqual({ a: 0, b: 0, c: 0 });
  });
});
