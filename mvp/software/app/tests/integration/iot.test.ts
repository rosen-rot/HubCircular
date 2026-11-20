import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createTestDb, type TestDb } from "../helpers/db";
import { hashDeviceToken, newDeviceToken, deviceTokenPrefix } from "../../src/modules/devices/token";
import type { Actor } from "../../src/modules/identity/types";

/**
 * Iteración 4 · ingesta IoT. Se prueba (1) la BD con hc_app, (2) el servicio de dispositivos y (3) el endpoint
 * POST /api/iot/v1/readings invocado directamente. Todo contra PostgreSQL local; nada toca Supabase.
 */
let db: TestDb;
let cartonId: string; // contenedor DEMO en Cowork
let aluminioId: string; // contenedor DEMO en Laboratorio
let realContainerId: string; // contenedor REAL (solo para probar la regla simulador↔DEMO)
let admin: Actor, operator: Actor;
let svc: typeof import("../../src/modules/devices/service");
let ing: typeof import("../../src/modules/devices/ingest");
let q: typeof import("../../src/modules/devices/queries");
let route: typeof import("../../src/app/api/iot/v1/readings/route");

const expectErr = (p: Promise<unknown>, message: string, sqlstate?: string) =>
  expect(p).rejects.toMatchObject({ message, ...(sqlstate ? { code: sqlstate } : {}) });

const reading = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  deviceId: "HUB-ESP32-001",
  messageId: crypto.randomUUID(),
  measuredAt: new Date().toISOString(),
  weightGrams: 4250,
  distanceMm: 180,
  fillPercent: 65.0,
  quality: "stable",
  firmwareVersion: "0.1.0",
  ...over,
});

/** Llama a la función de BD como lo hace la app (rol hc_app, sin actor). */
const dbIngest = async (token: string, r: ReturnType<typeof reading>) => {
  const c = await db.appClient();
  try {
    await c.query("begin");
    const res = await c.query("select * from hc.iot_ingest_reading($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
      hashDeviceToken(token), r.deviceId, r.messageId, r.schemaVersion, r.measuredAt, r.weightGrams, r.distanceMm, r.fillPercent, r.quality, r.firmwareVersion,
    ]);
    await c.query("commit");
    return res.rows[0] as { o_reading_id: string; o_duplicate: boolean };
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
};

async function mkDevice(code: string, containerId: string, stale = 15) {
  const { deviceId, token } = await svc.createDevice(admin, { code, name: `Sensor ${code}`, containerId, staleAfterMinutes: stale });
  return { deviceId, token };
}

const post = (token: string | null, body: unknown, headers: Record<string, string> = {}) =>
  route.POST(
    new NextRequest("http://localhost/api/iot/v1/readings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const businessCounts = async () => {
  const r = await db.admin.query(
    "select (select count(*) from hc.weighings)::int w, (select count(*) from hc.batches)::int b, (select count(*) from hc.movements)::int m, (select count(*) from hc.batch_location_balances)::int bl",
  );
  return r.rows[0] as { w: number; b: number; m: number; bl: number };
};

let main: { deviceId: string; token: string };

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  [svc, ing, q, route] = await Promise.all([
    import("../../src/modules/devices/service"),
    import("../../src/modules/devices/ingest"),
    import("../../src/modules/devices/queries"),
    import("../../src/app/api/iot/v1/readings/route"),
  ]);
  const actor = (id: string, role: Actor["roles"][number]["role"], zone: string | null): Actor => ({ userId: id, email: "x@x.test", displayName: role, roles: [{ role, zoneId: zone }] });
  admin = actor(db.ids.admin, "administrador", null);
  operator = actor(db.ids.operator, "operador", db.ids.zoneCowork);
  cartonId = (await db.admin.query("select id from hc.containers where code = 'DEMO-Z01-EST01-CARTON'")).rows[0].id;
  aluminioId = (await db.admin.query("select id from hc.containers where code = 'DEMO-Z02-EST01-ALUMINIO'")).rows[0].id;
  realContainerId = (
    await db.admin.query(
      "insert into hc.containers (station_id, material_id, code, data_origin) select station_id, material_id, 'REAL-IOT-TEST', 'real' from hc.containers where id = $1 returning id",
      [cartonId],
    )
  ).rows[0].id;
  main = await mkDevice("HUB-ESP32-001", cartonId);
});

