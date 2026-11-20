import { describe, expect, it } from "vitest";
import { ALL_SCENARIOS, SCENARIOS, SIM_FIRMWARE, assertAllowedTarget, runSteps, type ScenarioCtx } from "../../scripts/iot-scenarios";
import { DEVICE_STATE_LABEL, deviceState, parseCreateDevice, parseDeviceId, readingSchema, relativeAge } from "../../src/modules/devices/schema";
import { deviceTokenPrefix, hashDeviceToken, newDeviceToken, parseBearerToken } from "../../src/modules/devices/token";

const NOW = new Date("2026-11-20T15:00:00Z");
const ctx = (over: Partial<ScenarioCtx> = {}): ScenarioCtx => ({ deviceId: "HUB-ESP32-001", now: NOW, ...over });

describe("credencial del dispositivo", () => {
  it("es aleatoria, de 256 bits, con prefijo y forma fija; el hash es SHA-256 hex y no contiene el token", () => {
    const a = newDeviceToken();
    const b = newDeviceToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^hcd_[A-Za-z0-9_-]{43}$/);
    expect(hashDeviceToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken(a)).not.toContain(a.slice(4, 20));
    expect(hashDeviceToken(a)).toBe(hashDeviceToken(a));
    expect(deviceTokenPrefix(a)).toHaveLength(8);
    expect(a.startsWith(deviceTokenPrefix(a))).toBe(true);
  });

  it("parseBearerToken solo acepta «Bearer <token con la forma esperada>»", () => {
    const t = newDeviceToken();
    expect(parseBearerToken(`Bearer ${t}`)).toBe(t);
    expect(parseBearerToken(`  Bearer ${t}  `)).toBe(t);
    for (const bad of [null, undefined, "", t, `Basic ${t}`, `Bearer ${t}x`, `Bearer ${t.slice(1)}`, "Bearer hcd_corto", `Bearer ${t} extra`, `bearer ${t}`]) {
      expect(parseBearerToken(bad as string | null), String(bad)).toBeNull();
    }
  });
});

describe("contrato de lectura v1 (zod)", () => {
  const ok = {
    schemaVersion: 1, deviceId: "HUB-ESP32-001", messageId: "a8a961b7-ae4d-4b72-a34b-d0a0d8d1ed51", measuredAt: "2026-11-16T20:30:00Z",
    weightGrams: 4250, distanceMm: 180, fillPercent: 65.0, quality: "stable", firmwareVersion: "0.1.0",
  };
  it("acepta el ejemplo de docs/04", () => {
    expect(readingSchema.safeParse(ok).success).toBe(true);
    expect(readingSchema.safeParse({ ...ok, firmwareVersion: undefined }).success).toBe(true);
  });
  it("rechaza fuera de rango, tipos, campos extra y combinaciones imposibles", () => {
    const bad: Record<string, unknown>[] = [
      { fillPercent: 130 }, { fillPercent: -0.1 }, { weightGrams: -1 }, { weightGrams: 1.5 }, { weightGrams: 1_000_001 },
      { distanceMm: -1 }, { distanceMm: 10_001 }, { messageId: "x" }, { measuredAt: "mañana" }, { quality: "ok" }, { schemaVersion: 2 },
      { extra: true }, { deviceId: "ab" }, { weightGrams: "1" }, { quality: "sensor_error" }, { quality: "uncalibrated" },
    ];
    for (const b of bad) expect(readingSchema.safeParse({ ...ok, ...b }).success, JSON.stringify(b)).toBe(false);
  });
  it("sensor_error con nulos y uncalibrated sin peso son válidos (nunca un cero inventado)", () => {
    expect(readingSchema.safeParse({ ...ok, quality: "sensor_error", weightGrams: null, distanceMm: null, fillPercent: null }).success).toBe(true);
    expect(readingSchema.safeParse({ ...ok, quality: "uncalibrated", weightGrams: null }).success).toBe(true);
  });
});

