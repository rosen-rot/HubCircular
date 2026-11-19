import { z } from "zod";
import { santiagoLocalToUtc } from "@/lib/time";
import { MAX_GROSS_G, parseKgToGrams } from "@/modules/weighing/units";

export const MOVEMENT_TYPES = ["traslado", "despacho", "reutilizacion", "rechazo", "ajuste"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABEL: Record<MovementType | "correccion", string> = {
  traslado: "Traslado",
  despacho: "Despacho a gestor",
  reutilizacion: "Reutilización",
  rechazo: "Rechazo",
  ajuste: "Ajuste",
  correccion: "Corrección",
};

export const EVIDENCE_KINDS = ["guia_despacho", "certificado", "correo", "foto", "otro"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  guia_despacho: "Guía de despacho",
  certificado: "Certificado",
  correo: "Correo",
  foto: "Foto (referencia)",
  otro: "Otro",
};

export const DESTINATION_TYPES = ["gestor", "reutilizacion", "otro"] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];
export const DESTINATION_LABEL: Record<DestinationType, string> = {
  gestor: "Gestor de residuos",
  reutilizacion: "Reutilización interna",
  otro: "Otro",
};

export interface RegisterMovementInput {
  batchId: string;
  type: MovementType;
  quantityG: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  destinationId: string | null;
  occurredAt: Date | null;
  reason: string | null;
  idempotencyKey: string;
}

export type MovementFieldErrors = Partial<
  Record<"batchId" | "type" | "quantityKg" | "from" | "to" | "destinationId" | "occurredAtLocal" | "reason" | "form", string>
>;

const uuid = z.string().uuid();
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (s: string) => s.replace(CONTROL, "").trim();

