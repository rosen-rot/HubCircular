import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, registerAs, type TestDb } from "../helpers/db";
import type { Actor } from "../../src/modules/identity/types";
import type { IndicatorFilters } from "../../src/modules/indicators/filters";

/** Capa de aplicación de indicadores (consultas + servicio) a través de hc_app, con permisos y traducción de errores. */
let db: TestDb;
let admin: Actor, operator: Actor, reader: Actor;
type Q = typeof import("../../src/modules/indicators/queries");
type S = typeof import("../../src/modules/indicators/service");
type X = typeof import("../../src/modules/indicators/exports");
let q: Q, s: S, x: X;

const F: IndicatorFilters = { from: "2026-03-09", to: "2026-03-13", zoneId: null, materialId: null, origin: "demo" };

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  [q, s, x] = await Promise.all([import("../../src/modules/indicators/queries"), import("../../src/modules/indicators/service"), import("../../src/modules/indicators/exports")]);
  const actor = (id: string, role: Actor["roles"][number]["role"], zone: string | null): Actor => ({ userId: id, email: "x@x.test", displayName: role, roles: [{ role, zoneId: zone }] });
  admin = actor(db.ids.admin, "administrador", null);
  operator = actor(db.ids.operator, "operador", db.ids.zoneCowork);
  reader = actor(db.ids.reader, "lector", null);
  await registerAs(db, db.ids.admin, { code: "DEMO-Z01-EST01-CARTON", gross: 5350, tare: 350, occurredAt: new Date("2026-03-10T13:00:00Z") });
  await registerAs(db, db.ids.admin, { code: "DEMO-Z02-EST01-ALUMINIO", gross: 2500, tare: 500, occurredAt: new Date("2026-03-10T14:00:00Z"), contamination: true });
});
afterAll(async () => {
  const { getPool } = await import("../../src/lib/db");
  await getPool().end();
  await db.drop();
});

describe("getIndicators", () => {
  it("devuelve cifras, semanas con nombre de material y bandera de datos reales; BigInt llega como number", async () => {
    const r = await q.getIndicators(admin, F);
    expect(r.kpis).toMatchObject({ capturedG: 7_000, weighings: 2, contaminated: 1, closingG: 7_000, openingG: 0 });
    expect(typeof r.kpis.capturedG).toBe("number");
    expect(r.weekly.map((w) => [w.weekStart, w.materialName, w.capturedG])).toEqual(
      expect.arrayContaining([["2026-03-09", expect.stringContaining("Cartón"), 5_000], ["2026-03-09", expect.stringContaining("aluminio"), 2_000]]),
    );
    expect(r.hasRealData).toBe(false);
    expect(r.occurrences).toEqual([]);
  });

  it("el lector ve lo mismo que el administrador (ámbito global); el operador, solo Cowork", async () => {
    expect((await q.getIndicators(reader, F)).kpis.capturedG).toBe(7_000);
    const op = await q.getIndicators(operator, F);
    expect(op.kpis).toMatchObject({ capturedG: 5_000, weighings: 1, contaminated: 0 });
    expect(op.weekly.every((w) => !/aluminio/i.test(w.materialName))).toBe(true);
  });

  it("opciones de filtro: solo materiales y zonas del origen elegido", async () => {
    const demo = await q.loadIndicatorOptions(admin, "demo");
    expect(demo.zones.map((z) => z.name)).toEqual(expect.arrayContaining(["Cowork DEMO", "Laboratorio DEMO"]));
    const real = await q.loadIndicatorOptions(admin, "real");
    expect(real).toEqual({ zones: [], materials: [] });
    const op = await q.loadIndicatorOptions(operator, "demo");
    expect(op.zones.every((z) => z.name !== "Laboratorio DEMO")).toBe(true);
  });
});

describe("exportaciones", () => {
  it("pesajes: respeta ámbito, origen y encabezados; las horas salen en hora de Chile", async () => {
    const all = await q.exportWeighings(admin, F);
    expect(all.rows).toHaveLength(2);
    expect(all.truncated).toBe(false);
    const csv = x.detailCsv(x.WEIGHING_HEADERS, all.rows as Record<string, string | number | boolean | null>[]);
    expect(csv).toContain("2026-03-10 10:00:00;DEMO-Z01-EST01-CARTON");
    expect(csv).toContain("neto_g");
    const op = await q.exportWeighings(operator, F);
    expect(op.rows).toHaveLength(1);
    expect((await q.exportWeighings(admin, { ...F, origin: "real" })).rows).toHaveLength(0);
  });

  it("movimientos: incluye correcciones marcadas como no efectivas", async () => {
    const { rows: [b] } = await db.admin.query("select id from hc.batches where initial_g = 5000 limit 1");
    const dest = (await db.admin.query("select id from hc.destinations where type = 'gestor' and data_origin = 'demo' limit 1")).rows[0].id as string;
    const m = await db.asActor(db.ids.operator, async (c) =>
      (await c.query("select * from hc.register_movement($1,$2,'despacho',1000,$3,null,$4,'2026-03-11T14:00:00Z'::timestamptz,null,$5)", [db.ids.operator, b.id, db.ids.zoneCowork, dest, crypto.randomUUID()])).rows[0],
    );
    await db.asActor(db.ids.admin, (c) => c.query("select * from hc.correct_movement($1,$2,'registrado por error',$3)", [db.ids.admin, m.o_movement_id, crypto.randomUUID()]));
    // La corrección se fecha al momento de corregir (hoy): el detalle exportado la muestra en su propio período.
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const mv = await q.exportMovements(admin, { ...F, to: hoy });
    const tipos = mv.rows.map((r) => [r.tipo, r.efectivo]);
    expect(tipos).toEqual(expect.arrayContaining([["despacho", false], ["correccion", false]]));
    // los KPIs no cuentan ni el despacho corregido ni su corrección
    expect((await q.getIndicators(admin, F)).kpis.dispatchedG).toBe(0);
    const list = await q.listPeriodMovements(admin, F);
    expect(list.rows).toHaveLength(0);
  });
});

