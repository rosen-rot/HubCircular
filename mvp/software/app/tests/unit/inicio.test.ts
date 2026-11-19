import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_PERIOD, parseHomeFilters, pctChange } from "@/modules/inicio/filters";

describe("filtros del Inicio", () => {
  it("usa 30 días y datos reales por defecto", () => {
    expect(parseHomeFilters({})).toEqual({ days: DEFAULT_HOME_PERIOD, origin: "real" });
  });
  it("acepta solo 7, 30 y 90 días; cualquier otro valor vuelve al período por defecto", () => {
    expect(parseHomeFilters({ days: "7" }).days).toBe(7);
    expect(parseHomeFilters({ days: "90" }).days).toBe(90);
    for (const bad of ["0", "15", "-7", "abc", "7; drop table", "1e1", ""]) expect(parseHomeFilters({ days: bad }).days).toBe(30);
  });
  it("los datos DEMO solo se ven si se piden de forma explícita", () => {
    expect(parseHomeFilters({ origin: "demo" }).origin).toBe("demo");
    for (const bad of ["DEMO", "all", "", "real"]) expect(parseHomeFilters({ origin: bad }).origin).toBe("real");
  });
  it("toma el primer valor si el parámetro se repite", () => {
    expect(parseHomeFilters({ days: ["7", "90"], origin: ["demo", "real"] })).toEqual({ days: 7, origin: "demo" });
  });
});

describe("variación contra el período anterior", () => {
  it("calcula el porcentaje con un decimal", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(75, 100)).toBe(-25);
    expect(pctChange(1001, 1000)).toBe(0.1);
    expect(pctChange(100, 100)).toBe(0);
  });
  it("sin base de comparación no inventa un porcentaje", () => {
    expect(pctChange(500, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});
