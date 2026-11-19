/**
 * CSV compatible con Excel en configuración regional de Chile: separador «;», fin de línea CRLF y BOM UTF-8.
 * Las masas se entregan SIEMPRE en gramos enteros (sin decimales ni separadores de miles) para evitar ambigüedad de
 * coma/punto. Los textos que empiezan con =, +, -, @, tabulación o retorno se prefijan con «'» para impedir que una
 * planilla los interprete como fórmulas (inyección de fórmulas en CSV).
 */
export type CsvValue = string | number | boolean | null | undefined;

const SEP = ";";

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "number") s = Number.isFinite(v) ? String(v) : "";
  else if (typeof v === "boolean") s = v ? "sí" : "no";
  else {
    s = v.replace(/\r?\n|\r/g, " ");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  }
  return /[";\r\n]/.test(s) || s.startsWith(" ") || s.endsWith(" ") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvCell).join(SEP), ...rows.map((r) => r.map(csvCell).join(SEP))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export type CsvKind = "kpis" | "pesajes" | "movimientos" | "cobertura";
export const CSV_KINDS: readonly CsvKind[] = ["kpis", "pesajes", "movimientos", "cobertura"];
