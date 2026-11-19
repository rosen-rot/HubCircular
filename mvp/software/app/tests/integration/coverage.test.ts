import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, registerAs, type TestDb } from "../helpers/db";

/** Calendarios de medición, cobertura derivada y «cero confirmado» (Iteración 3). */
const PET = "DEMO-Z01-EST01-PET"; // Cowork
const ALU = "DEMO-Z02-EST01-ALUMINIO"; // Laboratorio
const CARTON = "DEMO-Z01-EST01-CARTON";
const at = (iso: string) => new Date(iso);

let db: TestDb;
let admin: string;
let operator: string;
let reader: string;
let petId: string;
let aluId: string;
let cartonId: string;

const expectErr = (p: Promise<unknown>, message: string, sqlstate?: string) =>
  expect(p).rejects.toMatchObject({ message, ...(sqlstate ? { code: sqlstate } : {}) });

const containerId = async (code: string) => (await db.admin.query("select id from hc.containers where code = $1", [code])).rows[0].id as string;
const today = async () => (await db.admin.query("select hc._today_cl()::text as d")).rows[0].d as string;
const isodow = async () => Number((await db.admin.query("select extract(isodow from hc._today_cl())::int as d")).rows[0].d);

const createSchedule = (actor: string, container: string, days: number[], start: string) =>
  db.asActor(actor, async (c) => (await c.query("select * from hc.create_measurement_schedule($1,$2,$3::int[],$4::date)", [actor, container, days, start])).rows[0] as { o_schedule_id: string });
const endSchedule = (actor: string, id: string, endOn: string) =>
  db.asActor(actor, (c) => c.query("select hc.end_measurement_schedule($1,$2,$3::date)", [actor, id, endOn]));
const confirmZero = (actor: string, container: string, note: string | null = null) =>
  db.asActor(actor, async (c) => (await c.query("select * from hc.confirm_zero_measurement($1,$2,$3)", [actor, container, note])).rows[0] as { o_confirmation_id: string; o_duplicate: boolean });
const occurrences = (actor: string, from: string, to: string, o: { zone?: string | null; origin?: string } = {}) =>
  db.asActor(actor, async (c) => (await c.query("select o_container_id, o_expected_on::text as day, o_status, o_weighings, o_zero_note from hc.coverage_occurrences($1::date,$2::date,$3,null,$4) order by o_expected_on, o_container_id", [from, to, o.zone ?? null, o.origin ?? "demo"])).rows as { o_container_id: string; day: string; o_status: string; o_weighings: number; o_zero_note: string | null }[]);

beforeAll(async () => {
  db = await createTestDb();
  ({ admin, operator, reader } = db.ids);
  petId = await containerId(PET);
  aluId = await containerId(ALU);
  cartonId = await containerId(CARTON);
});
afterAll(async () => {
  await db.drop();
});

