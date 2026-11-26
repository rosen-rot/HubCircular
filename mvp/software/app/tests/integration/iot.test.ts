import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashDeviceToken, newDeviceToken, normalizeReading, readingSchema } from "../../src/modules/iot/schema";
import { counts, createTestDb, type TestDb } from "../helpers/db";

// Iteración 4 (docs/04 v1, docs/27): ingesta de lecturas del ESP32 / simulador.
let db: TestDb;
const CARTON = "DEMO-Z01-EST01-CARTON";
const LAB = "DEMO-Z02-EST01-ALUMINIO";
const tokens = { sensor: newDeviceToken(), sim: newDeviceToken(), off: newDeviceToken(), lab: newDeviceToken() };

async function addDevice(code: string, container: string, kind: "sensor" | "simulator", token: string, active = true) {
  await db.admin.query(
    "insert into hc.devices (code, container_id, kind, token_hash, active) select $1, id, $3, $4, $5 from hc.containers where code = $2",
    [code, container, kind, hashDeviceToken(token), active],
  );
}

function payload(over: Record<string, unknown> = {}) {
  return readingSchema.parse({
    schemaVersion: 1,
    deviceId: "HUB-ESP32-001",
    messageId: randomUUID(),
    weightGrams: 7340,
    distanceMm: 180,
    fillPercent: 55,
    quality: "stable",
    rssiDbm: -61,
    firmwareVersion: "1.0.0",
    ...over,
  });
}

/** Llama a la función como lo hace la aplicación: rol hc_app, SIN actor humano. */
async function ingest(token: string, p: ReturnType<typeof payload>) {
  const n = normalizeReading(p);
  return db.asActor(null, async (c) => {
    const r = await c.query("select * from hc.iot_ingest_reading($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [
      hashDeviceToken(token), n.deviceCode, n.messageId, n.measuredAt, n.weightG, n.distanceMm, n.fillPercent, n.quality, n.rssiDbm, n.firmwareVersion, n.payloadHash,
    ]);
    return r.rows[0] as { o_reading_id: string; o_duplicate: boolean; o_simulated: boolean };
  });
}

beforeAll(async () => {
  db = await createTestDb();
  await addDevice("HUB-ESP32-001", CARTON, "sensor", tokens.sensor);
  await addDevice("HUB-SIM-001", CARTON, "simulator", tokens.sim);
  await addDevice("HUB-OFF-001", CARTON, "sensor", tokens.off, false);
  await addDevice("HUB-LAB-001", LAB, "sensor", tokens.lab);
});
afterAll(async () => { await db.drop(); });

