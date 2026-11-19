/** Referencias legibles: P-000123 (pesaje) y L-000123 (lote). */
export const formatWeighingRef = (n: number) => `P-${String(n).padStart(6, "0")}`;
export const formatBatchRef = (n: number) => `L-${String(n).padStart(6, "0")}`;

export type RefQuery =
  | { kind: "weighing"; n: number }
  | { kind: "batch"; n: number }
  | { kind: "container"; text: string };

/** Interpreta el filtro libre "referencia": P-12, L-7, 12 (pesaje) o parte de un código de contenedor. */
export function parseRefQuery(input: string): RefQuery | null {
  const s = input.trim();
  if (!s) return null;
  const m = /^([PpLl])?-?0*(\d{1,9})$/.exec(s);
  if (m) {
    const n = Number(m[2]);
    return (m[1] ?? "P").toUpperCase() === "L" ? { kind: "batch", n } : { kind: "weighing", n };
  }
  return { kind: "container", text: s.slice(0, 64) };
}