describe("estado derivado de las mediciones esperadas (pasado)", () => {
  // PET: lunes y miércoles entre el 2-feb y el 12-feb-2026. Esperadas: 2, 4, 9 y 11 de febrero.
  beforeAll(async () => {
    await db.admin.query(
      "insert into hc.measurement_schedules (container_id, weekdays, start_on, end_on, created_by, ended_by, ended_at, data_origin) values ($1, '{1,3}', '2026-02-02', '2026-02-12', $2, $2, now(), 'demo')",
      [petId, admin],
    );
    // 2-feb: pesaje (y además un «cero» que no debe prevalecer sobre el pesaje)
    await registerAs(db, admin, { code: PET, gross: 1_350, tare: 350, occurredAt: at("2026-02-02T13:00:00Z") });
    await db.admin.query("insert into hc.measurement_zero_confirmations (container_id, expected_on, confirmed_by, data_origin) values ($1, '2026-02-02', $2, 'demo')", [petId, admin]);
    // 4-feb: solo «cero» confirmado
    await db.admin.query("insert into hc.measurement_zero_confirmations (container_id, expected_on, note, confirmed_by, data_origin) values ($1, '2026-02-04', 'contenedor vacío', $2, 'demo')", [petId, admin]);
    // 9-feb: nada ⇒ omitido (ausente ≠ cero)
    // 11-feb 23:30 hora local = 12-feb 02:30 UTC: cuenta para el 11 (día calendario de Chile)
    await registerAs(db, admin, { code: PET, gross: 1_350, tare: 350, occurredAt: at("2026-02-12T02:30:00Z") });
    // 3-feb (martes, no esperado): pesaje «no previsto»
    await registerAs(db, admin, { code: PET, gross: 1_350, tare: 350, occurredAt: at("2026-02-03T13:00:00Z") });
  });

  it("realizado > cero confirmado > omitido; el pesaje de las 23:30 locales cuenta para su día", async () => {
    const r = await occurrences(admin, "2026-02-01", "2026-02-28");
    expect(r.map((x) => [x.day, x.o_status])).toEqual([
      ["2026-02-02", "realizado"],
      ["2026-02-04", "cero_confirmado"],
      ["2026-02-09", "omitido"],
      ["2026-02-11", "realizado"],
    ]);
    expect(r[0]!.o_weighings).toBe(1);
    expect(r[1]!.o_zero_note).toBe("contenedor vacío");
    expect(r[2]!.o_weighings).toBe(0);
  });

  it("el calendario terminado no genera esperadas después de su fin; un rango parcial recorta", async () => {
    expect((await occurrences(admin, "2026-02-12", "2026-03-31")).length).toBe(0);
    const part = await occurrences(admin, "2026-02-03", "2026-02-09");
    expect(part.map((x) => x.day)).toEqual(["2026-02-04", "2026-02-09"]);
  });

  it("el pesaje en día no esperado se informa como «no previsto» y no cuenta como medición esperada", async () => {
    const u = await db.asActor(admin, async (c) => (await c.query("select o_day::text as day from hc.unplanned_weighings('2026-02-01','2026-02-28',null,null,'demo')")).rows as { day: string }[]);
    expect(u.map((x) => x.day)).toEqual(["2026-02-03"]);
  });

  it("is_expected_on respeta el calendario vigente en cada fecha", async () => {
    const q = async (d: string) => (await db.admin.query("select hc.is_expected_on($1, $2::date) as e", [petId, d])).rows[0].e as boolean;
    expect(await q("2026-02-02")).toBe(true);
    expect(await q("2026-02-03")).toBe(false);
    expect(await q("2026-02-12")).toBe(false); // jueves
    expect(await q("2026-02-16")).toBe(false); // lunes posterior al término
    expect(await q("2026-01-26")).toBe(false); // lunes anterior al inicio
  });
});

describe("ámbito y origen en la cobertura", () => {
  it("el operador de Cowork no ve calendarios de Laboratorio; el origen real no mezcla DEMO", async () => {
    await db.admin.query(
      "insert into hc.measurement_schedules (container_id, weekdays, start_on, end_on, created_by, ended_by, ended_at, data_origin) values ($1, '{2}', '2026-02-03', '2026-02-10', $2, $2, now(), 'demo')",
      [aluId, admin],
    );
    const adm = await occurrences(admin, "2026-02-01", "2026-02-28");
    expect(adm.some((x) => x.o_container_id === aluId)).toBe(true);
    const op = await occurrences(operator, "2026-02-01", "2026-02-28");
    expect(op.every((x) => x.o_container_id !== aluId)).toBe(true);
    expect(op.length).toBe(adm.length - adm.filter((x) => x.o_container_id === aluId).length);
    expect((await occurrences(admin, "2026-02-01", "2026-02-28", { origin: "real" })).length).toBe(0);
    const sch = await db.asActor(operator, async (c) => (await c.query("select container_id from hc.measurement_schedules")).rows as { container_id: string }[]);
    expect(sch.every((r) => r.container_id !== aluId)).toBe(true);
  });
});