describe("ingesta IoT: hc.iot_ingest_reading", () => {
  it("guarda la lectura con el contenedor del dispositivo y actualiza last_seen_at, sin crear pesajes ni lotes", async () => {
    const before = await counts(db);
    const p = payload();
    const r = await ingest(tokens.sensor, p);
    expect(r.o_duplicate).toBe(false);
    expect(r.o_simulated).toBe(false);
    const row = (await db.admin.query("select r.*, c.code from hc.sensor_readings r join hc.containers c on c.id = r.container_id where r.id = $1", [r.o_reading_id])).rows[0];
    expect(row).toMatchObject({ code: CARTON, weight_g: 7340, distance_mm: 180, quality: "stable", rssi_dbm: -61, simulated: false });
    expect(Number(row.fill_percent)).toBe(55);
    const d = (await db.admin.query("select last_seen_at from hc.devices where code = 'HUB-ESP32-001'")).rows[0];
    expect(d.last_seen_at).not.toBeNull();
    expect(await counts(db)).toEqual(before); // la telemetría NUNCA crea captaciones
  });

  it("es idempotente: el mismo messageId con el mismo contenido no se inserta dos veces", async () => {
    const p = payload();
    const a = await ingest(tokens.sensor, p);
    const b = await ingest(tokens.sensor, p);
    expect(b).toMatchObject({ o_reading_id: a.o_reading_id, o_duplicate: true });
    const n = (await db.admin.query("select count(*)::int as n from hc.sensor_readings where message_id = $1", [p.messageId])).rows[0].n;
    expect(n).toBe(1);
  });

  it("rechaza el mismo messageId con contenido distinto (409)", async () => {
    const p = payload();
    await ingest(tokens.sensor, p);
    await expect(ingest(tokens.sensor, { ...p, weightGrams: 9999 })).rejects.toMatchObject({ code: "HC409", message: "reading_conflict" });
  });

  it("rechaza token desconocido (401), dispositivo inactivo (403) y deviceId que no corresponde al token (403)", async () => {
    await expect(ingest(newDeviceToken(), payload())).rejects.toMatchObject({ code: "HC401", message: "device_unauthenticated" });
    await expect(ingest(tokens.off, payload({ deviceId: "HUB-OFF-001" }))).rejects.toMatchObject({ code: "HC403", message: "device_inactive" });
    await expect(ingest(tokens.sensor, payload({ deviceId: "HUB-SIM-001" }))).rejects.toMatchObject({ code: "HC403", message: "device_mismatch" });
  });

  it("marca como simuladas las lecturas de un dispositivo simulator (lo decide el registro, no el mensaje)", async () => {
    const r = await ingest(tokens.sim, payload({ deviceId: "hub-sim-001" }));
    expect(r.o_simulated).toBe(true);
  });

  it("registra sensor_error sin inventar un peso y descarta un measuredAt imposible", async () => {
    const r = await ingest(tokens.sensor, payload({ weightGrams: null, quality: "sensor_error", measuredAt: "2030-01-01T00:00:00Z" }));
    const row = (await db.admin.query("select weight_g, measured_at, received_at from hc.sensor_readings where id = $1", [r.o_reading_id])).rows[0];
    expect(row.weight_g).toBeNull();
    expect(row.measured_at).toBeNull();
    expect(row.received_at).not.toBeNull();
  });

  it("las lecturas son inmutables", async () => {
    const r = await ingest(tokens.sensor, payload());
    await expect(db.admin.query("update hc.sensor_readings set weight_g = 1 where id = $1", [r.o_reading_id])).rejects.toThrow();
    await expect(db.admin.query("delete from hc.sensor_readings where id = $1", [r.o_reading_id])).rejects.toThrow();
  });

  it("aplica la cuota por dispositivo (60 lecturas por minuto)", async () => {
    const t = newDeviceToken();
    await addDevice("HUB-RATE-001", CARTON, "simulator", t);
    for (let i = 0; i < 60; i++) await ingest(t, payload({ deviceId: "HUB-RATE-001" }));
    await expect(ingest(t, payload({ deviceId: "HUB-RATE-001" }))).rejects.toMatchObject({ code: "HC429", message: "rate_limited" });
  });
});

describe("privilegios y RLS de IoT", () => {
  it("hc_app no puede leer token_hash ni escribir directamente", async () => {
    await expect(db.asActor(db.ids.admin, (c) => c.query("select token_hash from hc.devices"))).rejects.toThrow(/permission denied/);
    await expect(
      db.asActor(db.ids.admin, (c) => c.query("insert into hc.sensor_readings (device_id, container_id, simulated, message_id, quality, payload_hash) select id, container_id, false, gen_random_uuid(), 'stable', repeat('a',64) from hc.devices limit 1")),
    ).rejects.toThrow(/permission denied/);
  });

  it("cada usuario ve solo los dispositivos y lecturas de contenedores de su ámbito", async () => {
    await ingest(tokens.lab, payload({ deviceId: "HUB-LAB-001" }));
    const seen = async (actor: string) =>
      db.asActor(actor, async (c) => ({
        devices: (await c.query("select code from hc.devices order by code")).rows.map((r) => r.code as string),
        labReadings: (await c.query("select count(*)::int as n from hc.sensor_readings r join hc.devices d on d.id = r.device_id where d.code = 'HUB-LAB-001'")).rows[0].n as number,
      }));
    const admin = await seen(db.ids.admin);
    expect(admin.devices).toContain("HUB-LAB-001");
    expect(admin.labReadings).toBeGreaterThan(0);
    const operator = await seen(db.ids.operator); // operador DEMO con ámbito en Cowork
    expect(operator.devices).toContain("HUB-ESP32-001");
    expect(operator.devices).not.toContain("HUB-LAB-001");
    expect(operator.labReadings).toBe(0);
    const anonymous = await seen(null as unknown as string);
    expect(anonymous.devices).toEqual([]);
  });
});
