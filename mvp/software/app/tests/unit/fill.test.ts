import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillLevel, fillView, formatPercent, parseCapacity } from "../../src/modules/devices/fill";
import { GLOSSARY } from "../../src/lib/glossary";

const reading = (fillPercent: number | null, quality: "stable" | "unstable" | "uncalibrated" | "sensor_error" = "stable") => ({ fillPercent, quality });

describe("llenado: solo con capacidad y con dato", () => {
  it("sin capacidad nunca muestra porcentaje, aunque el sensor envíe llenado", () => {
    expect(fillView({ capacityL: null, sensor: { state: "en_linea", last: reading(65) } })).toEqual({ kind: "sin_capacidad" });
    expect(fillView({ capacityL: 0, sensor: { state: "en_linea", last: reading(65) } })).toEqual({ kind: "sin_capacidad" });
    expect(fillView({ capacityL: 12.5, sensor: { state: "en_linea", last: reading(65) } })).toEqual({ kind: "sin_capacidad" });
  });

  it("con capacidad pero sin sensor, revocado, sin lecturas, error o sin llenado: sin dato (nunca 0 %)", () => {
    expect(fillView({ capacityL: 120, sensor: null })).toEqual({ kind: "sin_sensor" });
    expect(fillView({ capacityL: 120, sensor: { state: "revocado", last: reading(40) } })).toEqual({ kind: "sin_dato", reason: "revocado" });
    expect(fillView({ capacityL: 120, sensor: { state: "sin_datos", last: null } })).toEqual({ kind: "sin_dato", reason: "sin_lecturas" });
    expect(fillView({ capacityL: 120, sensor: { state: "en_linea", last: reading(null, "sensor_error") } })).toEqual({ kind: "sin_dato", reason: "error_sensor" });
    expect(fillView({ capacityL: 120, sensor: { state: "en_linea", last: reading(null) } })).toEqual({ kind: "sin_dato", reason: "sin_llenado" });
  });

  it("con capacidad y dato: porcentaje y litros aproximados; desactualizado se marca", () => {
    expect(fillView({ capacityL: 120, sensor: { state: "en_linea", last: reading(65) } })).toEqual({
      kind: "ok", percent: 65, approxLiters: 78, capacityL: 120, stale: false,
    });
    expect(fillView({ capacityL: 240, sensor: { state: "desactualizado", last: reading(12.5) } })).toEqual({
      kind: "ok", percent: 12.5, approxLiters: 30, capacityL: 240, stale: true,
    });
    // Un 0 % real (contenedor vacío medido) sí se muestra: no es lo mismo que «sin dato».
    expect(fillView({ capacityL: 120, sensor: { state: "en_linea", last: reading(0) } })).toMatchObject({ kind: "ok", percent: 0, approxLiters: 0 });
  });

  it("formato y nivel", () => {
    expect(formatPercent(65)).toBe("65 %");
    expect(formatPercent(12.54)).toBe("12,5 %");
    expect(fillLevel(10)).toBe("bajo");
    expect(fillLevel(50)).toBe("medio");
    expect(fillLevel(80)).toBe("alto");
  });
});

describe("capacidad escrita por el administrador", () => {
  it("vacío quita la capacidad; acepta enteros 1–10000", () => {
    expect(parseCapacity("")).toEqual({ ok: true, value: null });
    expect(parseCapacity("  ")).toEqual({ ok: true, value: null });
    expect(parseCapacity(null)).toEqual({ ok: true, value: null });
    expect(parseCapacity("120")).toEqual({ ok: true, value: 120 });
    expect(parseCapacity("10000")).toEqual({ ok: true, value: 10000 });
  });
  it("rechaza decimales, unidades, negativos, cero y valores grandes", () => {
    for (const bad of ["12.5", "12,5", "120 L", "-5", "0", "10001", "99999", "1e3", "abc"]) {
      expect(parseCapacity(bad).ok, bad).toBe(false);
    }
  });
});

describe("migración 0012", () => {
  const sql = readFileSync("db/migrations/0012_container_capacity.sql", "utf8");
  it("la función nueva revoca EXECUTE a PUBLIC y no concede nada a anon/authenticated", () => {
    expect(sql).toMatch(/revoke execute on function hc\.admin_set_container_capacity\(uuid, uuid, integer\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant[^;]*to[^;]*(anon|authenticated)/i);
    expect(sql).toMatch(/security definer set search_path = hc, pg_temp/);
  });
  it("no toca pesajes, lotes, movimientos ni lecturas", () => {
    expect(sql).not.toMatch(/hc\.(weighings|batches|movements|sensor_readings|batch_location_balances)/);
  });
});

describe("glosario", () => {
  it("define capacidad y llenado", () => {
    expect(GLOSSARY.capacidad.group).toBe("sensores");
    expect(GLOSSARY.llenado.short).toMatch(/no kilos/);
  });
});