describe("servicio de calendarios y cero", () => {
  const cartonId = async () => (await db.admin.query("select id from hc.containers where code = 'DEMO-Z01-EST01-CARTON'")).rows[0].id as string;
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

  it("permisos de aplicación: operador y lector no programan; lector no confirma cero", async () => {
    const c = await cartonId();
    await expect(s.createSchedule(operator, { containerId: c, weekdays: [1], startOn: today() })).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(s.createSchedule(reader, { containerId: c, weekdays: [1], startOn: today() })).rejects.toMatchObject({ code: "forbidden" });
    await expect(s.confirmZero(reader, { containerId: c, note: null })).rejects.toMatchObject({ code: "forbidden" });
    await expect(s.endSchedule(operator, { scheduleId: crypto.randomUUID(), endOn: today() })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("errores de la BD llegan traducidos con estado y mensaje en español", async () => {
    const c = await cartonId();
    await expect(s.createSchedule(admin, { containerId: c, weekdays: [], startOn: today() })).rejects.toMatchObject({ code: "weekdays_invalid", status: 422 });
    await expect(s.createSchedule(admin, { containerId: c, weekdays: [1], startOn: "2020-01-01" })).rejects.toMatchObject({ code: "schedule_start_invalid" });
    const id = await s.createSchedule(admin, { containerId: c, weekdays: [1, 2, 3, 4, 5, 6, 7], startOn: today() });
    const err = await s.createSchedule(admin, { containerId: c, weekdays: [1], startOn: today() }).catch((e) => e);
    expect(err).toMatchObject({ code: "schedule_overlap", status: 409 });
    expect(err.userMessage).toMatch(/calendario vigente/);
    await expect(s.endSchedule(admin, { scheduleId: crypto.randomUUID(), endOn: today() })).rejects.toMatchObject({ code: "schedule_not_found", status: 404 });

    // el operador confirma «cero»; el reintento es idempotente; el tablero lo cuenta
    const z = await s.confirmZero(operator, { containerId: c, note: "  vacío  " });
    expect(z.duplicate).toBe(false);
    expect(await s.confirmZero(operator, { containerId: c, note: null })).toMatchObject({ confirmationId: z.confirmationId, duplicate: true });
    const t = today();
    const r = await q.getIndicators(operator, { ...F, from: t, to: t });
    expect(r.occurrences).toEqual([expect.objectContaining({ day: t, status: "cero_confirmado", zeroNote: "vacío" })]);
    const list = await q.listTodayMeasurements(operator);
    expect(list.items.map((i) => [i.container.code, i.occurrence.status])).toEqual([["DEMO-Z01-EST01-CARTON", "cero_confirmado"]]);
    const kpiCsv = x.kpiCsv({ kpis: r.kpis, occurrences: r.occurrences, filters: { ...F, from: t, to: t }, zoneName: null, materialName: null });
    expect(kpiCsv).toContain("cobertura_cero_confirmado;1;n");
    expect(kpiCsv).toContain("cobertura_porcentaje;100 %;%");

    await s.endSchedule(admin, { scheduleId: id, endOn: new Date(Date.parse(`${t}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) });
    const schedules = await q.listContainerSchedules(admin);
    const mine = schedules.find((x2) => x2.container.code === "DEMO-Z01-EST01-CARTON")!;
    expect(mine.schedules).toHaveLength(1);
    expect(mine.schedules[0]!.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await expect(s.endSchedule(admin, { scheduleId: id, endOn: t })).rejects.toMatchObject({ code: "schedule_already_ended" });
  });

  it("el operador no ve calendarios de otra zona en la gestión", async () => {
    const lab = (await db.admin.query("select id from hc.containers where code = 'DEMO-Z02-EST01-ALUMINIO'")).rows[0].id as string;
    await s.createSchedule(admin, { containerId: lab, weekdays: [1, 2, 3, 4, 5, 6, 7], startOn: today() });
    const opView = await q.listTodayMeasurements(operator);
    expect(opView.items.some((i) => i.container.code === "DEMO-Z02-EST01-ALUMINIO")).toBe(false);
    const adm = await q.listTodayMeasurements(admin);
    expect(adm.items.some((i) => i.container.code === "DEMO-Z02-EST01-ALUMINIO")).toBe(true);
  });
});
