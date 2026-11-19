import writeXlsxFile from "write-excel-file/node";
import type { CsvValue } from "./csv";
import type { Table } from "./exports";

/**
 * Libro de Excel único con una hoja por tabla (Indicadores, Pesajes, Movimientos, Cobertura).
 * Las hojas salen de las MISMAS tablas que los CSV (`exports.ts`), con las mismas columnas y valores:
 * masas en gramos enteros como números, fechas y horas como texto en hora de Chile, sin decimales ambiguos.
 * Los textos se escriben SIEMPRE como celdas de texto (nunca como fórmulas): una celda que empiece con «=» se ve
 * tal cual y no se evalúa. No se agrega ningún dato que no esté en los CSV.
 */
export const WORKBOOK_SHEETS = ["Indicadores", "Pesajes", "Movimientos", "Cobertura"] as const;
export type WorkbookSheet = (typeof WORKBOOK_SHEETS)[number];

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type XlsxCell = { value: string; type: StringConstructor; fontWeight?: "bold" } | { value: number; type: NumberConstructor; format: string } | null;

function cell(v: CsvValue): XlsxCell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, type: Number, format: Number.isInteger(v) ? "0" : "0.0##" } : null;
  if (typeof v === "boolean") return { value: v ? "sí" : "no", type: String };
  return { value: v.replace(/\r?\n|\r/g, " "), type: String };
}

function widthOf(t: Table, col: number): number {
  let max = t.headers[col]!.length;
  for (const r of t.rows.slice(0, 200)) {
    const v = r[col];
    if (v !== null && v !== undefined) max = Math.max(max, String(v).length);
  }
  return Math.min(Math.max(max + 2, 10), 48);
}

export async function buildWorkbook(tables: Record<WorkbookSheet, Table>): Promise<Buffer> {
  const sheets = WORKBOOK_SHEETS.map((name) => {
    const t = tables[name];
    const header = t.headers.map((h) => ({ value: h, type: String, fontWeight: "bold" as const }));
    return {
      sheet: name,
      data: [header, ...t.rows.map((r) => r.map(cell))],
      columns: t.headers.map((_, i) => ({ width: widthOf(t, i) })),
      stickyRowsCount: 1,
    };
  });
  return writeXlsxFile(sheets).toBuffer();
}
