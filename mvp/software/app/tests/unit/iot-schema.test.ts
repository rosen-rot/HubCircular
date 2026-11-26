import { describe, expect, it } from "vitest";
import { hashDeviceToken, newDeviceToken, normalizeReading, parseBearer, readingSchema } from "../../src/modules/iot/schema";

const base = {
  schemaVersion: 1,
  deviceId: "HUB-ESP32-001",
  messageId: "a8a961b7-ae4d-4b72-a34b-d0a0d8d1ed51",
  weightGrams: 4250,
  quality: "stable",
};

describe("contrato de lectura IoT (docs/04 v1)", () => {
  it("acepta el mínimo y el ejemplo completo", () => {
    expect(readingSchema.safeParse(base).success).toBe(true);
    expect(
      readingSchema.safeParse({ ...base, measuredAt: "2026-11-26T20:30:00Z", distanceMm: 180, fillPercent: 65.25, rssiDbm: -61, firmwareVersion: "1.0.0" }).success,
    ).toBe(true);
  });

  it.each([
    ["schemaVersion distinto", { schemaVersion: 2 }],
    ["peso negativo", { weightGrams: -1 }],
    ["peso con decimales", { weightGrams: 10.5 }],
    ["fillPercent > 100", { fillPercent: 130 }],
    ["rssi positivo", { rssiDbm: 5 }],
    ["quality desconocida", { quality: "ok" }],
    ["messageId no UUID", { messageId: "123" }],
    ["campo extra", { extra: true }],
    ["stable sin peso", { weightGrams: null }],
    ["sensor_error con peso", { quality: "sensor_error" }],
    ["deviceId con espacios", { deviceId: "HUB ESP32" }],
  ])("rechaza %s", (_n, over) => {
    expect(readingSchema.safeParse({ ...base, ...over }).success).toBe(false);
  });

  it("normaliza el deviceId y la huella no cambia con mayúsculas del UUID, pero sí con el contenido", () => {
    const a = normalizeReading(readingSchema.parse({ ...base, deviceId: "hub-esp32-001" }));
    const b = normalizeReading(readingSchema.parse({ ...base, messageId: base.messageId.toUpperCase() }));
    const c = normalizeReading(readingSchema.parse({ ...base, weightGrams: 4251 }));
    expect(a.deviceCode).toBe("HUB-ESP32-001");
    expect(a.payloadHash).toBe(b.payloadHash);
    expect(a.payloadHash).not.toBe(c.payloadHash);
  });

  it("token: formato, Bearer y hash", () => {
    const t = newDeviceToken();
    expect(t).toMatch(/^hcd_[A-Za-z0-9_-]{43}$/);
    expect(parseBearer(`Bearer ${t}`)).toBe(t);
    expect(parseBearer(`bearer   ${t} `)).toBe(t);
    expect(parseBearer(t)).toBeNull();
    expect(parseBearer("Bearer abc")).toBeNull();
    expect(parseBearer(null)).toBeNull();
    expect(hashDeviceToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});
