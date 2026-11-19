import { describe, expect, it } from "vitest";
import { batchStatus, parseBatchFilters, parseSelected } from "@/modules/inventory/filters";
import { parseMovementFilters, parseMovementRef, parseSelectedMovement } from "@/modules/movements/filters";

const ID = "3f2b8c1e-5a4d-4e7b-9c1a-0b2d3e4f5a6b";

describe("estado derivado del lote", () => {
  it("sin saldo, parcial o completo según captación inicial y saldo", () => {
    expect(batchStatus(9000, 0)).toBe("sin_saldo");
    expect(batchStatus(9000, -1)).toBe("sin_saldo");
    expect(batchStatus(9000, 6000)).toBe("parcial");
    expect(batchStatus(9000, 9000)).toBe("completo");
    expect(batchStatus(9000, 9500)).toBe("completo"); // un ajuste de entrada puede superar la captación
  });
});

describe("filtros de /lotes", () => {
  it("valores por defecto: datos reales, página 1, sin filtros", () => {
    expect(parseBatchFilters({})).toEqual({ from: "", to: "", materialId: null, zoneId: null, status: null, ref: "", origin: "real", page: 1 });
  });
  it("acepta valores válidos", () => {
    const f = parseBatchFilters({ from: "2026-03-01", to: "2026-03-31", material: ID, zone: ID, estado: "parcial", ref: " L-12 ", origin: "demo", page: "3" });
    expect(f).toMatchObject({ from: "2026-03-01", to: "2026-03-31", materialId: ID, zoneId: ID, status: "parcial", ref: "L-12", origin: "demo", page: 3 });
  });
  it("ignora lo inválido sin fallar (fechas imposibles, UUID mal formado, estado desconocido, páginas absurdas)", () => {
    const f = parseBatchFilters({ from: "2026-02-30", to: "hoy", material: "zz", zone: "' or 1=1 --", estado: "x", origin: "DEMO", page: "-4" });
    expect(f).toEqual({ from: "", to: "", materialId: null, zoneId: null, status: null, ref: "", origin: "real", page: 1 });
    expect(parseBatchFilters({ page: "999999999999" }).page).toBe(100_000);
    expect(parseBatchFilters({ page: "abc" }).page).toBe(1);
  });
  it("limita el largo de la referencia y toma el primer valor repetido", () => {
    expect(parseBatchFilters({ ref: "x".repeat(500) }).ref).toHaveLength(64);
    expect(parseBatchFilters({ estado: ["completo", "parcial"] }).status).toBe("completo");
  });
  it("el lote seleccionado solo se acepta si es un UUID", () => {
    expect(parseSelected({ lote: ID })).toBe(ID);
    expect(parseSelected({ lote: "1; drop table hc.batches" })).toBeNull();
    expect(parseSelected({})).toBeNull();
  });
});

describe("filtros de /movimientos", () => {
  it("valores por defecto y valores válidos", () => {
    expect(parseMovementFilters({})).toEqual({ from: "", to: "", type: null, state: null, ref: "", origin: "real", page: 1 });
    expect(parseMovementFilters({ tipo: "despacho", estado: "pendiente_evidencia", origin: "demo", page: "2" })).toMatchObject({
      type: "despacho", state: "pendiente_evidencia", origin: "demo", page: 2,
    });
  });
  it("ignora tipos, estados y fechas inválidos", () => {
    const f = parseMovementFilters({ tipo: "robo", estado: "listo", from: "2026-13-01", origin: "all" });
    expect(f).toMatchObject({ type: null, state: null, from: "", origin: "real" });
  });
  it("interpreta referencias M-12, m12, L-7 y descarta el resto", () => {
    expect(parseMovementRef("M-000012")).toEqual({ kind: "movement", n: 12 });
    expect(parseMovementRef("m12")).toEqual({ kind: "movement", n: 12 });
    expect(parseMovementRef(" L-7 ")).toEqual({ kind: "batch", n: 7 });
    for (const bad of ["", "12", "P-3", "M-", "M-12; select", "M--1"]) expect(parseMovementRef(bad)).toBeNull();
  });
  it("el movimiento seleccionado solo se acepta si es un UUID", () => {
    expect(parseSelectedMovement({ mov: ID })).toBe(ID);
    expect(parseSelectedMovement({ mov: "nada" })).toBeNull();
  });
});
