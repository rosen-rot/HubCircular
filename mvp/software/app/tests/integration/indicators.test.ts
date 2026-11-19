import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, destinationId, moveAs, registerAs, type TestDb } from "../helpers/db";

/**
 * Conciliación de indicadores (Iteración 3) contra un libro con valores conocidos.
 * Todo DEMO salvo el bloque de separación real/DEMO. Fechas fijas del pasado; zona horaria America/Santiago.
 */
const CARTON = "DEMO-Z01-EST01-CARTON";
const ALU = "DEMO-Z02-EST01-ALUMINIO";
const at = (iso: string) => new Date(iso);

let db: TestDb;
let z1: string;
let z2: string;
let admin: string;
let operator: string;
let reader: string;
let gestor: string;
let reuso: string;
let cartonId: string;
let aluId: string;
let batchA: string;

interface Kpi {
  o_captured_g: number; o_weighings: number; o_contaminated: number;
  o_dispatched_g: number; o_dispatched_confirmed_g: number; o_dispatched_rejected_g: number;
  o_dispatched_pending_g: number; o_dispatched_pending_no_evidence_g: number;
  o_reused_g: number; o_reused_backed_g: number; o_rejected_g: number;
  o_adjust_in_g: number; o_adjust_out_g: number; o_transfer_in_g: number; o_transfer_out_g: number;
  o_opening_g: number; o_closing_g: number; o_current_g: number;
}

const kpi = (actor: string, from: string, to: string, o: { zone?: string | null; material?: string | null; origin?: string } = {}) =>
  db.asActor(actor, async (c) => (await c.query("select * from hc.kpi_summary($1::date,$2::date,$3,$4,$5)", [from, to, o.zone ?? null, o.material ?? null, o.origin ?? "demo"])).rows[0] as Kpi);

const closingIdentity = (k: Kpi) =>
  k.o_opening_g + k.o_captured_g + k.o_adjust_in_g - k.o_adjust_out_g - k.o_dispatched_g - k.o_reused_g - k.o_rejected_g + k.o_transfer_in_g - k.o_transfer_out_g;

const evidence = (actor: string, id: string, ref: string) =>
  db.asActor(actor, (c) => c.query("select * from hc.add_movement_evidence($1,$2,'guia_despacho',$3,null)", [actor, id, ref]));
const verify = (actor: string, id: string, status: string, notes: string | null = null) =>
  db.asActor(actor, (c) => c.query("select * from hc.verify_movement($1,$2,$3,$4)", [actor, id, status, notes]));

