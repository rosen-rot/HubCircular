/** Límite de cordura por registro (ADR-008): 1.000 kg. Debe coincidir con la restricción de la BD. */
export const MAX_GROSS_G = 1_000_000;

export type ParseMass = { ok: true; grams: number } | { ok: false; error: "empty" | "format" | "decimals" };

/**
 * Convierte kilogramos escritos por una persona ("6,40", "6.4", "0,350") a gramos ENTEROS sin usar
 * coma flotante. Acepta coma o punto como separador decimal (un solo separador, máximo 3 decimales,
 * es decir, resolución de 1 g). No redondea en silencio: más decimales se rechazan.
 */
export function parseKgToGrams(input: string): ParseMass {
  const s = input.trim();
  if (s === "") return { ok: false, error: "empty" };
  const m = /^(\d{1,4})(?:[.,](\d+))?$/.exec(s);
  if (!m) return { ok: false, error: "format" };
  const frac = m[2] ?? "";
  if (frac.length > 3) return { ok: false, error: "decimals" };
  const grams = Number(m[1]) * 1000 + Number(frac.padEnd(3, "0") || "0");
  return { ok: true, grams };
}

const kgFmt = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const intFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/** 3900 → "3,900 kg". */
export function formatKg(grams: number): string {
  return `${kgFmt.format(grams / 1000)} kg`;
}

/** 3900 → "3.900 g". */
export function formatGrams(grams: number): string {
  return `${intFmt.format(grams)} g`;
}

/** Vista previa del neto en la interfaz. El servidor SIEMPRE lo recalcula. */
export function previewNetGrams(grossG: number, tareG: number): number | null {
  const net = grossG - tareG;
  return Number.isInteger(net) && net > 0 ? net : null;
}
