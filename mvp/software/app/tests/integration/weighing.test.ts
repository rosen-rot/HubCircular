import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { counts, createTestDb, registerAs, type TestDb } from "../helpers/db";

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(async () => { await db.drop(); });

const CARTON = "DEMO-Z01-EST01-CARTON";
const LAB = "DEMO-Z02-EST01-ALUMINIO";

describe("registro de pesaje: caso de aceptación 1 (bruto 4.250 g, tara 350 g)", () => {
  it("calcula neto 3.900 g en la BD y crea exactamente un pesaje, un lote de 3.900 g y su saldo inicial", async () => {
    const before = await counts(db);
    const r = await registerAs(db, db.ids.operator, { gross: 4250, tare: 350, notes: "  caja limpia  ", contamination: true });
    expect(r.o_net_g).toBe(3900);
    expect(r.o_duplicate).toBe(false);
    const after = await counts(db);
    expect(after).toEqual({ weighings: before.weighings + 1, batches: before.batches + 1, balances: before.balances + 1 });

    const w = (await db.admin.query("select * from hc.weighings where id = $1", [r.o_weighing_id])).rows[0];
    expect(w).toMatchObject({ gross_g: 4250, tare_g: 350, net_g: 3900, source: "manual", notes: "caja limpia", contamination_observed: true, data_origin: "demo", created_by: db.ids.operator });
    const b = (await db.admin.query("select * from hc.batches where id = $1", [r.o_batch_id])).rows[0];
    expect(b).toMatchObject({ weighing_id: r.o_weighing_id, initial_g: 3900, origin_zone_id: db.ids.zoneCowork, data_origin: "demo" });
    const bal = (await db.admin.query("select * from hc.batch_location_balances where batch_id = $1", [r.o_batch_id])).rows;
    expect(bal).toHaveLength(1);
    expect(bal[0]).toMatchObject({ zone_id: db.ids.zoneCowork, balance_g: 3900 });
  });

  it("deriva material y zona del contenedor (el cliente no los elige) y hereda data_origin", async () => {
    const r = await registerAs(db, db.ids.admin, { code: LAB, gross: 2000, tare: 500 });
    const w = (await db.admin.query("select material_id, zone_id, data_origin from hc.weighings where id = $1", [r.o_weighing_id])).rows[0];
    const expected = (await db.admin.query("select c.material_id, s.zone_id, c.data_origin from hc.containers c join hc.stations s on s.id=c.station_id where c.code=$1", [LAB])).rows[0];
    expect(w).toEqual(expected);
  });

  it("acepta el código en minúsculas/espacios (QR) pero eso no otorga permisos", async () => {
    const r = await registerAs(db, db.ids.operator, { code: "  demo-z01-est01-carton " });
    expect(r.o_net_g).toBe(3900);
  });

  it("guarda la fecha indicada (UTC) y rechaza una fecha futura", async () => {
    const past = new Date("2026-07-01T14:00:00Z");
    const r = await registerAs(db, db.ids.operator, { occurredAt: past });
    const w = (await db.admin.query("select occurred_at from hc.weighings where id=$1", [r.o_weighing_id])).rows[0];
    expect(new Date(w.occurred_at).toISOString()).toBe(past.toISOString());
    await expect(registerAs(db, db.ids.operator, { occurredAt: new Date(Date.now() + 3_600_000) })).rejects.toMatchObject({ code: "HC422", message: "occurred_in_future" });
  });

  it("escribe un registro de auditoría sin datos sensibles", async () => {
    const r = await registerAs(db, db.ids.operator, { gross: 1000, tare: 100 });
    const a = (await db.admin.query("select * from hc.audit_logs where entity='weighing' and entity_id=$1", [r.o_weighing_id])).rows;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ actor_id: db.ids.operator, action: "create" });
    expect(a[0].new_summary).toMatchObject({ netG: 900, containerCode: CARTON, dataOrigin: "demo" });
    expect(JSON.stringify(a[0].new_summary)).not.toMatch(/password|token|email/i);
  });
});

