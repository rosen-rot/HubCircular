import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestDb, type TestDb } from "../helpers/db";
import { hashDeviceToken } from "../../src/modules/devices/token";
import type { Actor } from "../../src/modules/identity/types";

/**
 * Revisión de diseño con datos simulados: capacidad de contenedores (migración 0012) y estado del sensor/llenado por
 * contenedor (`listContainerSensors`). Todo contra PostgreSQL local; nada toca Supabase.
 */
let db: TestDb;
let cartonId: string; // DEMO, Cowork
let aluminioId: string; // DEMO, Laboratorio
let realId: string; // REAL, Cowork
let admin: Actor, operator: Actor, labAdmin: Actor;
let labAdminId: string;
let svc: typeof import("../../src/modules/catalog/service");
let dev: typeof import("../../src/modules/devices/service");
let q: typeof import("../../src/modules/devices/queries");

const actor = (id: string, role: Actor["roles"][number]["role"], zone: string | null): Actor => ({ userId: id, email: "x@x.test", displayName: role, roles: [{ role, zoneId: zone }] });

async function ingest(token: string, deviceCode: string, over: { fill?: number | null; quality?: string; distance?: number | null; weight?: number | null } = {}) {
  const c = await db.appClient();
  try {
    await c.query("begin");
    await c.query("select * from hc.iot_ingest_reading($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
      hashDeviceToken(token), deviceCode, crypto.randomUUID(), 1, new Date().toISOString(),
      over.weight === undefined ? 4250 : over.weight, over.distance === undefined ? 180 : over.distance,
      over.fill === undefined ? 65 : over.fill, over.quality ?? "stable", "sim-0.1.0",
    ]);
    await c.query("commit");
  } finally {
    await c.end();
  }
}

const businessCounts = async () =>
  (await db.admin.query(
    "select (select count(*) from hc.weighings)::int w, (select count(*) from hc.batches)::int b, (select count(*) from hc.movements)::int m",
  )).rows[0] as { w: number; b: number; m: number };

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  [svc, dev, q] = await Promise.all([
    import("../../src/modules/catalog/service"),
    import("../../src/modules/devices/service"),
    import("../../src/modules/devices/queries"),
  ]);
  admin = actor(db.ids.admin, "administrador", null);
  operator = actor(db.ids.operator, "operador", db.ids.zoneCowork);
  cartonId = (await db.admin.query("select id from hc.containers where code = 'DEMO-Z01-EST01-CARTON'")).rows[0].id;
  aluminioId = (await db.admin.query("select id from hc.containers where code = 'DEMO-Z02-EST01-ALUMINIO'")).rows[0].id;
  realId = (
    await db.admin.query(
      "insert into hc.containers (station_id, material_id, code, data_origin) select station_id, material_id, 'REAL-CAP-TEST', 'real' from hc.containers where id = $1 returning id",
      [cartonId],
    )
  ).rows[0].id;
  labAdminId = (await db.admin.query("insert into hc.profiles (email, display_name) values ('lab-admin@demo.test', 'Admin Lab') returning id")).rows[0].id;
  await db.admin.query("insert into hc.user_roles (user_id, role, zone_id) values ($1, 'administrador', $2)", [labAdminId, db.ids.zoneLab]);
  labAdmin = actor(labAdminId, "administrador", db.ids.zoneLab);
});

afterAll(async () => {
  const g = globalThis as unknown as { __hcPool?: Pool };
  await g.__hcPool?.end().catch(() => undefined);
  delete g.__hcPool;
  await db.drop();
});