beforeAll(async () => {
  db = await createTestDb();
  ({ zoneCowork: z1, zoneLab: z2, admin, operator, reader } = db.ids);
  gestor = await destinationId(db, "gestor");
  reuso = await destinationId(db, "reutilizacion");
  cartonId = db.ids.materialCarton;
  aluId = (await db.admin.query("select id from hc.materials where code = 'ALUMINIO'")).rows[0].id;

  // Captación
  const w1 = await registerAs(db, admin, { code: CARTON, gross: 12_350, tare: 350, occurredAt: at("2026-03-09T13:00:00Z"), contamination: true });
  batchA = w1.o_batch_id;
  await registerAs(db, admin, { code: ALU, gross: 3_500, tare: 500, occurredAt: at("2026-03-10T13:00:00Z") });

  // Movimientos
  await moveAs(db, admin, { batchId: batchA, type: "traslado", quantityG: 2_000, from: z1, to: z2, occurredAt: at("2026-03-10T15:00:00Z") });
  const d1 = await moveAs(db, operator, { batchId: batchA, type: "despacho", quantityG: 5_000, from: z1, destinationId: gestor, occurredAt: at("2026-03-11T14:00:00Z") });
  await moveAs(db, operator, { batchId: batchA, type: "despacho", quantityG: 1_000, from: z1, destinationId: gestor, occurredAt: at("2026-03-11T14:10:00Z") }); // pendiente sin evidencia
  const d3 = await moveAs(db, operator, { batchId: batchA, type: "despacho", quantityG: 500, from: z1, destinationId: gestor, occurredAt: at("2026-03-11T14:20:00Z") });
  const d4 = await moveAs(db, operator, { batchId: batchA, type: "despacho", quantityG: 300, from: z1, destinationId: gestor, occurredAt: at("2026-03-11T14:30:00Z") });
  await evidence(operator, d1.o_movement_id, "GD-1");
  await verify(admin, d1.o_movement_id, "confirmada");
  await evidence(operator, d3.o_movement_id, "GD-3");
  await evidence(operator, d4.o_movement_id, "GD-4");
  await verify(admin, d4.o_movement_id, "rechazada", "la guía no corresponde al lote");
  const r1 = await moveAs(db, operator, { batchId: batchA, type: "reutilizacion", quantityG: 1_000, from: z1, destinationId: reuso, occurredAt: at("2026-03-12T14:00:00Z") });
  await evidence(operator, r1.o_movement_id, "RU-1");
  await moveAs(db, operator, { batchId: batchA, type: "reutilizacion", quantityG: 200, from: z1, destinationId: reuso, occurredAt: at("2026-03-12T14:05:00Z") });
  await moveAs(db, operator, { batchId: batchA, type: "rechazo", quantityG: 400, from: z1, reason: "material mojado", occurredAt: at("2026-03-12T14:10:00Z") });
  await moveAs(db, admin, { batchId: batchA, type: "ajuste", quantityG: 100, from: z1, reason: "merma por humedad", occurredAt: at("2026-03-12T14:20:00Z") });
  await moveAs(db, admin, { batchId: batchA, type: "ajuste", quantityG: 250, to: z1, reason: "diferencia de balanza", occurredAt: at("2026-03-12T14:30:00Z") });
  // Despacho registrado por error y corregido: no debe contarse (el par se anula).
  const e1 = await moveAs(db, operator, { batchId: batchA, type: "despacho", quantityG: 700, from: z1, destinationId: gestor, occurredAt: at("2026-03-12T15:00:00Z") });
  await db.asActor(admin, (c) => c.query("select * from hc.correct_movement($1,$2,'registrado por error',$3)", [admin, e1.o_movement_id, crypto.randomUUID()]));

  // Captaciones posteriores para semanas y fronteras de día (hora de Chile: verano UTC-3, invierno UTC-4)
  await registerAs(db, admin, { code: CARTON, gross: 1_350, tare: 350, occurredAt: at("2026-03-16T02:30:00Z") }); // domingo 15, 23:30 local
  await registerAs(db, admin, { code: CARTON, gross: 750, tare: 350, occurredAt: at("2026-03-16T03:30:00Z") }); // lunes 16, 00:30 local
  // Cambio de hora: el 4-abr-2026 a las 24:00 los relojes se atrasan (día de 25 h)
  await registerAs(db, admin, { code: CARTON, gross: 2_350, tare: 350, occurredAt: at("2026-04-05T03:30:00Z") }); // 4-abr 23:30 (UTC-4)
  await registerAs(db, admin, { code: CARTON, gross: 3_350, tare: 350, occurredAt: at("2026-04-05T04:30:00Z") }); // 5-abr 00:30 (UTC-4)
});
afterAll(async () => {
  await db.drop();
});