describe("caso de aceptación 2: entradas inválidas no dejan ningún efecto", () => {
  const cases: [string, Parameters<typeof registerAs>[2], string][] = [
    ["tara mayor que bruto", { gross: 300, tare: 350 }, "tare_not_less_than_gross"],
    ["tara igual al bruto (neto 0)", { gross: 350, tare: 350 }, "tare_not_less_than_gross"],
    ["bruto cero", { gross: 0, tare: 0 }, "invalid_mass"],
    ["bruto negativo", { gross: -5, tare: 0 }, "invalid_mass"],
    ["tara negativa", { gross: 100, tare: -1 }, "invalid_mass"],
    ["bruto nulo", { gross: null, tare: 0 }, "invalid_mass"],
    ["tara nula", { gross: 100, tare: null }, "invalid_mass"],
    ["más de 1.000 kg", { gross: 1_000_001, tare: 0 }, "mass_too_large"],
    ["observaciones demasiado largas", { notes: "x".repeat(501) }, "notes_too_long"],
    ["contenedor inexistente", { code: "NO-EXISTE" }, "container_not_found"],
    ["contenedor vacío", { code: "   " }, "container_required"],
  ];
  it.each(cases)("%s → error y 0 filas nuevas", async (_name, params, message) => {
    const before = await counts(db);
    await expect(registerAs(db, db.ids.operator, params)).rejects.toMatchObject({ code: expect.stringMatching(/^HC4/), message });
    expect(await counts(db)).toEqual(before);
  });

  it("material desactivado → error sin efecto; al reactivarlo vuelve a funcionar", async () => {
    await db.admin.query("update hc.materials set active = false where code = 'CARTON'");
    const before = await counts(db);
    await expect(registerAs(db, db.ids.operator, {})).rejects.toMatchObject({ message: "material_inactive" });
    expect(await counts(db)).toEqual(before);
    await db.admin.query("update hc.materials set active = true where code = 'CARTON'");
    expect((await registerAs(db, db.ids.operator, {})).o_net_g).toBe(3900);
  });

  it("contenedor / estación / zona inactivos → error sin efecto", async () => {
    for (const sql of [
      ["update hc.containers set active=false where code=$1", "update hc.containers set active=true where code=$1"],
      ["update hc.stations set active=false where code='DEMO-Z01-EST01'", "update hc.stations set active=true where code='DEMO-Z01-EST01'"],
      ["update hc.zones set active=false where name='Cowork DEMO'", "update hc.zones set active=true where name='Cowork DEMO'"],
    ]) {
      const args = sql[0]!.includes("$1") ? [CARTON] : [];
      await db.admin.query(sql[0]!, args);
      const before = await counts(db);
      await expect(registerAs(db, db.ids.admin, {})).rejects.toMatchObject({ message: "container_inactive" });
      expect(await counts(db)).toEqual(before);
      await db.admin.query(sql[1]!, args);
    }
  });
});

describe("atomicidad: pesaje y lote nacen juntos o no nacen", () => {
  it("si falla la creación del saldo inicial, se revierte también el pesaje y el lote", async () => {
    await db.admin.query(`
      create function hc.test_fail() returns trigger language plpgsql as $$ begin raise exception 'fallo simulado'; end $$;
      create trigger test_fail before insert on hc.batch_location_balances for each row execute function hc.test_fail();`);
    try {
      const before = await counts(db);
      const auditBefore = Number((await db.admin.query("select count(*)::int n from hc.audit_logs")).rows[0].n);
      await expect(registerAs(db, db.ids.operator, {})).rejects.toThrow(/fallo simulado/);
      expect(await counts(db)).toEqual(before); // 0 pesajes, 0 lotes, 0 saldos nuevos
      const auditAfter = Number((await db.admin.query("select count(*)::int n from hc.audit_logs")).rows[0].n);
      expect(auditAfter).toBe(auditBefore); // tampoco queda auditoría de un evento que no ocurrió
    } finally {
      await db.admin.query("drop trigger test_fail on hc.batch_location_balances; drop function hc.test_fail();");
    }
  });

  it("el lote no puede divergir del pesaje (inserción directa con neto distinto → rechazado)", async () => {
    const w = (await registerAs(db, db.ids.operator, {})).o_weighing_id;
    const row = (await db.admin.query("select zone_id, material_id, data_origin from hc.weighings where id=$1", [w])).rows[0];
    await expect(
      db.admin.query("insert into hc.batches (weighing_id, origin_zone_id, material_id, initial_g, data_origin) values ($1,$2,$3,1,$4)", [w, row.zone_id, row.material_id, row.data_origin]),
    ).rejects.toMatchObject({ code: expect.stringMatching(/HC422|23505/) });
  });
});

describe("idempotencia (doble clic / reintentos de red)", () => {
  it("misma clave + mismos datos → una sola fila; el reintento devuelve el resultado original", async () => {
    const key = crypto.randomUUID();
    const before = await counts(db);
    const a = await registerAs(db, db.ids.operator, { key, gross: 5000, tare: 1000 });
    const b = await registerAs(db, db.ids.operator, { key, gross: 5000, tare: 1000 });
    expect(a.o_duplicate).toBe(false);
    expect(b.o_duplicate).toBe(true);
    expect(b.o_weighing_id).toBe(a.o_weighing_id);
    expect(b.o_batch_id).toBe(a.o_batch_id);
    const after = await counts(db);
    expect(after.weighings - before.weighings).toBe(1);
    expect(after.batches - before.batches).toBe(1);
  });

  it("misma clave + datos distintos → conflicto 409 y sin filas nuevas", async () => {
    const key = crypto.randomUUID();
    await registerAs(db, db.ids.operator, { key, gross: 5000, tare: 1000 });
    const before = await counts(db);
    await expect(registerAs(db, db.ids.operator, { key, gross: 5001, tare: 1000 })).rejects.toMatchObject({ code: "HC409", message: "idempotency_conflict" });
    expect(await counts(db)).toEqual(before);
  });

  it("10 envíos SIMULTÁNEOS con la misma clave (doble clic) → exactamente 1 pesaje y 1 lote", async () => {
    const key = crypto.randomUUID();
    const before = await counts(db);
    const results = await Promise.all(Array.from({ length: 10 }, () => registerAs(db, db.ids.operator, { key, gross: 7000, tare: 200 })));
    expect(new Set(results.map((r) => r.o_weighing_id)).size).toBe(1);
    expect(new Set(results.map((r) => r.o_batch_id)).size).toBe(1);
    expect(results.filter((r) => !r.o_duplicate)).toHaveLength(1);
    const after = await counts(db);
    expect(after).toEqual({ weighings: before.weighings + 1, batches: before.batches + 1, balances: before.balances + 1 });
  });

  it("el reintento sigue funcionando aunque el contenedor se desactive después (devuelve el original)", async () => {
    const key = crypto.randomUUID();
    const a = await registerAs(db, db.ids.operator, { key });
    await db.admin.query("update hc.containers set active=false where code=$1", [CARTON]);
    try {
      const b = await registerAs(db, db.ids.operator, { key });
      expect(b).toMatchObject({ o_duplicate: true, o_weighing_id: a.o_weighing_id });
    } finally {
      await db.admin.query("update hc.containers set active=true where code=$1", [CARTON]);
    }
  });

  it("claves iguales de usuarios distintos no colisionan (ámbito por usuario)", async () => {
    const key = crypto.randomUUID();
    const a = await registerAs(db, db.ids.operator, { key });
    const b = await registerAs(db, db.ids.admin, { key });
    expect(a.o_weighing_id).not.toBe(b.o_weighing_id);
  });
});