afterAll(async () => {
  const g = globalThis as unknown as { __hcPool?: Pool };
  await g.__hcPool?.end().catch(() => undefined);
  delete g.__hcPool;
  await db.drop();
});

describe("alta, rotación y revocación (solo administrador)", () => {
  it("el token se entrega una vez y la BD solo guarda su hash; el dispositivo hereda el origen del contenedor; queda auditado sin secretos", async () => {
    const d = await db.admin.query("select token_hash, token_prefix, data_origin, device_code from hc.devices where id = $1", [main.deviceId]);
    expect(main.token).toMatch(/^hcd_[A-Za-z0-9_-]{43}$/);
    expect(d.rows[0]).toMatchObject({ token_hash: hashDeviceToken(main.token), token_prefix: deviceTokenPrefix(main.token), data_origin: "demo", device_code: "HUB-ESP32-001" });
    expect(JSON.stringify(d.rows[0])).not.toContain(main.token);
    const a = await db.admin.query("select actor_id, new_summary from hc.audit_logs where entity = 'device' and entity_id = $1 and action = 'create'", [main.deviceId]);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].actor_id).toBe(db.ids.admin);
    expect(JSON.stringify(a.rows[0].new_summary)).not.toContain(main.token);
    expect(JSON.stringify(a.rows[0].new_summary)).not.toContain(hashDeviceToken(main.token));
  });

  it("operador y lector no pueden gestionar dispositivos (permiso y BD)", async () => {
    await expect(svc.createDevice(operator, { code: "HUB-OP-1", name: "x", containerId: cartonId, staleAfterMinutes: 15 })).rejects.toMatchObject({ code: "forbidden" });
    await expectErr(
      db.asActor(db.ids.operator, async (c) => c.query("select * from hc.admin_create_device($1,'HUB-OP-1','x',$2,$3,'hcd_abcd',15)", [db.ids.operator, cartonId, "a".repeat(64)])),
      "forbidden", "HC403",
    );
    await expectErr(
      db.asActor(db.ids.reader, async (c) => c.query("select hc.admin_revoke_device($1,$2)", [db.ids.reader, main.deviceId])),
      "forbidden", "HC403",
    );
  });

  it("rechaza código duplicado, formato inválido y contenedor inexistente o inactivo", async () => {
    await expect(svc.createDevice(admin, { code: "hub-esp32-001", name: "otro", containerId: cartonId, staleAfterMinutes: 15 })).rejects.toMatchObject({ code: "device_exists", status: 409 });
    await expect(svc.createDevice(admin, { code: "x y", name: "otro", containerId: cartonId, staleAfterMinutes: 15 })).rejects.toMatchObject({ code: "device_invalid" });
    await expect(svc.createDevice(admin, { code: "HUB-X-2", name: "otro", containerId: cartonId, staleAfterMinutes: 0 })).rejects.toMatchObject({ code: "device_invalid" });
    await expect(svc.createDevice(admin, { code: "HUB-X-3", name: "otro", containerId: crypto.randomUUID(), staleAfterMinutes: 15 })).rejects.toMatchObject({ code: "container_not_found" });
    const inactive = (await db.admin.query("insert into hc.containers (station_id, material_id, code, data_origin, active) select station_id, material_id, 'DEMO-INACTIVO-IOT', 'demo', false from hc.containers where id = $1 returning id", [cartonId])).rows[0].id;
    await expect(svc.createDevice(admin, { code: "HUB-X-4", name: "otro", containerId: inactive, staleAfterMinutes: 15 })).rejects.toMatchObject({ code: "container_inactive" });
  });

  it("rotar invalida el token anterior; revocar bloquea (403); rotar un revocado lo reactiva", async () => {
    const dev = await mkDevice("HUB-ROT-001", cartonId);
    await dbIngest(dev.token, reading({ deviceId: "HUB-ROT-001" }));
    const { token: t2 } = await svc.rotateDeviceToken(admin, dev.deviceId);
    expect(t2).not.toBe(dev.token);
    await expectErr(dbIngest(dev.token, reading({ deviceId: "HUB-ROT-001" })), "device_token_invalid", "HC401");
    await dbIngest(t2, reading({ deviceId: "HUB-ROT-001" }));
    await svc.revokeDevice(admin, dev.deviceId);
    await svc.revokeDevice(admin, dev.deviceId); // idempotente
    await expectErr(dbIngest(t2, reading({ deviceId: "HUB-ROT-001" })), "device_revoked", "HC403");
    const revokes = await db.admin.query("select count(*)::int n from hc.audit_logs where entity = 'device' and entity_id = $1 and action = 'revoke'", [dev.deviceId]);
    expect(revokes.rows[0].n).toBe(1);
    const { token: t3 } = await svc.rotateDeviceToken(admin, dev.deviceId);
    await dbIngest(t3, reading({ deviceId: "HUB-ROT-001" }));
    await expect(svc.rotateDeviceToken(admin, crypto.randomUUID())).rejects.toMatchObject({ code: "device_not_found" });
  });
});