describe("conciliación del período con valores conocidos", () => {
  it("administrador, todo el ámbito: cada indicador coincide con el libro", async () => {
    const k = await kpi(admin, "2026-03-09", "2026-03-13");
    expect(k).toMatchObject({
      o_captured_g: 15_000, o_weighings: 2, o_contaminated: 1,
      o_dispatched_g: 6_800, o_dispatched_confirmed_g: 5_000, o_dispatched_rejected_g: 300,
      o_dispatched_pending_g: 1_500, o_dispatched_pending_no_evidence_g: 1_000,
      o_reused_g: 1_200, o_reused_backed_g: 1_000, o_rejected_g: 400,
      o_adjust_in_g: 250, o_adjust_out_g: 100, o_transfer_in_g: 2_000, o_transfer_out_g: 2_000,
      o_opening_g: 0, o_closing_g: 6_750,
    });
    expect(closingIdentity(k)).toBe(k.o_closing_g);
    // confirmado + rechazado + pendiente = total despachado
    expect(k.o_dispatched_confirmed_g + k.o_dispatched_rejected_g + k.o_dispatched_pending_g).toBe(k.o_dispatched_g);
  });

  it("el despacho corregido no se cuenta y el traslado no suma captación", async () => {
    const k = await kpi(admin, "2026-03-09", "2026-03-13");
    expect(k.o_dispatched_g).toBe(6_800); // sin los 700 g corregidos
    expect(k.o_captured_g).toBe(15_000); // el traslado de 2.000 g no es captación
  });

  it("el inventario actual reconstruido coincide con los saldos materializados (todos los ámbitos)", async () => {
    for (const actor of [admin, reader]) {
      const inv = await db.asActor(actor, async (c) => (await c.query("select coalesce(sum(o_balance_g),0)::bigint as t from hc.inventory_at('infinity', null, null, 'demo')")).rows[0].t as number);
      const bal = (await db.admin.query("select coalesce(sum(balance_g),0)::bigint as t from hc.batch_location_balances")).rows[0].t as number;
      expect(inv).toBe(bal);
    }
    // por zona y material también
    const rows = await db.asActor(admin, async (c) => (await c.query("select o_zone_id, o_material_id, o_balance_g from hc.inventory_at('infinity', null, null, 'demo')")).rows as { o_zone_id: string; o_material_id: string; o_balance_g: number }[]);
    const bal = (await db.admin.query("select bl.zone_id, b.material_id, sum(bl.balance_g)::bigint as t from hc.batch_location_balances bl join hc.batches b on b.id = bl.batch_id group by 1, 2")).rows as { zone_id: string; material_id: string; t: number }[];
    const key = (z: string, m: string) => `${z}|${m}`;
    const a = new Map(rows.filter((r) => r.o_balance_g !== 0).map((r) => [key(r.o_zone_id, r.o_material_id), r.o_balance_g]));
    const b = new Map(bal.filter((r) => Number(r.t) !== 0).map((r) => [key(r.zone_id, r.material_id), Number(r.t)]));
    expect(a).toEqual(b);
  });

  it("el período se parte sin pérdidas: cierre del primero = apertura del segundo y las sumas cuadran", async () => {
    const all = await kpi(admin, "2026-03-09", "2026-03-13");
    const p1 = await kpi(admin, "2026-03-09", "2026-03-10");
    const p2 = await kpi(admin, "2026-03-11", "2026-03-13");
    expect(p2.o_opening_g).toBe(p1.o_closing_g);
    expect(p1.o_closing_g).toBe(closingIdentity(p1));
    expect(p2.o_closing_g).toBe(closingIdentity(p2));
    for (const f of ["o_captured_g", "o_weighings", "o_dispatched_g", "o_reused_g", "o_rejected_g", "o_adjust_in_g", "o_adjust_out_g", "o_transfer_in_g", "o_transfer_out_g"] as const) {
      expect(p1[f] + p2[f]).toBe(all[f]);
    }
    expect(p2.o_closing_g).toBe(all.o_closing_g);
  });

  it("filtro por zona (con descendientes) y por material concilia por separado", async () => {
    const zl = await kpi(admin, "2026-03-09", "2026-03-13", { zone: z2 });
    expect(zl).toMatchObject({ o_captured_g: 3_000, o_transfer_in_g: 2_000, o_transfer_out_g: 0, o_dispatched_g: 0, o_closing_g: 5_000 });
    expect(closingIdentity(zl)).toBe(zl.o_closing_g);

    const zc = await kpi(admin, "2026-03-09", "2026-03-13", { zone: z1 });
    expect(zc.o_closing_g).toBe(1_750);
    expect(closingIdentity(zc)).toBe(zc.o_closing_g);
    expect(zc.o_closing_g + zl.o_closing_g).toBe(6_750);

    const carton = await kpi(admin, "2026-03-09", "2026-03-13", { material: cartonId });
    const alu = await kpi(admin, "2026-03-09", "2026-03-13", { material: aluId });
    expect(carton.o_captured_g).toBe(12_000);
    expect(alu.o_captured_g).toBe(3_000);
    expect(carton.o_closing_g + alu.o_closing_g).toBe(6_750);
    expect(alu.o_closing_g).toBe(3_000);
    expect(carton.o_dispatched_g).toBe(6_800);
    expect(alu.o_dispatched_g).toBe(0);
  });
});