describe("autorización en la base de datos (defensa en profundidad)", () => {
  it("lector no puede registrar", async () => {
    const before = await counts(db);
    await expect(registerAs(db, db.ids.reader, {})).rejects.toMatchObject({ code: "HC403", message: "forbidden" });
    expect(await counts(db)).toEqual(before);
  });

  it("operador con ámbito en Cowork no puede registrar en un contenedor del Laboratorio", async () => {
    const before = await counts(db);
    await expect(registerAs(db, db.ids.operator, { code: LAB })).rejects.toMatchObject({ code: "HC403", message: "forbidden" });
    expect(await counts(db)).toEqual(before);
  });

  it("el administrador (todas las zonas) sí puede", async () => {
    expect((await registerAs(db, db.ids.admin, { code: LAB })).o_net_g).toBe(3900);
  });

  it("usuario inactivo → no autenticado, sin efecto", async () => {
    await db.admin.query("update hc.profiles set active=false where id=$1", [db.ids.operator]);
    const before = await counts(db);
    try {
      await expect(registerAs(db, db.ids.operator, {})).rejects.toMatchObject({ code: "HC401" });
      expect(await counts(db)).toEqual(before);
    } finally {
      await db.admin.query("update hc.profiles set active=true where id=$1", [db.ids.operator]);
    }
  });

  it("el actor del argumento debe coincidir con el actor de la transacción (no se puede suplantar)", async () => {
    await expect(
      db.asActor(db.ids.operator, (c) => c.query("select * from hc.register_weighing($1,$2,100,10,null,null,false,gen_random_uuid())", [db.ids.admin, LAB])),
    ).rejects.toMatchObject({ code: "HC401" });
    await expect(
      db.asActor(null, (c) => c.query("select * from hc.register_weighing($1,$2,100,10,null,null,false,gen_random_uuid())", [db.ids.admin, LAB])),
    ).rejects.toMatchObject({ code: "HC401" });
  });

  it("un rol de zona se extiende a las zonas hijas, no a las vecinas", async () => {
    const child = (await db.admin.query(
      "insert into hc.zones (building_id, parent_id, name, data_origin) select building_id, id, 'Sala DEMO hija', 'demo' from hc.zones where name='Cowork DEMO' returning id")).rows[0].id;
    const st = (await db.admin.query("insert into hc.stations (zone_id, code, name, data_origin) values ($1,'DEMO-Z01A-EST01','Hija','demo') returning id", [child])).rows[0].id;
    await db.admin.query("insert into hc.containers (station_id, material_id, code, data_origin) values ($1,$2,'DEMO-Z01A-PET',  'demo')", [st, db.ids.materialCarton]);
    const r = await registerAs(db, db.ids.operator, { code: "DEMO-Z01A-PET" });
    expect(r.o_net_g).toBe(3900);
    const w = (await db.admin.query("select zone_id from hc.weighings where id=$1", [r.o_weighing_id])).rows[0];
    expect(w.zone_id).toBe(child);
  });
});

describe("inmutabilidad de pesajes y lotes", () => {
  it("no se pueden modificar ni eliminar (ni siquiera el dueño): las correcciones serán eventos nuevos", async () => {
    const r = await registerAs(db, db.ids.operator, {});
    await expect(db.admin.query("update hc.weighings set gross_g = 1 where id=$1", [r.o_weighing_id])).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("delete from hc.weighings where id=$1", [r.o_weighing_id])).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("update hc.batches set initial_g = 1 where id=$1", [r.o_batch_id])).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("delete from hc.batches where id=$1", [r.o_batch_id])).rejects.toMatchObject({ code: "HC423" });
  });
});
