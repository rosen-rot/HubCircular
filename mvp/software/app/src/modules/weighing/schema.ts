import { z } from "zod";
import { santiagoLocalToUtc } from "@/lib/time";
import { MAX_GROSS_G, parseKgToGrams } from "./units";

export interface RegisterWeighingInput {
  containerCode: string;
  grossG: number;
  tareG: number;
  occurredAt: Date | null;
  notes: string | null;
  contaminationObserved: boolean;
  idempotencyKey: string;
}

export type FieldErrors = Partial<
  Record<"containerCode" | "grossKg" | "tareKg" | "occurredAtLocal" | "notes" | "form", string>
>;

const MASS_MSG = {
  empty: "Ingrese un valor.",
  format: "Use solo números, con coma o punto decimal (ej. 6,40).",
  decimals: "Máximo 3 decimales (resolución de 1 g).",
} as const;

const uuid = z.string().uuid();

/** Valida y normaliza los datos crudos de un formulario. Las reglas definitivas viven en la BD. */
export function parseWeighingForm(raw: Record<string, FormDataEntryValue | null | undefined>):
  | { ok: true; value: RegisterWeighingInput }
  | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");

  const containerCode = str("containerCode").trim().toUpperCase();
  if (!containerCode) errors.containerCode = "Seleccione un contenedor.";
  else if (containerCode.length > 64) errors.containerCode = "Código demasiado largo.";

  const gross = parseKgToGrams(str("grossKg"));
  if (!gross.ok) errors.grossKg = MASS_MSG[gross.error];
  else if (gross.grams <= 0) errors.grossKg = "El peso bruto debe ser mayor que 0.";
  else if (gross.grams > MAX_GROSS_G) errors.grossKg = "Máximo 1.000 kg por registro. Revise la unidad ingresada.";

  const tare = parseKgToGrams(str("tareKg"));
  if (!tare.ok) errors.tareKg = MASS_MSG[tare.error];

  if (gross.ok && tare.ok && !errors.grossKg && tare.grams >= gross.grams) {
    errors.tareKg = "La tara debe ser menor que el peso bruto (el neto debe ser positivo).";
  }

  let occurredAt: Date | null = null;
  const occurredRaw = str("occurredAtLocal").trim();
  if (occurredRaw) {
    const r = santiagoLocalToUtc(occurredRaw);
    if (!r.ok) {
      errors.occurredAtLocal =
        r.error === "nonexistent" ? "Esa hora no existe por cambio de horario. Elija otra." : "Fecha y hora inválidas.";
    } else if (r.date.getTime() > Date.now() + 5 * 60_000) {
      errors.occurredAtLocal = "La fecha y hora no puede estar en el futuro.";
    } else occurredAt = r.date;
  }

  const notesRaw = str("notes").trim();
  if (notesRaw.length > 500) errors.notes = "Máximo 500 caracteres.";
  // Se eliminan caracteres de control (salvo saltos de línea y tabulaciones) antes de persistir.
  const notes = notesRaw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") || null;

  const key = uuid.safeParse(str("idempotencyKey"));
  if (!key.success) errors.form = "Falta la clave de seguridad del formulario. Recargue la página.";

  if (Object.keys(errors).length > 0 || !gross.ok || !tare.ok || !key.success) return { ok: false, errors };

  return {
    ok: true,
    value: {
      containerCode,
      grossG: gross.grams,
      tareG: tare.grams,
      occurredAt,
      notes,
      contaminationObserved: str("contaminationObserved") === "on",
      idempotencyKey: key.data,
    },
  };
}