describe("ámbito del actor", () => {
  it("el operador de Cowork solo ve su zona; el traslado saliente cuenta, el entrante a otra zona no", async () => {
    const k = await kpi(operator, "2026-03-09", "2026-03-13");
    expect(k).toMatchObject({
      o_captured_g: 12_000, o_weighings: 1, o_dispatched_g: 6_800, o_transfer_out_g: 2_000, o_transfer_in_g: 0,
      o_opening_g: 0, o_closing_g: 1_750,
    });
    expect(closingIdentity(k)).toBe(k.o_closing_g);
    // no puede ampliar su ámbito pidiendo otra zona
    const other = await kpi(operator, "2026-03-09", "2026-03-13", { zone: z2 });
    expect(other).toMatchObject({ o_captured_g: 0, o_weighings: 0, o_closing_g: 0, o_transfer_in_g: 0 });
  });

  it("el lote que se movió a otra zona sigue visible por la RLS general, pero el indicador solo cuenta líneas de su ámbito", async () => {
    // El operador de Cowork puede leer el lote A (vía ubicación), pero el saldo de Laboratorio no se suma a su inventario.
    const inv = await db.asActor(operator, async (c) => (await c.query("select o_zone_id, o_balance_g from hc.inventory_at('infinity', null, null, 'demo')")).rows as { o_zone_id: string; o_balance_g: number }[]);
    expect(inv.every((r) => r.o_zone_id === z1)).toBe(true);
  });

  it("el lector ve el consolidado según su ámbito (global)", async () => {
    const a = await kpi(admin, "2026-03-09", "2026-03-13");
    const r = await kpi(reader, "2026-03-09", "2026-03-13");
    expect(r).toEqual(a);
  });

  it("sin actor no hay lectura", async () => {
    const r = await db.asActor(null, async (c) => (await c.query("select * from hc.kpi_summary('2026-03-09','2026-03-13',null,null,'demo')")).rows[0] as Kpi);
    expect(r).toMatchObject({ o_captured_g: 0, o_weighings: 0, o_closing_g: 0 });
  });
});

