import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, PASSWORDS, registerAs, type TestDb } from "../helpers/db";
import type { Actor } from "../../src/modules/identity/types";

let db: TestDb;
let admin: Actor, operator: Actor, reader: Actor;
type Reg = Awaited<ReturnType<typeof registerAs>>;
let ref: { cowork1: Reg; cowork2: Reg; lab1: Reg };

type Q = typeof import("../../src/modules/weighing/queries");
type S = typeof import("../../src/modules/weighing/service");
type Inv = typeof import("../../src/modules/inventory/queries");
type Cat = typeof import("../../src/modules/catalog/queries");
let q: Q, s: S, inv: Inv, cat: Cat;

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  [q, s, inv, cat] = await Promise.all([
    import("../../src/modules/weighing/queries"),
    import("../../src/modules/weighing/service"),
    import("../../src/modules/inventory/queries"),
    import("../../src/modules/catalog/queries"),
  ]);
  const actor = (id: string, role: Actor["roles"][number]["role"], zone: string | null): Actor => ({ userId: id, email: "x@x.test", displayName: role, roles: [{ role, zoneId: zone }] });
  admin = actor(db.ids.admin, "administrador", null);
  operator = actor(db.ids.operator, "operador", db.ids.zoneCowork);
  reader = actor(db.ids.reader, "lector", null);

  ref = {
    cowork1: await registerAs(db, db.ids.operator, { code: "DEMO-Z01-EST01-CARTON", gross: 4250, tare: 350, occurredAt: new Date("2026-11-10T15:00:00Z"), notes: "primero" }),
    cowork2: await registerAs(db, db.ids.admin, { code: "DEMO-Z01-EST01-PET", gross: 1500, tare: 350, occurredAt: new Date("2026-11-12T03:30:00Z") }), // 12-nov 00:30 en Santiago (UTC-3)... = 11-nov 23:30? ver abajo
    lab1: await registerAs(db, db.ids.admin, { code: "DEMO-Z02-EST01-ALUMINIO", gross: 900, tare: 500, occurredAt: new Date("2026-11-14T15:00:00Z") }),
  };
});
afterAll(async () => {
  const { getPool } = await import("../../src/lib/db");
  await getPool().end();
  await db.drop();
});