describe("capacidad de contenedores (0012)", () => {
  it("la columna es opcional y nace vacía; la BD rechaza valores fuera de rango", async () => {
    const r = await db.admin.query("select count(*)::int n from hc.containers where capacity_l is not null");
    expect(r.rows[0].n).toBe(0);
    await expect(db.admin.query("update hc.containers set capacity_l = 0 where id = $1", [cartonId])).rejects.toMatchObject({ code: "23514" });
    await expect(db.admin.query("update hc.containers set capacity_l = 10001 where id = $1", [cartonId])).rejects.toMatchObject({ code: "23514" });
  });

  it("el administrador la fija y la quita; queda auditado con valor anterior y nuevo; repetir no audita de nuevo", async () => {
    await svc.setContainerCapacity(admin, cartonId, 120);
    await svc.setContainerCapacity(admin, cartonId, 120);
    expect((await db.admin.query("select capacity_l from hc.containers where id = $1", [cartonId])).rows[0].capacity_l).toBe(120);
    await svc.setContainerCapacity(admin, cartonId, null);
    expect((await db.admin.query("select capacity_l from hc.containers where id = $1", [cartonId])).rows[0].capacity_l).toBeNull();
    const a = await db.admin.query(
      "select actor_id, old_summary, new_summary from hc.audit_logs where entity = 'container' and entity_id = $1 and action = 'set_capacity' order by id",
      [cartonId],
    );
    expect(a.rows.map((x) => [x.old_summary.capacityL, x.new_summary.capacityL])).toEqual([[null, 120], [120, null]]);
    expect(a.rows.every((x) => x.actor_id === db.ids.admin)).toBe(true);
  });

  it("valores inválidos → capacity_invalid; contenedor inexistente → container_not_found", async () => {
    await expect(svc.setContainerCapacity(admin, cartonId, 0)).rejects.toMatchObject({ code: "capacity_invalid" });
    await expect(svc.setContainerCapacity(admin, cartonId, 20000)).rejects.toMatchObject({ code: "capacity_invalid" });
    await expect(svc.setContainerCapacity(admin, crypto.randomUUID(), 100)).rejects.toMatchObject({ code: "container_not_found" });
  });

  it("operador no puede (permiso de la app y BD); administrador de otra zona tampoco; hc_app no escribe la tabla directamente", async () => {
    await expect(svc.setContainerCapacity(operator, cartonId, 100)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      db.asActor(db.ids.operator, (c) => c.query("select hc.admin_set_container_capacity($1,$2,100)", [db.ids.operator, cartonId])),
    ).rejects.toMatchObject({ message: "forbidden" });
    // El administrador de Laboratorio no ve ni puede cambiar un contenedor de Cowork.
    await expect(svc.setContainerCapacity(labAdmin, cartonId, 100)).rejects.toMatchObject({ code: "forbidden" });
    await svc.setContainerCapacity(labAdmin, aluminioId, 60);
    await expect(
      db.asActor(db.ids.admin, (c) => c.query("update hc.containers set capacity_l = 5 where id = $1", [cartonId])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("EXECUTE revocado a PUBLIC, anon y authenticated", async () => {
    const r = await db.admin.query(
      `select r.rolname, has_function_privilege(r.oid, 'hc.admin_set_container_capacity(uuid, uuid, integer)', 'execute') as ok
         from pg_roles r where r.rolname in ('anon', 'authenticated', 'hc_app')`,
    );
    const m = Object.fromEntries(r.rows.map((x) => [x.rolname, x.ok]));
    expect(m.hc_app).toBe(true);
    if ("anon" in m) expect(m.anon).toBe(false);
    if ("authenticated" in m) expect(m.authenticated).toBe(false);
    const pub = await db.admin.query(
      "select exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.proname = 'admin_set_container_capacity' and a.grantee = 0) as pub",
    );
    expect(pub.rows[0].pub).toBe(false);
  });
});

describe("estado del sensor y llenado por contenedor", () => {
  let token: string;

  it("sin sensor: «sin_sensor» (o «sin_capacidad» si falta la capacidad)", async () => {
    const list = await q.listContainerSensors(admin);
    expect(list.capacitySupported).toBe(true);
    const carton = list.items.find((i) => i.containerId === cartonId)!;
    expect(carton.sensor).toBeNull();
    expect(carton.fill).toEqual({ kind: "sin_capacidad" });
  });

  it("con lectura pero SIN capacidad no muestra llenado; con capacidad sí (y nunca crea captación)", async () => {
    const before = await businessCounts();
    ({ token } = await dev.createDevice(admin, { code: "HUB-CAP-001", name: "Sensor cartón", containerId: cartonId, staleAfterMinutes: 15 }));
    let carton = (await q.listContainerSensors(admin)).items.find((i) => i.containerId === cartonId)!;
    expect(carton.sensor?.state).toBe("sin_datos");
    await ingest(token, "HUB-CAP-001", { fill: 65 });
    carton = (await q.listContainerSensors(admin)).items.find((i) => i.containerId === cartonId)!;
    expect(carton.sensor?.state).toBe("en_linea");
    expect(carton.fill).toEqual({ kind: "sin_capacidad" });
    await svc.setContainerCapacity(admin, cartonId, 120);
    carton = (await q.listContainerSensors(admin)).items.find((i) => i.containerId === cartonId)!;
    expect(carton.fill).toEqual({ kind: "ok", percent: 65, approxLiters: 78, capacityL: 120, stale: false });
    expect(await businessCounts()).toEqual(before);
  });

  it("pasada la tolerancia: desactualizado, con el último dato marcado como tal", async () => {
    const later = new Date(Date.now() + 2 * 60 * 60_000);
    const carton = (await q.listContainerSensors(admin, { now: later })).items.find((i) => i.containerId === cartonId)!;
    expect(carton.sensor?.state).toBe("desactualizado");
    expect(carton.fill).toMatchObject({ kind: "ok", stale: true });
  });

  it("error de sensor: sin dato de llenado (nunca 0 %)", async () => {
    await ingest(token, "HUB-CAP-001", { fill: null, distance: null, weight: null, quality: "sensor_error" });
    const carton = (await q.listContainerSensors(admin)).items.find((i) => i.containerId === cartonId)!;
    expect(carton.fill).toEqual({ kind: "sin_dato", reason: "error_sensor" });
  });

  it("DEMO y real nunca se mezclan: el filtro por origen separa los contenedores", async () => {
    const real = await q.listContainerSensors(admin, { origin: "real" });
    const demo = await q.listContainerSensors(admin, { origin: "demo" });
    expect(real.items.map((i) => i.containerId)).toEqual([realId]);
    expect(real.items.every((i) => i.dataOrigin === "real" && i.sensor === null)).toBe(true);
    expect(demo.items.length).toBeGreaterThan(0);
    expect(demo.items.every((i) => i.dataOrigin === "demo")).toBe(true);
  });

  it("ámbito: el operador de Cowork no ve el contenedor de Laboratorio", async () => {
    const list = await q.listContainerSensors(operator);
    expect(list.items.some((i) => i.containerId === aluminioId)).toBe(false);
    expect(list.items.some((i) => i.containerId === cartonId)).toBe(true);
  });

  it("revocado: el estado lo dice y el llenado queda sin dato; un dispositivo vigente nuevo tiene prioridad", async () => {
    const devId = (await db.admin.query("select id from hc.devices where device_code = 'HUB-CAP-001'")).rows[0].id;
    await dev.revokeDevice(admin, devId);
    let carton = (await q.listContainerSensors(admin)).items.find((i) => i.containerId === cartonId)!;
    expect(carton.sensor?.state).toBe("revocado");
    expect(carton.fill).toEqual({ kind: "sin_dato", reason: "revocado" });
    const second = await dev.createDevice(admin, { code: "HUB-CAP-002", name: "Sensor cartón 2", containerId: cartonId, staleAfterMinutes: 15 });
    await ingest(second.token, "HUB-CAP-002", { fill: 30 });
    carton = (await q.listContainerSensors(admin)).items.find((i) => i.containerId === cartonId)!;
    expect(carton.sensor?.deviceCode).toBe("HUB-CAP-002");
    expect(carton.fill).toMatchObject({ kind: "ok", percent: 30, approxLiters: 36 });
  });

  it("base sin la migración 0012 (como Supabase hoy): la vista funciona, muestra el estado y nunca el llenado", async () => {
    await db.admin.query("alter table hc.containers drop column capacity_l");
    const list = await q.listContainerSensors(admin);
    expect(list.capacitySupported).toBe(false);
    const carton = list.items.find((i) => i.containerId === cartonId)!;
    expect(carton.sensor?.state).toBe("en_linea");
    expect(carton.capacityL).toBeNull();
    expect(carton.fill).toEqual({ kind: "sin_capacidad" });
  });
});
