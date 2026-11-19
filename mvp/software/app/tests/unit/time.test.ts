import { describe, expect, it } from "vitest";
import { formatSantiago, santiagoDayRangeToUtc, santiagoLocalToUtc, toSantiagoInputValue } from "@/lib/time";

const iso = (r: ReturnType<typeof santiagoLocalToUtc>) => (r.ok ? r.date.toISOString() : r.error);

describe("santiagoLocalToUtc (America/Santiago)", () => {
  it("verano (UTC−3): 18-11-2026 10:00 local = 13:00Z", () => {
    expect(iso(santiagoLocalToUtc("2026-11-18T10:00"))).toBe("2026-11-18T13:00:00.000Z");
  });
  it("invierno (UTC−4): 01-07-2026 10:00 local = 14:00Z", () => {
    expect(iso(santiagoLocalToUtc("2026-07-01T10:00"))).toBe("2026-07-01T14:00:00.000Z");
  });
  it("ida y vuelta consistente", () => {
    const r = santiagoLocalToUtc("2026-03-15T23:45");
    expect(r.ok && toSantiagoInputValue(r.date)).toBe("2026-03-15T23:45");
  });
  it("rechaza formatos inválidos", () => {
    for (const v of ["", "2026-11-18", "2026-13-01T10:00", "2026-11-32T10:00", "2026-11-18T25:00", "hola"]) {
      expect(iso(santiagoLocalToUtc(v))).toBe("format");
    }
  });
  it("detecta hora inexistente por cambio de horario (salto de primavera 2026-09-06)", () => {
    // Santiago adelanta el reloj de 00:00 a 01:00 el domingo 6-sep-2026: 00:00–00:59 no existen.
    expect(iso(santiagoLocalToUtc("2026-09-06T00:00"))).toBe("nonexistent");
    expect(iso(santiagoLocalToUtc("2026-09-06T00:30"))).toBe("nonexistent");
    expect(iso(santiagoLocalToUtc("2026-09-05T23:30"))).toBe("2026-09-06T03:30:00.000Z"); // −04:00
    expect(iso(santiagoLocalToUtc("2026-09-06T01:00"))).toBe("2026-09-06T04:00:00.000Z"); // −03:00
  });
  it("formatea en es-CL con hora local", () => {
    expect(formatSantiago(new Date("2026-11-18T13:05:00Z"))).toMatch(/10:05/);
  });
});

describe("santiagoDayRangeToUtc", () => {
  it("cubre el día local completo (inicio inclusivo, fin exclusivo)", () => {
    const r = santiagoDayRangeToUtc("2026-11-18", "2026-11-18");
    expect(r.from?.toISOString()).toBe("2026-11-18T03:00:00.000Z");
    expect(r.to?.toISOString()).toBe("2026-11-19T03:00:00.000Z");
  });
  it("ignora valores inválidos", () => {
    expect(santiagoDayRangeToUtc("x", "2026-1-1")).toEqual({});
  });
});
