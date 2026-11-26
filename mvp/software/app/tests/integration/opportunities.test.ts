import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { counts, createTestDb, registerAs, type TestDb } from "../helpers/db";
import { addDays, santiagoToday } from "../../src/lib/time";
import type { Actor } from "../../src/modules/identity/types";

/**
 * Iteración 5 · reglas de oportunidad contra PostgreSQL local con datos registrados por las funciones reales:
 * casos detectados, DEMO y real separados, ámbito por zona y solo lectura.
 */
let db: TestDb;
let admin: Actor, operator: Actor;
let q: typeof import("../../src/modules/opportunities/queries");
const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  q = await import("../../src/modules/opportunities/queries");
  const actor = (id: string, role: Actor["roles"][number]["role"], zone: string | null): Actor => ({ userId: id, email: "x@x.test", displayName: role, roles: [{ role, zoneId: zone }] });
  admin = actor(db.ids.admin, "administrador", null);
  operator = actor(db.ids.operator, "operador", db.ids.zoneCowork);

  // Acumulación DEMO en Cowork: 3 × 9 kg de cartón, el más antiguo hace 20 días.
  for (const d of [20, 10, 3]) await registerAs(db, db.ids.admin, { code: "DEMO-Z01-EST01-CARTON", gross: 9350, tare: 350, occurredAt: ago(d) });
  // Acumulación DEMO en Laboratorio (fuera del ámbito del operador): 25 kg hace 30 días.
  await registerAs(db, db.ids.admin, { code: "DEMO-Z02-EST01-ALUMINIO", gross: 25500, tare: 500, occurredAt: ago(30) });
  // PET DEMO: poco y reciente → sin caso.
  await registerAs(db, db.ids.admin, { code: "DEMO-Z01-EST01-PET", gross: 2350, tare: 350, occurredAt: ago(2) });

  // Mediciones omitidas DEMO: calendario diario del PET desde hace 13 días, con un solo pesaje (hace 2 días).
  const pet = (await db.admin.query("select id from hc.containers where code = 'DEMO-Z01-EST01-PET'")).rows[0].id;
  const today = santiagoToday();
  await db.admin.query(
    "insert into hc.measurement_schedules (container_id, weekdays, start_on, created_by, data_origin) values ($1, '{1,2,3,4,5,6,7}', $2, $3, 'demo')",
    [pet, addDays(today, -13), db.ids.admin],
  );

  // Contaminación REAL en Cowork: contenedor real con 10 pesajes, 4 contaminados (40 %).
  await db.admin.query(
    "insert into hc.containers (station_id, material_id, code, data_origin) select station_id, material_id, 'REAL-OPP-01', 'real' from hc.containers where code = 'DEMO-Z01-EST01-CARTON'",
  );
  for (let i = 0; i < 10; i++) await registerAs(db, db.ids.admin, { code: "REAL-OPP-01", gross: 1350, tare: 350, occurredAt: ago(i + 1), contamination: i < 4 });
});

afterAll(async () => {
  const g = globalThis as unknown as { __hcPool?: Pool };
  await g.__hcPool?.end().catch(() => undefined);
  delete g.__hcPool;
  await db.drop();
});

const byRule = (r: Awaited<ReturnType<typeof q.getOpportunities>>) => Object.fromEntries(r.results.map((x) => [x.rule.id, x.cases]));

describe("oportunidades de mejora", () => {
  it("DEMO: detecta acumulación (Cowork y Laboratorio) y mediciones omitidas; no hay contaminación DEMO", async () => {
    const r = byRule(await q.getOpportunities(admin, "demo"));
    expect(r.acumulacion!.map((c) => c.scope).sort()).toEqual(["Cartón y papel (demo) · Cowork DEMO", "Latas de aluminio (demo) · Laboratorio DEMO"]);
    const carton = r.acumulacion!.find((c) => c.scope.startsWith("Cartón"))!;
    expect(carton.finding).toBe("27,0 kg en inventario en 3 lotes; el más antiguo lleva 20 días.");
    expect(carton.evidence.every((e) => e.href?.startsWith("/lotes/"))).toBe(true);
    expect(r.omitidas).toHaveLength(1);
    expect(r.omitidas![0]!.scope).toContain("DEMO-Z01-EST01-PET");
    expect(r.omitidas![0]!.finding).toMatch(/^12 de 13 mediciones esperadas quedaron omitidas/);
    expect(r.contaminacion).toHaveLength(0);
  });

  it("REAL: solo ve lo real (contaminación del contenedor real), nada de lo DEMO", async () => {
    const report = await q.getOpportunities(admin, "real");
    const r = byRule(report);
    expect(r.contaminacion).toHaveLength(1);
    expect(r.contaminacion![0]!.finding).toBe("4 de 10 pesajes con contaminación observada (40 %).");
    expect(r.contaminacion![0]!.evidence).toHaveLength(4);
    expect(r.acumulacion).toHaveLength(0); // 10 kg reales recientes: bajo el umbral
    expect(r.omitidas).toHaveLength(0);
    expect(JSON.stringify(report)).not.toContain("DEMO-Z01");
  });

  it("ámbito: el operador de Cowork no ve el caso del Laboratorio", async () => {
    const r = byRule(await q.getOpportunities(operator, "demo"));
    expect(r.acumulacion!.map((c) => c.scope)).toEqual(["Cartón y papel (demo) · Cowork DEMO"]);
  });

  it("es solo lectura: evaluar no crea ni cambia registros", async () => {
    const before = await counts(db);
    await q.getOpportunities(admin, "demo");
    await q.getOpportunities(admin, "real");
    expect(await counts(db)).toEqual(before);
  });
});