describe("crear y terminar calendarios", () => {
  it("solo el administrador programa; validaciones de días y fechas", async () => {
    const t = await today();
    await expectErr(createSchedule(operator, cartonId, [1], t), "forbidden", "HC403");
    await expectErr(createSchedule(reader, cartonId, [1], t), "forbidden", "HC403");
    await expectErr(createSchedule(admin, cartonId, [], t), "weekdays_invalid", "HC422");
    await expectErr(createSchedule(admin, cartonId, [0], t), "weekdays_invalid");
    await expectErr(createSchedule(admin, cartonId, [8], t), "weekdays_invalid");
    await expectErr(createSchedule(admin, cartonId, [1, 2], "2020-01-01"), "schedule_start_invalid");
    await expectErr(createSchedule(admin, cartonId, [1, 2], "2099-01-01"), "schedule_start_invalid");
    await expectErr(createSchedule(admin, crypto.randomUUID(), [1], t), "container_not_found", "HC404");
  });

  it("crea (días únicos y ordenados), audita, rechaza solapes y permite uno nuevo tras terminar", async () => {
    const t = await today();
    const s = await createSchedule(admin, cartonId, [5, 1, 1, 3], t);
    const row = (await db.admin.query("select weekdays, start_on::text as s, end_on, data_origin from hc.measurement_schedules where id = $1", [s.o_schedule_id])).rows[0];
    expect(row).toMatchObject({ weekdays: [1, 3, 5], s: t, end_on: null, data_origin: "demo" });
    const audit = await db.admin.query("select count(*)::int as n from hc.audit_logs where entity = 'measurement_schedule' and entity_id = $1 and action = 'create'", [s.o_schedule_id]);
    expect(audit.rows[0].n).toBe(1);

    await expectErr(createSchedule(admin, cartonId, [2], t), "schedule_overlap", "HC409");

    // Terminar: no antes de ayer ni antes del inicio
    await expectErr(endSchedule(operator, s.o_schedule_id, t), "forbidden", "HC403");
    await expectErr(endSchedule(admin, s.o_schedule_id, "2020-01-01"), "schedule_end_invalid", "HC422");
    await expectErr(endSchedule(admin, crypto.randomUUID(), t), "schedule_not_found", "HC404");
    await endSchedule(admin, s.o_schedule_id, t);
    await expectErr(endSchedule(admin, s.o_schedule_id, t), "schedule_already_ended", "HC409");

    // Con el calendario terminado hoy, uno nuevo puede empezar mañana, pero no hoy
    const tomorrow = (await db.admin.query("select (hc._today_cl() + 1)::text as d")).rows[0].d as string;
    await expectErr(createSchedule(admin, cartonId, [2], t), "schedule_overlap");
    const s2 = await createSchedule(admin, cartonId, [2], tomorrow);
    expect(s2.o_schedule_id).not.toBe(s.o_schedule_id);
  });

  it("un calendario no se edita ni se borra (solo se termina una vez); no hay escritura directa desde la aplicación", async () => {
    const id = (await db.admin.query("select id from hc.measurement_schedules where container_id = $1 and end_on is null limit 1", [cartonId])).rows[0].id as string;
    await expect(db.admin.query("update hc.measurement_schedules set weekdays = '{7}' where id = $1", [id])).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("delete from hc.measurement_schedules where id = $1", [id])).rejects.toMatchObject({ code: "HC423" });
    const ended = (await db.admin.query("select id from hc.measurement_schedules where container_id = $1 and end_on is not null limit 1", [cartonId])).rows[0].id as string;
    await expect(db.admin.query("update hc.measurement_schedules set end_on = end_on + 1 where id = $1", [ended])).rejects.toMatchObject({ code: "HC423" });
    await db.asActor(admin, async (c) => {
      await expect(c.query("insert into hc.measurement_schedules (container_id, weekdays, start_on, created_by, data_origin) values ($1,'{1}', current_date, $2, 'demo')", [cartonId, admin])).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("«cero confirmado» (hoy)", () => {
  it("rechaza si hoy no hay medición esperada y si el actor no tiene ámbito", async () => {
    const t = await today();
    await expectErr(confirmZero(admin, aluId), "not_expected_today", "HC422"); // sin calendario
    await expectErr(confirmZero(operator, aluId), "forbidden", "HC403"); // fuera de ámbito: no revela si hay calendario
    await expectErr(confirmZero(admin, crypto.randomUUID()), "container_not_found", "HC404");
    await expectErr(confirmZero(reader, petId), "forbidden", "HC403");
    // calendario de Laboratorio hoy: el operador de Cowork no tiene ámbito
    await createSchedule(admin, aluId, [1, 2, 3, 4, 5, 6, 7], t);
    await expectErr(confirmZero(operator, aluId), "forbidden", "HC403");
    await expectErr(confirmZero(admin, aluId, "x".repeat(501)), "notes_too_long");
  });

  it("confirma sin crear pesaje ni masa; es idempotente por contenedor y día; queda auditado e inmutable", async () => {
    const t = await today();
    const before = await db.admin.query("select (select count(*)::int from hc.weighings) as w, (select count(*)::int from hc.batches) as b, (select count(*)::int from hc.batch_location_balances) as l");
    const first = await confirmZero(admin, aluId, "  sin residuos hoy  ");
    expect(first.o_duplicate).toBe(false);
    const again = await confirmZero(admin, aluId, "otra nota");
    expect(again).toMatchObject({ o_confirmation_id: first.o_confirmation_id, o_duplicate: true });
    const after = await db.admin.query("select (select count(*)::int from hc.weighings) as w, (select count(*)::int from hc.batches) as b, (select count(*)::int from hc.batch_location_balances) as l");
    expect(after.rows[0]).toEqual(before.rows[0]);
    const z = (await db.admin.query("select note, expected_on::text as d, confirmed_by from hc.measurement_zero_confirmations where id = $1", [first.o_confirmation_id])).rows[0];
    expect(z).toMatchObject({ note: "sin residuos hoy", d: t, confirmed_by: admin });
    const audit = await db.admin.query("select count(*)::int as n from hc.audit_logs where entity = 'measurement_zero' and entity_id = $1", [first.o_confirmation_id]);
    expect(audit.rows[0].n).toBe(1);
    await expect(db.admin.query("update hc.measurement_zero_confirmations set note = 'x' where id = $1", [first.o_confirmation_id])).rejects.toMatchObject({ code: "HC423" });
    await expect(db.admin.query("delete from hc.measurement_zero_confirmations where id = $1", [first.o_confirmation_id])).rejects.toMatchObject({ code: "HC423" });
    // hoy aparece como cero confirmado en la cobertura
    const r = (await occurrences(admin, t, t)).filter((x) => x.o_container_id === aluId);
    expect(r).toEqual([expect.objectContaining({ day: t, o_status: "cero_confirmado", o_zero_note: "sin residuos hoy" })]);
  });

  it("el operador del ámbito confirma; con pesaje del día ya no corresponde «cero»; hoy sin nada queda «pendiente»", async () => {
    const t = await today();
    const dow = await isodow();
    // PET (Cowork): calendario desde hoy todos los días
    await createSchedule(admin, petId, [1, 2, 3, 4, 5, 6, 7], t);
    const pend = (await occurrences(admin, t, t)).find((x) => x.o_container_id === petId);
    expect(pend).toMatchObject({ day: t, o_status: "pendiente" });
    // pesaje hoy ⇒ realizado y ya no se permite «cero»
    await registerAs(db, operator, { code: PET, gross: 1_350, tare: 350 });
    await expectErr(confirmZero(operator, petId), "weighing_exists", "HC422");
    expect((await occurrences(admin, t, t)).find((x) => x.o_container_id === petId)).toMatchObject({ o_status: "realizado", o_weighings: 1 });

    // Contenedor global (Cowork, sin pesaje hoy): el operador del ámbito confirma «cero» en un calendario de todos los días
    const g = await containerId("DEMO-Z01-GLOBAL-MIXTO");
    await createSchedule(admin, g, [1, 2, 3, 4, 5, 6, 7], t);
    const z = await confirmZero(operator, g, "operador");
    expect(z.o_duplicate).toBe(false);
    expect((await occurrences(operator, t, t)).find((x) => x.o_container_id === g)).toMatchObject({ o_status: "cero_confirmado", o_zero_note: "operador" });
    // el cartón tuvo un calendario (1, 3, 5) terminado hoy: fuera de esos días no hay medición esperada
    if (![1, 3, 5].includes(dow)) await expectErr(confirmZero(operator, cartonId), "not_expected_today");
  });
});
