import { describe, expect, it } from "vitest";
import { readWorkbook } from "../helpers/xlsx";
import { toCsv } from "../../src/modules/indicators/csv";
import { coverageTable, detailTable, kpiTable, MOVEMENT_HEADERS, WEIGHING_HEADERS } from "../../src/modules/indicators/exports";
import { buildWorkbook, WORKBOOK_SHEETS } from "../../src/modules/indicators/workbook";
import type { Kpis } from "../../src/modules/indicators/queries-types";

const kpis = {
  capturedG: 10000, weighings: 3, contaminated: 1, dispatchedG: 2000, dispatchedConfirmedG: 0, dispatchedRejectedG: 0, dispatchedPendingG: 2000,
  dispatchedPendingNoEvidenceG: 2000, reusedG: 0, reusedBackedG: 0, rejectedG: 0, adjustInG: 0, adjustOutG: 0, transferInG: 0, transferOutG: 0,
  openingG: 0, closingG: 8000, currentG: 8000,
} as unknown as Kpis;
const filters = { from: "2026-03-09", to: "2026-03-13", zoneId: null, materialId: null, origin: "demo" as const };

describe("libro de Excel único", () => {
  const tables = {
    Indicadores: kpiTable({ kpis, occurrences: [], filters, zoneName: null, materialName: null }),
    Pesajes: detailTable(WEIGHING_HEADERS, [
      { pesaje: "P-000001", fecha_local: "2026-03-10 10:00:00", contenedor: "DEMO-A", material: "Cartón", zona: "Cowork", bruto_g: 5350, tara_g: 350, neto_g: 5000, contaminacion: true, lote: "L-000001", fuente: "manual", origen: "demo" },
      { pesaje: "=1+1", fecha_local: "x", contenedor: "+cmd|' /C calc'!A0", material: "@SUM(A1)", zona: "-1", bruto_g: 1, tara_g: 0, neto_g: 1, contaminacion: false, lote: "L-2", fuente: "manual", origen: "demo" },
    ]),
    Movimientos: detailTable(MOVEMENT_HEADERS, [], 20000),
    Cobertura: coverageTable([], {}),
  };

  it("tiene exactamente las 4 hojas, en orden, con encabezados iguales a los de los CSV", async () => {
    const wb = readWorkbook(await buildWorkbook(tables));
    expect(Object.keys(wb.sheets)).toEqual([...WORKBOOK_SHEETS]);
    for (const name of WORKBOOK_SHEETS) {
      const csvHeader = toCsv(tables[name].headers, []).replace("﻿", "").trim().split(";");
      expect(wb.sheets[name]![0], name).toEqual(csvHeader);
    }
  });

  it("las masas son números enteros en gramos (no texto) y los textos siguen siendo texto", async () => {
    const wb = readWorkbook(await buildWorkbook(tables));
    const ind = Object.fromEntries(wb.sheets.Indicadores!.slice(1).map((r) => [r[0], r[1]]));
    expect(ind["captado"]).toBe(10000);
    expect(ind["inventario_cierre"]).toBe(8000);
    expect(ind["cobertura_porcentaje"]).toBe("sin datos");
    const h = wb.sheets.Pesajes![0]!;
    const row = wb.sheets.Pesajes![1]!;
    expect(row[h.indexOf("bruto_g")]).toBe(5350);
    expect(row[h.indexOf("neto_g")]).toBe(5000);
    expect(row[h.indexOf("fecha_local")]).toBe("2026-03-10 10:00:00");
    expect(row[h.indexOf("contaminacion")]).toBe("sí");
  });

  it("nunca escribe fórmulas: lo que empieza con =, +, - o @ queda como texto literal", async () => {
    const wb = readWorkbook(await buildWorkbook(tables));
    expect(wb.withFormulas).toEqual([]);
    const row = wb.sheets.Pesajes![2]!;
    expect(row).toContain("=1+1");
    expect(row).toContain("+cmd|' /C calc'!A0");
    expect(row).toContain("@SUM(A1)");
  });

  it("conserva la nota de truncado y las hojas vacías solo traen su encabezado", async () => {
    const wb = readWorkbook(await buildWorkbook(tables));
    expect(wb.sheets.Movimientos).toHaveLength(2); // encabezado + nota de truncado
    expect(String(wb.sheets.Movimientos![1]![0])).toContain("Exportación truncada a 20000 filas");
    expect(wb.sheets.Cobertura).toHaveLength(1);
  });

  it("un archivo vacío sigue siendo un .xlsx válido (ZIP)", async () => {
    const b = await buildWorkbook({ Indicadores: { headers: ["a"], rows: [] }, Pesajes: { headers: ["a"], rows: [] }, Movimientos: { headers: ["a"], rows: [] }, Cobertura: { headers: ["a"], rows: [] } });
    expect(b.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