describe("semanas y frontera de día en hora de Chile", () => {
  it("la semana inicia el lunes (hora local): un pesaje del domingo 23:30 pertenece a la semana anterior", async () => {
    const rows = await db.asActor(admin, async (c) => (await c.query("select o_week_start::text as w, o_material_id, o_captured_g, o_weighings from hc.kpi_weekly('2026-03-09','2026-03-22',null,null,'demo') order by 1, 2")).rows as { w: string; o_material_id: string; o_captured_g: number; o_weighings: number }[]);
    const byWeek = (w: string, m: string) => rows.find((r) => r.w === w && r.o_material_id === m);
    expect(byWeek("2026-03-09", cartonId)).toMatchObject({ o_captured_g: 12_000 + 1_000, o_weighings: 2 });
    expect(byWeek("2026-03-09", aluId)).toMatchObject({ o_captured_g: 3_000, o_weighings: 1 });
    expect(byWeek("2026-03-16", cartonId)).toMatchObject({ o_captured_g: 400, o_weighings: 1 });
    const total = rows.reduce((a, r) => a + r.o_captured_g, 0);
    const k = await kpi(admin, "2026-03-09", "2026-03-22");
    expect(total).toBe(k.o_captured_g);
  });

  it("días contiguos particionan exactamente, también en el cambio de hora (día de 25 h)", async () => {
    const d15 = await kpi(admin, "2026-03-15", "2026-03-15");
    const d16 = await kpi(admin, "2026-03-16", "2026-03-16");
    expect(d15.o_captured_g).toBe(1_000);
    expect(d16.o_captured_g).toBe(400);
    const apr4 = await kpi(admin, "2026-04-04", "2026-04-04");
    const apr5 = await kpi(admin, "2026-04-05", "2026-04-05");
    const both = await kpi(admin, "2026-04-04", "2026-04-05");
    expect(apr4.o_captured_g).toBe(2_000);
    expect(apr5.o_captured_g).toBe(3_000);
    expect(apr4.o_captured_g + apr5.o_captured_g).toBe(both.o_captured_g);
    expect(apr5.o_opening_g).toBe(apr4.o_closing_g);
  });

  it("un rango sin datos devuelve ceros, no nulos", async () => {
    const k = await kpi(admin, "2025-01-01", "2025-01-31");
    expect(k).toMatchObject({ o_captured_g: 0, o_weighings: 0, o_dispatched_g: 0, o_opening_g: 0, o_closing_g: 0 });
  });
});

describe("separación real / DEMO", () => {
  it("los datos DEMO nunca aparecen en el origen real y viceversa", async () => {
    const empty = await kpi(admin, "2026-03-09", "2026-03-13", { origin: "real" });
    expect(empty).toMatchObject({ o_captured_g: 0, o_weighings: 0, o_closing_g: 0, o_current_g: 0 });

    const b = (await db.admin.query("insert into hc.buildings (name, data_origin) values ('Edificio real', 'real') returning id")).rows[0].id as string;
    const z = (await db.admin.query("insert into hc.zones (building_id, name, data_origin) values ($1, 'Zona real', 'real') returning id", [b])).rows[0].id as string;
    const s = (await db.admin.query("insert into hc.stations (zone_id, code, name, data_origin) values ($1, 'REAL-EST01', 'Estación real', 'real') returning id", [z])).rows[0].id as string;
    const m = (await db.admin.query("insert into hc.materials (code, name, data_origin) values ('REAL-PET', 'PET real', 'real') returning id")).rows[0].id as string;
    await db.admin.query("insert into hc.containers (station_id, material_id, code, tare_g, data_origin) values ($1, $2, 'REAL-EST01-PET', 100, 'real')", [s, m]);
    await registerAs(db, admin, { code: "REAL-EST01-PET", gross: 1_100, tare: 100, occurredAt: at("2026-03-10T13:00:00Z") });

    const real = await kpi(admin, "2026-03-09", "2026-03-13", { origin: "real" });
    expect(real).toMatchObject({ o_captured_g: 1_000, o_weighings: 1, o_closing_g: 1_000 });
    const demo = await kpi(admin, "2026-03-09", "2026-03-13", { origin: "demo" });
    expect(demo.o_captured_g).toBe(15_000); // sin cambios por el dato real
  });
});

describe("las funciones de indicadores no son invocables sin rol de aplicación", () => {
  it("anon/authenticated no tienen EXECUTE", async () => {
    const r = await db.admin.query(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('hc_app', p.oid, 'execute') as app
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'hc' and p.proname = any($1)`,
      [["kpi_summary", "kpi_weekly", "inventory_at", "coverage_occurrences", "unplanned_weighings", "effective_movements", "create_measurement_schedule", "end_measurement_schedule", "confirm_zero_measurement"]],
    );
    expect(r.rows.length).toBe(9);
    for (const row of r.rows) {
      expect(row.anon, row.proname).toBe(false);
      expect(row.auth, row.proname).toBe(false);
      expect(row.app, row.proname).toBe(true);
    }
  });
});