describe("registerWeighing (servicio)", () => {
  it("devuelve ids y referencias legibles; reintento con la misma clave es duplicado", async () => {
    const input = { containerCode: "DEMO-Z01-EST01-CARTON", grossG: 6400, tareG: 1200, occurredAt: null, notes: null, contaminationObserved: false, idempotencyKey: crypto.randomUUID() };
    const a = await s.registerWeighing(operator, input);
    const b = await s.registerWeighing(operator, input);
    expect(a.netG).toBe(5200);
    expect(a.duplicate).toBe(false);
    expect(b).toMatchObject({ duplicate: true, weighingId: a.weighingId, batchId: a.batchId });
    expect(a.weighingRef).toBeGreaterThan(0);
  });

  it("lector → forbidden (permiso de aplicación) y operador fuera de zona → forbidden (BD)", async () => {
    const input = { containerCode: "DEMO-Z01-EST01-CARTON", grossG: 100, tareG: 10, occurredAt: null, notes: null, contaminationObserved: false, idempotencyKey: crypto.randomUUID() };
    await expect(s.registerWeighing(reader, input)).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(s.registerWeighing(operator, { ...input, containerCode: "DEMO-Z02-EST01-ALUMINIO" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("errores de validación llegan como DomainError con mensaje en español", async () => {
    const input = { containerCode: "DEMO-Z01-EST01-CARTON", grossG: 100, tareG: 200, occurredAt: null, notes: null, contaminationObserved: false, idempotencyKey: crypto.randomUUID() };
    const err = await s.registerWeighing(operator, input).catch((e) => e);
    expect(err).toMatchObject({ code: "tare_not_less_than_gross", status: 422 });
    expect(err.userMessage).toMatch(/tara/i);
  });
});

describe("listWeighings: filtros, ámbito y paginación", () => {
  it("el administrador ve todo; el operador de Cowork no ve el Laboratorio", async () => {
    const all = await q.listWeighings(admin, {});
    const op = await q.listWeighings(operator, {});
    expect(all.rows.map((r) => r.id)).toContain(ref.lab1.o_weighing_id);
    expect(op.rows.map((r) => r.id)).not.toContain(ref.lab1.o_weighing_id);
    expect(op.total).toBeLessThan(all.total);
    expect(op.rows.every((r) => r.zoneName === "Cowork DEMO")).toBe(true);
  });

  it("orden descendente por fecha del pesaje y datos completos (neto en gramos, referencias, demo)", async () => {
    const { rows } = await q.listWeighings(admin, {});
    const times = rows.map((r) => r.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const first = rows.find((r) => r.id === ref.cowork1.o_weighing_id)!;
    expect(first).toMatchObject({ grossG: 4250, tareG: 350, netG: 3900, notes: "primero", dataOrigin: "demo", containerCode: "DEMO-Z01-EST01-CARTON", batchRef: ref.cowork1.o_batch_ref });
    expect(first.createdByName).toContain("Operador");
  });

  it("filtro de fechas en hora de Santiago: límites inclusivo/exclusivo por día local", async () => {
    // cowork2 ocurrió 2026-11-12T03:30Z = 2026-11-12 00:30 (UTC-3) → pertenece al día local 12-nov
    const day12 = await q.listWeighings(admin, { from: "2026-11-12", to: "2026-11-12" });
    expect(day12.rows.map((r) => r.id)).toEqual([ref.cowork2.o_weighing_id]);
    const day11 = await q.listWeighings(admin, { from: "2026-11-11", to: "2026-11-11" });
    expect(day11.rows.map((r) => r.id)).not.toContain(ref.cowork2.o_weighing_id);
    const range = await q.listWeighings(admin, { from: "2026-11-10", to: "2026-11-12" });
    expect(range.rows.map((r) => r.id).sort()).toEqual([ref.cowork1.o_weighing_id, ref.cowork2.o_weighing_id].sort());
  });

  it("filtra por material, zona (incluye hijas), usuario y referencia (P-, L-, contenedor)", async () => {
    const pet = (await db.admin.query("select id from hc.materials where code='PET'")).rows[0].id;
    expect((await q.listWeighings(admin, { materialId: pet })).rows.map((r) => r.id)).toEqual([ref.cowork2.o_weighing_id]);
    const lab = await q.listWeighings(admin, { zoneId: db.ids.zoneLab });
    expect(lab.rows.map((r) => r.id)).toContain(ref.lab1.o_weighing_id);
    expect(lab.rows.every((r) => r.zoneName === "Laboratorio DEMO")).toBe(true);
    const byUser = await q.listWeighings(admin, { userId: db.ids.operator });
    expect(byUser.rows.every((r) => r.createdByName?.includes("Operador"))).toBe(true);
    expect((await q.listWeighings(admin, { ref: `P-${ref.cowork1.o_weighing_ref}` })).rows.map((r) => r.id)).toEqual([ref.cowork1.o_weighing_id]);
    expect((await q.listWeighings(admin, { ref: `L-${ref.lab1.o_batch_ref}` })).rows.map((r) => r.id)).toEqual([ref.lab1.o_weighing_id]);
    expect((await q.listWeighings(admin, { ref: "z02-est01" })).rows.map((r) => r.id)).toContain(ref.lab1.o_weighing_id);
  });

  it("entradas maliciosas en filtros no rompen ni inyectan SQL", async () => {
    for (const ref of ["'; drop table hc.weighings; --", "%", "_", "\\"]) {
      await expect(q.listWeighings(admin, { ref })).resolves.toBeDefined();
    }
    await expect(q.listWeighings(admin, { materialId: "no-uuid' or '1'='1", zoneId: "x", userId: "y", from: "zzz" })).resolves.toBeDefined();
    expect((await db.admin.query("select count(*)::int n from hc.weighings")).rows[0].n).toBeGreaterThan(0);
  });

  it("pagina de a 25 y el total es consistente", async () => {
    for (let i = 0; i < 30; i++) await registerAs(db, db.ids.admin, { gross: 1000 + i, tare: 100 });
    const p1 = await q.listWeighings(admin, { page: 1 });
    const p2 = await q.listWeighings(admin, { page: 2 });
    expect(p1.rows).toHaveLength(25);
    expect(p2.rows.length).toBeGreaterThan(0);
    expect(p1.total).toBe(Number((await db.admin.query("select count(*) from hc.weighings")).rows[0].count));
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(p1.rows.length + p2.rows.length);
  });

  it("getWeighing respeta el ámbito (el operador no puede abrir un pesaje del Laboratorio)", async () => {
    expect(await q.getWeighing(admin, ref.lab1.o_weighing_id)).not.toBeNull();
    expect(await q.getWeighing(operator, ref.lab1.o_weighing_id)).toBeNull();
    expect(await q.getWeighing(admin, "no-es-uuid")).toBeNull();
  });
});

describe("lote y saldo", () => {
  it("el lote nace con saldo = neto, en la zona de origen, con referencia al pesaje", async () => {
    const b = await inv.getBatchDetail(admin, ref.cowork1.o_batch_id);
    expect(b).toMatchObject({ initialG: 3900, totalBalanceG: 3900, dataOrigin: "demo", weighingRef: ref.cowork1.o_weighing_ref, originZoneName: "Cowork DEMO" });
    expect(b?.balances).toEqual([{ zoneId: db.ids.zoneCowork, zoneName: "Cowork DEMO", balanceG: 3900 }]);
  });
  it("el operador de Cowork no ve el lote del Laboratorio", async () => {
    expect(await inv.getBatchDetail(operator, ref.lab1.o_batch_id)).toBeNull();
    expect(await inv.getBatchDetail(operator, "x")).toBeNull();
  });
});

describe("catálogo visible", () => {
  it("lista solo contenedores utilizables en el ámbito del actor", async () => {
    const op = await cat.listContainers(operator, { onlyUsable: true });
    expect(op.map((c) => c.code).sort()).toEqual(["DEMO-Z01-EST01-CARTON", "DEMO-Z01-EST01-PET"]);
    expect(op.every((c) => c.dataOrigin === "demo")).toBe(true);
    const all = await cat.listContainers(admin);
    expect(all).toHaveLength(3);
    const tare = all.find((c) => c.code === "DEMO-Z01-EST01-CARTON")!.tareG;
    expect(tare).toBe(1200);
  });
  it("opciones de filtro respetan el ámbito", async () => {
    const o = await cat.loadFilterOptions(operator);
    expect(o.zones.map((z) => z.name)).toEqual(["Cowork DEMO"]);
    expect(o.materials.length).toBe(4);
    void PASSWORDS;
  });
});