describe("estado del dispositivo", () => {
  const d = (over = {}) => ({ revokedAt: null, lastSeenAt: new Date(NOW.getTime() - 60_000), staleAfterMinutes: 15, ...over });
  it("en línea, desactualizado, sin datos y revocado (el revocado manda sobre el resto)", () => {
    expect(deviceState(d(), NOW)).toBe("en_linea");
    expect(deviceState(d({ lastSeenAt: new Date(NOW.getTime() - 15 * 60_000) }), NOW)).toBe("en_linea"); // justo en el umbral
    expect(deviceState(d({ lastSeenAt: new Date(NOW.getTime() - 15 * 60_000 - 1) }), NOW)).toBe("desactualizado");
    expect(deviceState(d({ lastSeenAt: null }), NOW)).toBe("sin_datos");
    expect(deviceState(d({ revokedAt: NOW }), NOW)).toBe("revocado");
    expect(deviceState(d({ revokedAt: NOW, lastSeenAt: null }), NOW)).toBe("revocado");
    expect(Object.keys(DEVICE_STATE_LABEL).sort()).toEqual(["desactualizado", "en_linea", "revocado", "sin_datos"]);
  });
  it("relativeAge", () => {
    expect(relativeAge(null, NOW)).toBe("nunca");
    expect(relativeAge(new Date(NOW.getTime() - 20_000), NOW)).toBe("hace menos de 1 min");
    expect(relativeAge(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe("hace 5 min");
    expect(relativeAge(new Date(NOW.getTime() - 3 * 3600_000), NOW)).toBe("hace 3 h");
    expect(relativeAge(new Date(NOW.getTime() - 4 * 86400_000), NOW)).toBe("hace 4 d");
  });
});

describe("formulario de dispositivo", () => {
  const c = crypto.randomUUID();
  it("normaliza y valida", () => {
    expect(parseCreateDevice({ code: " hub-esp32-001 ", name: "  Sensor   cartón ", containerId: c, staleAfterMinutes: "30" })).toEqual({
      ok: true, value: { code: "HUB-ESP32-001", name: "Sensor cartón", containerId: c, staleAfterMinutes: 30 },
    });
    expect(parseCreateDevice({ code: "HUB-1", name: "x", containerId: c })).toMatchObject({ ok: true, value: { staleAfterMinutes: 15 } });
    for (const bad of [{ code: "a b" }, { code: "ab" }, { name: "" }, { containerId: "x" }, { staleAfterMinutes: "0" }, { staleAfterMinutes: "1441" }, { staleAfterMinutes: "1.5" }, { staleAfterMinutes: "abc" }]) {
      expect(parseCreateDevice({ code: "HUB-1", name: "x", containerId: c, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(parseDeviceId({ deviceId: c })).toBe(c);
    expect(parseDeviceId({ deviceId: "no" })).toBeNull();
  });
});

describe("escenarios del simulador (docs/09)", () => {
  it("existen todos los escenarios de docs/09 y cada uno explica su resultado esperado", () => {
    for (const n of ["vacio", "deposito", "estable_repetido", "retiro_parcial", "duplicado", "alterado", "sensor_invalido", "sin_conexion", "fuera_de_rango", "token_revocado"]) {
      expect(SCENARIOS[n], n).toBeDefined();
      expect(SCENARIOS[n]!.outcome.length).toBeGreaterThan(20);
    }
    for (const n of ALL_SCENARIOS) expect(SCENARIOS[n]).toBeDefined();
    expect(ALL_SCENARIOS).not.toContain("token_revocado"); // exige revocar a mano
  });

  it("todo mensaje simulado lleva firmware «sim-…» y los válidos cumplen el contrato; los inválidos son los previstos", () => {
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      for (const step of sc.build(ctx())) {
        expect(step.payload.firmwareVersion, name).toBe(SIM_FIRMWARE);
        expect(SIM_FIRMWARE.startsWith("sim-")).toBe(true);
        const valid = readingSchema.safeParse(step.payload).success;
        if (name === "fuera_de_rango") expect(valid).toBe(false);
        else expect(valid, `${name}/${step.label}`).toBe(true);
      }
    }
  });

  it("vacío: 0–30 g fluctuante; depósito: 0 → 1500 → 1498; estable: 1500 g repetido con messageId distintos; retiro: 1500 → 500", () => {
    const vac = SCENARIOS.vacio!.build(ctx());
    expect(vac).toHaveLength(10);
    for (const s of vac) expect(s.payload.weightGrams!).toBeGreaterThanOrEqual(0), expect(s.payload.weightGrams!).toBeLessThanOrEqual(30);
    expect(new Set(vac.map((s) => s.payload.weightGrams)).size).toBeGreaterThan(1);
    expect(SCENARIOS.deposito!.build(ctx()).map((s) => s.payload.weightGrams)).toEqual([0, 1500, 1498]);
    const est = SCENARIOS.estable_repetido!.build(ctx());
    expect(est).toHaveLength(30);
    expect(new Set(est.map((s) => s.payload.weightGrams))).toEqual(new Set([1500]));
    expect(new Set(est.map((s) => s.payload.messageId)).size).toBe(30);
    expect(SCENARIOS.retiro_parcial!.build(ctx()).map((s) => s.payload.weightGrams)).toEqual([1500, 500]);
    expect(SCENARIOS.estable_repetido!.build(ctx({ count: 5 }))).toHaveLength(5);
  });

  it("las lecturas son deterministas con la misma semilla y sus horas no están en el futuro", () => {
    let i = 0;
    const newId = () => `00000000-0000-4000-8000-${String(i++).padStart(12, "0")}`;
    const a = SCENARIOS.vacio!.build(ctx({ newId, seed: 7 })).map((s) => s.payload.weightGrams);
    i = 0;
    const b = SCENARIOS.vacio!.build(ctx({ newId, seed: 7 })).map((s) => s.payload.weightGrams);
    expect(a).toEqual(b);
    for (const sc of Object.values(SCENARIOS)) for (const s of sc.build(ctx())) expect(new Date(s.payload.measuredAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it("duplicado reenvía el mismo mensaje; alterado cambia el contenido con el mismo messageId; sensor inválido no inventa ceros", () => {
    const [a, b] = SCENARIOS.duplicado!.build(ctx());
    expect(b!.payload).toEqual(a!.payload);
    expect(b!.expectDuplicate).toBe(true);
    const [o, m] = SCENARIOS.alterado!.build(ctx());
    expect(m!.payload.messageId).toBe(o!.payload.messageId);
    expect(m!.payload.weightGrams).not.toBe(o!.payload.weightGrams);
    expect(m!.expect).toEqual([409]);
    const [e] = SCENARIOS.sensor_invalido!.build(ctx());
    expect(e!.payload).toMatchObject({ quality: "sensor_error", weightGrams: null, distanceMm: null, fillPercent: null });
    expect(SCENARIOS.fuera_de_rango!.build(ctx())[0]!.payload.fillPercent).toBe(130);
    expect(SCENARIOS.token_invalido!.build(ctx())[0]!.token).toMatch(/^hcd_[A-Za-z0-9_-]{43}$/);
  });
});

describe("runSteps", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("envía a /api/iot/v1/readings con Bearer, compara con lo esperado y respeta el intervalo", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const sleeps: number[] = [];
    const res = await runSteps("deposito", SCENARIOS.deposito!.build(ctx()), {
      baseUrl: "http://localhost:3000/",
      token: "hcd_secreto",
      intervalMs: 250,
      sleep: async (ms) => void sleeps.push(ms),
      fetchFn: async (url, init) => {
        calls.push({ url, auth: new Headers(init.headers).get("authorization") });
        return json(202, { accepted: true, duplicate: false });
      },
    });
    expect(res.every((r) => r.ok)).toBe(true);
    expect(calls[0]).toEqual({ url: "http://localhost:3000/api/iot/v1/readings", auth: "Bearer hcd_secreto" });
    expect(sleeps).toEqual([250, 250, 250]);
  });

  it("marca diferencias (estado o duplicate inesperados) y usa el token del paso si lo trae", async () => {
    const auths: (string | null)[] = [];
    const res = await runSteps("duplicado", SCENARIOS.duplicado!.build(ctx()), {
      baseUrl: "http://localhost:3000",
      token: "t",
      fetchFn: async (_u, init) => {
        auths.push(new Headers(init.headers).get("authorization"));
        return json(202, { accepted: true, duplicate: false }); // el servidor «olvida» el duplicado
      },
    });
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    expect(res[1]!.detail).toContain("duplicate=false");
    const inv = await runSteps("token_invalido", SCENARIOS.token_invalido!.build(ctx()), {
      baseUrl: "http://localhost:3000", token: "configurado",
      fetchFn: async (_u, init) => { auths.push(new Headers(init.headers).get("authorization")); return json(401, { error: { code: "device_token_invalid" } }); },
    });
    expect(inv[0]).toMatchObject({ ok: true, status: 401, detail: "device_token_invalid" });
    expect(auths.at(-1)).not.toBe("Bearer configurado");
  });

  it("sin red: informa el fallo sin lanzar y sin filtrar el token; se puede interrumpir", async () => {
    const res = await runSteps("deposito", SCENARIOS.deposito!.build(ctx()), {
      baseUrl: "http://localhost:3000", token: "hcd_muy_secreto",
      fetchFn: async () => { throw new Error("connect ECONNREFUSED hcd_muy_secreto"); },
    });
    expect(res).toHaveLength(3);
    expect(res.every((r) => !r.ok && r.status === 0)).toBe(true);
    expect(JSON.stringify(res)).not.toContain("hcd_muy_secreto");
    const signal = { aborted: false };
    const cut = await runSteps("deposito", SCENARIOS.deposito!.build(ctx()), {
      baseUrl: "http://localhost:3000", token: "t", signal,
      fetchFn: async () => { signal.aborted = true; return json(202, { duplicate: false }); },
    });
    expect(cut).toHaveLength(1);
  });

  it("solo apunta a localhost salvo autorización explícita", () => {
    expect(() => assertAllowedTarget("http://localhost:3000", false)).not.toThrow();
    expect(() => assertAllowedTarget("http://127.0.0.1:3100", false)).not.toThrow();
    expect(() => assertAllowedTarget("https://hubcircular.example.cl", false)).toThrow(/remoto/);
    expect(() => assertAllowedTarget("https://hubcircular.example.cl", true)).not.toThrow();
    expect(() => assertAllowedTarget("no-es-url", true)).toThrow(/URL válida/);
  });
});