type Raw = Record<string, FormDataEntryValue | null | undefined>;
const str = (raw: Raw, k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");

/**
 * Valida y normaliza el formulario de movimientos. Mejora los mensajes, pero las reglas definitivas
 * (saldo, ámbito, tipos de destino, motivo) las vuelve a aplicar la función transaccional de la BD.
 */
export function parseMovementForm(raw: Raw): { ok: true; value: RegisterMovementInput } | { ok: false; errors: MovementFieldErrors } {
  const errors: MovementFieldErrors = {};

  const batch = uuid.safeParse(str(raw, "batchId"));
  if (!batch.success) errors.batchId = "Seleccione un lote.";

  const typeRaw = str(raw, "type");
  const type = (MOVEMENT_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as MovementType) : null;
  if (!type) errors.type = "Seleccione el tipo de movimiento.";

  const qty = parseKgToGrams(str(raw, "quantityKg"));
  if (!qty.ok) errors.quantityKg = { empty: "Ingrese una cantidad.", format: "Use solo números, con coma o punto decimal (ej. 9,00).", decimals: "Máximo 3 decimales (resolución de 1 g)." }[qty.error];
  else if (qty.grams <= 0) errors.quantityKg = "La cantidad debe ser mayor que 0.";
  else if (qty.grams > MAX_GROSS_G) errors.quantityKg = "Máximo 1.000 kg por movimiento. Revise la unidad ingresada.";

  const fromRaw = str(raw, "from");
  const toRaw = str(raw, "to");
  const destRaw = str(raw, "destinationId");
  const from = uuid.safeParse(fromRaw).success ? fromRaw : null;
  const to = uuid.safeParse(toRaw).success ? toRaw : null;
  const dest = uuid.safeParse(destRaw).success ? destRaw : null;

  // Forma por tipo: solo se envían los campos que corresponden (el resto se ignora).
  let fromLocationId: string | null = null;
  let toLocationId: string | null = null;
  let destinationId: string | null = null;
  let adjustSign: "sube" | "baja" | null = null;
  if (type) {
    if (type === "traslado") {
      if (!from) errors.from = "Seleccione la ubicación de origen.";
      if (!to) errors.to = "Seleccione la ubicación de destino.";
      else if (from && to === from) errors.to = "El destino debe ser distinto del origen.";
      fromLocationId = from;
      toLocationId = to;
    } else if (type === "ajuste") {
      adjustSign = str(raw, "adjustSign") === "sube" ? "sube" : str(raw, "adjustSign") === "baja" ? "baja" : null;
      if (!adjustSign) errors.form = "Indique si el ajuste aumenta o disminuye el saldo.";
      if (adjustSign === "sube") {
        if (!to) errors.to = "Seleccione la ubicación.";
        toLocationId = to;
      } else {
        if (!from) errors.from = "Seleccione la ubicación.";
        fromLocationId = from;
      }
    } else {
      if (!from) errors.from = "Seleccione la ubicación de origen.";
      fromLocationId = from;
      if (type === "despacho" || type === "reutilizacion") {
        if (!dest) errors.destinationId = "Seleccione un destino.";
        destinationId = dest;
      }
    }
  }

  let occurredAt: Date | null = null;
  const occurredRaw = str(raw, "occurredAtLocal").trim();
  if (occurredRaw) {
    const r = santiagoLocalToUtc(occurredRaw);
    if (!r.ok) {
      errors.occurredAtLocal = r.error === "nonexistent" ? "Esa hora no existe por cambio de horario. Elija otra." : "Fecha y hora inválidas.";
    } else if (r.date.getTime() > Date.now() + 5 * 60_000) {
      errors.occurredAtLocal = "La fecha y hora no puede estar en el futuro.";
    } else occurredAt = r.date;
  }

  const reasonRaw = clean(str(raw, "reason"));
  if (reasonRaw.length > 500) errors.reason = "Máximo 500 caracteres.";
  else if (type && (type === "rechazo" || type === "ajuste") && reasonRaw.length < 5) errors.reason = "Ingrese un motivo de al menos 5 caracteres.";
  const reason = reasonRaw || null;

  const key = uuid.safeParse(str(raw, "idempotencyKey"));
  if (!key.success) errors.form = "Falta la clave de seguridad del formulario. Recargue la página.";

  if (Object.keys(errors).length > 0 || !batch.success || !type || !qty.ok || !key.success) return { ok: false, errors };
  return {
    ok: true,
    value: {
      batchId: batch.data,
      type,
      quantityG: qty.grams,
      fromLocationId,
      toLocationId,
      destinationId,
      occurredAt,
      reason,
      idempotencyKey: key.data,
    },
  };
}

export function parseEvidenceForm(raw: Raw):
  | { ok: true; value: { movementId: string; kind: EvidenceKind; reference: string; note: string | null } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const movementId = uuid.safeParse(str(raw, "movementId"));
  if (!movementId.success) errors.form = "Movimiento no válido. Recargue la página.";
  const kindRaw = str(raw, "kind");
  const kind = (EVIDENCE_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as EvidenceKind) : null;
  if (!kind) errors.kind = "Seleccione el tipo de evidencia.";
  const reference = clean(str(raw, "reference"));
  if (reference.length < 1) errors.reference = "Ingrese la referencia (n.º de guía, folio, asunto del correo…).";
  else if (reference.length > 200) errors.reference = "Máximo 200 caracteres.";
  const noteRaw = clean(str(raw, "note"));
  if (noteRaw.length > 500) errors.note = "Máximo 500 caracteres.";
  if (Object.keys(errors).length || !movementId.success || !kind) return { ok: false, errors };
  return { ok: true, value: { movementId: movementId.data, kind, reference, note: noteRaw || null } };
}

export function parseVerificationForm(raw: Raw):
  | { ok: true; value: { movementId: string; status: "confirmada" | "rechazada"; notes: string | null } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const movementId = uuid.safeParse(str(raw, "movementId"));
  if (!movementId.success) errors.form = "Movimiento no válido. Recargue la página.";
  const s = str(raw, "status");
  const status = s === "confirmada" || s === "rechazada" ? s : null;
  if (!status) errors.form = "Decisión no válida.";
  const notes = clean(str(raw, "notes"));
  if (notes.length > 500) errors.notes = "Máximo 500 caracteres.";
  else if (status === "rechazada" && notes.length < 5) errors.notes = "Para rechazar, ingrese un motivo de al menos 5 caracteres.";
  if (Object.keys(errors).length || !movementId.success || !status) return { ok: false, errors };
  return { ok: true, value: { movementId: movementId.data, status, notes: notes || null } };
}

export function parseCorrectionForm(raw: Raw):
  | { ok: true; value: { movementId: string; reason: string; idempotencyKey: string } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const movementId = uuid.safeParse(str(raw, "movementId"));
  const key = uuid.safeParse(str(raw, "idempotencyKey"));
  if (!movementId.success || !key.success) errors.form = "Solicitud no válida. Recargue la página.";
  const reason = clean(str(raw, "reason"));
  if (reason.length < 5) errors.reason = "Ingrese un motivo de al menos 5 caracteres.";
  else if (reason.length > 500) errors.reason = "Máximo 500 caracteres.";
  if (Object.keys(errors).length || !movementId.success || !key.success) return { ok: false, errors };
  return { ok: true, value: { movementId: movementId.data, reason, idempotencyKey: key.data } };
}

export function parseDestinationForm(raw: Raw):
  | { ok: true; value: { name: string; type: DestinationType; demo: boolean } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = clean(str(raw, "name")).replace(/\s+/g, " ");
  if (name.length < 2) errors.name = "Ingrese un nombre de al menos 2 caracteres.";
  else if (name.length > 120) errors.name = "Máximo 120 caracteres.";
  const t = str(raw, "type");
  const type = (DESTINATION_TYPES as readonly string[]).includes(t) ? (t as DestinationType) : null;
  if (!type) errors.type = "Seleccione el tipo de destino.";
  if (Object.keys(errors).length || !type) return { ok: false, errors };
  return { ok: true, value: { name, type, demo: str(raw, "demo") === "on" } };
}