describe("privilegios y RLS", () => {
  it("hc_app no puede leer el hash del token ni escribir directamente en dispositivos o lecturas", async () => {
    const c = await db.appClient();
    try {
      await expect(c.query("select token_hash from hc.devices")).rejects.toMatchObject({ code: "42501" });
      await expect(c.query("select * from hc.devices")).rejects.toMatchObject({ code: "42501" });
      await expect(c.query("insert into hc.sensor_readings (device_id, container_id, message_id, schema_version, measured_at, clock_ok, effective_at, quality, data_origin) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, now(), true, now(), 'stable', 'demo')")).rejects.toMatchObject({ code: "42501" });
      await expect(c.query("update hc.devices set revoked_at = null")).rejects.toMatchObject({ code: "42501" });
      await expect(c.query("delete from hc.devices")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await c.end();
    }
  });

  it("las lecturas son de solo anexado y los dispositivos no se borran", async () => {
    await dbIngest(main.token, reading());
    await expectErr(db.admin.query("update hc.sensor_readings set weight_g = 1"), "immutable_record", "HC423");
    await expectErr(db.admin.query("delete from hc.sensor_readings"), "immutable_record", "HC423");
    // TRUNCATE suelto lo frena PostgreSQL por la FK; en conjunto o en cascada lo frena el trigger de solo anexado.
    await expect(db.admin.query("truncate hc.sensor_readings")).rejects.toBeTruthy();
    await expectErr(db.admin.query("truncate hc.sensor_readings, hc.devices"), "immutable_record", "HC423");
    await expectErr(db.admin.query("delete from hc.devices"), "immutable_record", "HC423");
  });

  it("el operador solo ve dispositivos de su zona; el administrador ve todos; el hash nunca sale en las consultas", async () => {
    const lab = await mkDevice("HUB-LAB-001", aluminioId);
    await dbIngest(lab.token, reading({ deviceId: "HUB-LAB-001" }));
    const adminList = await q.listDevices(admin);
    expect(adminList.map((d) => d.code)).toEqual(expect.arrayContaining(["HUB-ESP32-001", "HUB-LAB-001"]));
    const opList = await q.listDevices(operator);
    expect(opList.map((d) => d.code)).toContain("HUB-ESP32-001");
    expect(opList.map((d) => d.code)).not.toContain("HUB-LAB-001");
    expect(JSON.stringify(adminList)).not.toContain(hashDeviceToken(lab.token));
    const recentOp = await q.listRecentReadings(operator);
    expect(recentOp.every((r) => r.deviceCode !== "HUB-LAB-001")).toBe(true);
  });
});

describe("ingesta (BD)", () => {
  it("guarda la lectura con la hora del servidor, actualiza el último contacto y NO crea pesajes, lotes ni movimientos", async () => {
    const before = await businessCounts();
    const r = reading();
    const res = await dbIngest(main.token, r);
    expect(res.o_duplicate).toBe(false);
    const row = (await db.admin.query("select * from hc.sensor_readings where id = $1", [res.o_reading_id])).rows[0];
    expect(row).toMatchObject({ weight_g: 4250, distance_mm: 180, quality: "stable", clock_ok: true, data_origin: "demo", container_id: cartonId, firmware_version: "0.1.0" });
    expect(Number(row.fill_percent)).toBe(65);
    expect(row.received_at).toBeInstanceOf(Date);
    const dev = (await db.admin.query("select last_seen_at, last_reading_id from hc.devices where id = $1", [main.deviceId])).rows[0];
    expect(dev.last_reading_id).toBe(res.o_reading_id);
    expect(dev.last_seen_at).toBeInstanceOf(Date);
    expect(await businessCounts()).toEqual(before);
  });

  it("peso estable repetido (30 mensajes distintos) queda como 30 lecturas y no suma captación", async () => {
    const before = await businessCounts();
    const dev = await mkDevice("HUB-STABLE-1", cartonId);
    for (let i = 0; i < 30; i++) await dbIngest(dev.token, reading({ deviceId: "HUB-STABLE-1", weightGrams: 1500, measuredAt: new Date(Date.now() - (30 - i) * 10_000).toISOString() }));
    const n = (await db.admin.query("select count(*)::int n from hc.sensor_readings r join hc.devices d on d.id = r.device_id where d.device_code = 'HUB-STABLE-1'")).rows[0].n;
    expect(n).toBe(30);
    expect(await businessCounts()).toEqual(before);
    const kpi = (await db.admin.query("select * from hc.kpi_summary(current_date - 2, current_date + 1, null, null, 'demo')")).rows[0];
    expect(Number(kpi.captured_g ?? 0)).toBe(0);
  });

  it("repetición idéntica = duplicado sin segunda inserción; mismo messageId con contenido distinto = conflicto", async () => {
    const r = reading();
    const first = await dbIngest(main.token, r);
    const again = await dbIngest(main.token, { ...r });
    expect(again).toEqual({ o_reading_id: first.o_reading_id, o_duplicate: true });
    const n = (await db.admin.query("select count(*)::int n from hc.sensor_readings where message_id = $1", [r.messageId])).rows[0].n;
    expect(n).toBe(1);
    await expectErr(dbIngest(main.token, { ...r, weightGrams: 4251 }), "message_conflict", "HC409");
    await expectErr(dbIngest(main.token, { ...r, quality: "unstable" }), "message_conflict", "HC409");
    await expectErr(dbIngest(main.token, { ...r, measuredAt: new Date(Date.now() - 5000).toISOString() }), "message_conflict", "HC409");
  });

  it("mismo messageId en dispositivos distintos no colisiona", async () => {
    const other = await mkDevice("HUB-OTHER-1", cartonId);
    const id = crypto.randomUUID();
    await dbIngest(main.token, reading({ messageId: id }));
    await dbIngest(other.token, reading({ messageId: id, deviceId: "HUB-OTHER-1" }));
  });

  it("autenticación: token desconocido (401) y deviceId que no corresponde al token (403)", async () => {
    await expectErr(dbIngest(newDeviceToken(), reading()), "device_token_invalid", "HC401");
    await expectErr(dbIngest(main.token, reading({ deviceId: "HUB-LAB-001" })), "device_mismatch", "HC403");
  });

  it("rechaza fuera de rango, mal formadas y combinaciones imposibles (respaldo de la validación de la API)", async () => {
    for (const bad of [
      { fillPercent: 130 }, { fillPercent: -1 }, { weightGrams: -5 }, { weightGrams: 2_000_000 }, { distanceMm: -1 }, { distanceMm: 50_000 },
      { quality: "otra" }, { schemaVersion: 2 }, { quality: "sensor_error" }, { quality: "uncalibrated" },
    ]) {
      await expectErr(dbIngest(main.token, reading(bad)), "reading_invalid", "HC422");
    }
  });

  it("sensor_error y no calibrado guardan NULL (nunca un cero inventado)", async () => {
    const e = await dbIngest(main.token, reading({ quality: "sensor_error", weightGrams: null, distanceMm: null, fillPercent: null }));
    const u = await dbIngest(main.token, reading({ quality: "uncalibrated", weightGrams: null }));
    const rows = (await db.admin.query("select quality, weight_g, distance_mm, fill_percent from hc.sensor_readings where id = any($1)", [[e.o_reading_id, u.o_reading_id]])).rows;
    const err = rows.find((r) => r.quality === "sensor_error");
    expect(err).toEqual({ quality: "sensor_error", weight_g: null, distance_mm: null, fill_percent: null });
    expect(rows.find((r) => r.quality === "uncalibrated")!.weight_g).toBeNull();
  });

  it("reloj imposible (futuro o muy antiguo): se conserva lo informado, clock_ok=false y el momento efectivo es la hora del servidor", async () => {
    const fut = await dbIngest(main.token, reading({ measuredAt: new Date(Date.now() + 3600_000).toISOString() }));
    const old = await dbIngest(main.token, reading({ measuredAt: "1970-01-01T00:00:00Z" }));
    const ok = await dbIngest(main.token, reading({ measuredAt: new Date(Date.now() - 3600_000).toISOString() }));
    const rows = (await db.admin.query("select id, clock_ok, measured_at, received_at, effective_at from hc.sensor_readings where id = any($1)", [[fut.o_reading_id, old.o_reading_id, ok.o_reading_id]])).rows;
    const by = (id: string) => rows.find((r) => r.id === id)!;
    for (const id of [fut.o_reading_id, old.o_reading_id]) {
      expect(by(id).clock_ok).toBe(false);
      expect(by(id).effective_at.getTime()).toBe(by(id).received_at.getTime());
    }
    expect(by(old.o_reading_id).measured_at.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(by(ok.o_reading_id).clock_ok).toBe(true);
    expect(by(ok.o_reading_id).effective_at.getTime()).toBe(by(ok.o_reading_id).measured_at.getTime());
  });

  it("límite de frecuencia: 60 lecturas nuevas por minuto por dispositivo; los duplicados siguen respondiendo", async () => {
    const dev = await mkDevice("HUB-RATE-001", cartonId);
    const first = reading({ deviceId: "HUB-RATE-001" });
    for (let i = 0; i < 60; i++) await dbIngest(dev.token, i === 0 ? first : reading({ deviceId: "HUB-RATE-001" }));
    await expectErr(dbIngest(dev.token, reading({ deviceId: "HUB-RATE-001" })), "rate_limited", "HC429");
    expect((await dbIngest(dev.token, first)).o_duplicate).toBe(true);
  });

  it("lo simulado (firmware «sim-…») solo entra en dispositivos DEMO", async () => {
    const real = await mkDevice("HUB-REAL-001", realContainerId);
    expect((await db.admin.query("select data_origin from hc.devices where id = $1", [real.deviceId])).rows[0].data_origin).toBe("real");
    await expectErr(dbIngest(real.token, reading({ deviceId: "HUB-REAL-001", firmwareVersion: "sim-0.1" })), "simulation_not_allowed", "HC403");
    await dbIngest(real.token, reading({ deviceId: "HUB-REAL-001", firmwareVersion: "0.1.0" }));
    await dbIngest(main.token, reading({ firmwareVersion: "sim-0.1" }));
  });
});

describe("endpoint POST /api/iot/v1/readings", () => {
  it("202 con readingId; repetir devuelve 202 con duplicate:true; no usa cookie de sesión", async () => {
    const body = reading();
    const a = await post(main.token, body);
    expect(a.status).toBe(202);
    const ja = await a.json();
    expect(ja).toMatchObject({ accepted: true, duplicate: false });
    expect(ja.readingId).toMatch(/^[0-9a-f-]{36}$/);
    const b = await post(main.token, body, { "idempotency-key": body.messageId });
    expect(b.status).toBe(202);
    expect(await b.json()).toEqual({ accepted: true, readingId: ja.readingId, duplicate: true });
    expect(a.headers.get("cache-control")).toBe("no-store");
  });

  it("409 si el mismo messageId llega con contenido distinto", async () => {
    const body = reading();
    expect((await post(main.token, body)).status).toBe(202);
    const r = await post(main.token, { ...body, weightGrams: 9999 });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("message_conflict");
  });

  it("401 sin Authorization, con esquema distinto de Bearer, con forma inválida o con token desconocido", async () => {
    for (const t of [null, "no-es-un-token", newDeviceToken()]) {
      const r = await post(t, reading());
      expect(r.status).toBe(401);
      expect((await r.json()).error.code).toBe("device_token_invalid");
    }
    const basic = await route.POST(new NextRequest("http://localhost/api/iot/v1/readings", { method: "POST", headers: { "content-type": "application/json", authorization: `Basic ${main.token}` }, body: JSON.stringify(reading()) }));
    expect(basic.status).toBe(401);
    expect(basic.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("403 con dispositivo revocado y con deviceId ajeno al token", async () => {
    const dev = await mkDevice("HUB-API-REV", cartonId);
    expect((await post(dev.token, reading({ deviceId: "HUB-API-REV" }))).status).toBe(202);
    await svc.revokeDevice(admin, dev.deviceId);
    const r = await post(dev.token, reading({ deviceId: "HUB-API-REV" }));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("device_revoked");
    const mm = await post(main.token, reading({ deviceId: "HUB-API-REV" }));
    expect(mm.status).toBe(403);
    expect((await mm.json()).error.code).toBe("device_mismatch");
  });

  it("400 por datos fuera de rango, campos desconocidos, tipos erróneos, JSON inválido y Idempotency-Key distinto del messageId", async () => {
    const cases: unknown[] = [
      reading({ fillPercent: 130 }),
      reading({ fillPercent: "65" }),
      reading({ weightGrams: -10 }),
      reading({ weightGrams: 12.5 }),
      reading({ messageId: "no-uuid" }),
      reading({ measuredAt: "ayer" }),
      reading({ quality: "otra" }),
      reading({ schemaVersion: 2 }),
      reading({ extra: 1 }),
      reading({ quality: "sensor_error" }),
      "{no es json",
    ];
    for (const c of cases) {
      const r = await post(main.token, c);
      expect(r.status, JSON.stringify(c)).toBe(400);
      expect((await r.json()).error.code).toBe("reading_invalid");
    }
    const k = await post(main.token, reading(), { "idempotency-key": crypto.randomUUID() });
    expect(k.status).toBe(400);
  });

  it("sensor_error con valores null se acepta (no se inventa un cero)", async () => {
    const r = await post(main.token, reading({ quality: "sensor_error", weightGrams: null, distanceMm: null, fillPercent: null }));
    expect(r.status).toBe(202);
  });

  it("413 por cuerpo grande y 415 por Content-Type incorrecto", async () => {
    const big = await post(main.token, reading({ firmwareVersion: "x".repeat(5000) }));
    expect(big.status).toBe(413);
    const txt = await route.POST(new NextRequest("http://localhost/api/iot/v1/readings", { method: "POST", headers: { "content-type": "text/plain", authorization: `Bearer ${main.token}` }, body: JSON.stringify(reading()) }));
    expect(txt.status).toBe(415);
  });

  it("429 al superar la frecuencia, con Retry-After", async () => {
    const dev = await mkDevice("HUB-API-RATE", cartonId);
    for (let i = 0; i < 60; i++) expect((await post(dev.token, reading({ deviceId: "HUB-API-RATE" }))).status).toBe(202);
    const r = await post(dev.token, reading({ deviceId: "HUB-API-RATE" }));
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
  });

  it("403 para firmware de simulador en un dispositivo real", async () => {
    const real = await mkDevice("HUB-API-REAL", realContainerId);
    const r = await post(real.token, reading({ deviceId: "HUB-API-REAL", firmwareVersion: "sim-0.1" }));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("simulation_not_allowed");
  });

  it("los errores no revelan el token ni el hash", async () => {
    const r = await post(main.token, reading({ fillPercent: 130 }));
    const text = JSON.stringify(await r.json());
    expect(text).not.toContain(main.token);
    expect(text).not.toContain(hashDeviceToken(main.token));
  });
});

describe("simulador contra el endpoint real", () => {
  it("todos los escenarios de docs/09 se comportan como se espera y no crean captación", async () => {
    const { ALL_SCENARIOS, SCENARIOS, runSteps } = await import("../../scripts/iot-scenarios");
    const dev = await mkDevice("HUB-SIM-001", cartonId);
    const before = await businessCounts();
    // El simulador usa el endpoint tal cual: el «fetch» invoca directamente el manejador de la ruta.
    const fetchFn = (url: string, init: RequestInit) => route.POST(new NextRequest(url, init as never));
    const all = [];
    for (const name of ALL_SCENARIOS) {
      const steps = SCENARIOS[name]!.build({ deviceId: "HUB-SIM-001", now: new Date() });
      all.push(...(await runSteps(name, steps, { baseUrl: "http://localhost:3000", token: dev.token, fetchFn })));
    }
    const bad = all.filter((r) => !r.ok);
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(all.length).toBeGreaterThan(40);
    // 10 vacío + 3 depósito + 30 estable + 2 retiro + 1 duplicado (el reintento no inserta) + 1 alterado + 1 sensor + 1 sin conexión
    const n = (await db.admin.query("select count(*)::int n from hc.sensor_readings where device_id = $1", [dev.deviceId])).rows[0].n;
    expect(n).toBe(49);
    expect(await businessCounts()).toEqual(before);
    // «sensor_error» quedó con NULL; el simulador nunca inventa un cero
    const err = (await db.admin.query("select weight_g, distance_mm, fill_percent from hc.sensor_readings where device_id = $1 and quality = 'sensor_error'", [dev.deviceId])).rows[0];
    expect(err).toEqual({ weight_g: null, distance_mm: null, fill_percent: null });
    // Rechazos de borde: nada del escenario fuera_de_rango ni token_invalido llegó a la BD
    expect((await db.admin.query("select count(*)::int n from hc.sensor_readings where device_id = $1 and fill_percent > 100", [dev.deviceId])).rows[0].n).toBe(0);
  });

  it("token_revocado: tras revocar, el escenario responde 403 (o 401 si se rotó)", async () => {
    const { SCENARIOS, runSteps } = await import("../../scripts/iot-scenarios");
    const dev = await mkDevice("HUB-SIM-REV", cartonId);
    await svc.revokeDevice(admin, dev.deviceId);
    const fetchFn = (url: string, init: RequestInit) => route.POST(new NextRequest(url, init as never));
    const res = await runSteps("token_revocado", SCENARIOS.token_revocado!.build({ deviceId: "HUB-SIM-REV", now: new Date() }), { baseUrl: "http://localhost:3000", token: dev.token, fetchFn });
    expect(res[0]).toMatchObject({ ok: true, status: 403 });
  });

  it("lo simulado en un dispositivo REAL se rechaza (403) y no se guarda", async () => {
    const { SCENARIOS, runSteps } = await import("../../scripts/iot-scenarios");
    const real = await mkDevice("HUB-SIM-REAL", realContainerId);
    const fetchFn = (url: string, init: RequestInit) => route.POST(new NextRequest(url, init as never));
    const res = await runSteps("deposito", SCENARIOS.deposito!.build({ deviceId: "HUB-SIM-REAL", now: new Date() }), { baseUrl: "http://localhost:3000", token: real.token, fetchFn });
    expect(res.map((r) => r.status)).toEqual([403, 403, 403]);
    expect((await db.admin.query("select count(*)::int n from hc.sensor_readings where device_id = $1", [real.deviceId])).rows[0].n).toBe(0);
  });
});

describe("estado en el panel y aislamiento del negocio", () => {
  it("listDevices informa último contacto, última lectura y conteos de 24 h", async () => {
    const list = await q.listDevices(admin);
    const d = list.find((x) => x.code === "HUB-ESP32-001")!;
    expect(d.state).toBe("en_linea");
    expect(d.last).toMatchObject({ quality: expect.any(String) });
    expect(d.readings24h).toBeGreaterThan(5);
    expect(d.sensorErrors24h).toBeGreaterThanOrEqual(1);
    expect(d.clockIssues24h).toBeGreaterThanOrEqual(2);
    expect(d.dataOrigin).toBe("demo");
    expect(list.find((x) => x.code === "HUB-API-REV")!.state).toBe("revocado");
    const future = new Date(Date.now() + 30 * 60_000);
    expect((await q.listDevices(admin, future)).find((x) => x.code === "HUB-ESP32-001")!.state).toBe("desactualizado");
  });

  it("tras todas las lecturas, pesajes/lotes/movimientos y KPIs siguen en cero (telemetría ≠ captación)", async () => {
    expect(await businessCounts()).toEqual({ w: 0, b: 0, m: 0, bl: 0 });
  });

  it("ingestReading (servicio) propaga errores de dominio", async () => {
    await expect(ing.ingestReading(newDeviceToken(), reading() as never)).rejects.toMatchObject({ code: "device_token_invalid", status: 401 });
  });
});
