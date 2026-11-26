/** Error de dominio con código estable (legible por máquina) y mensaje en español para la interfaz. */
export type DomainErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "container_not_found"
  | "container_inactive"
  | "material_inactive"
  | "invalid_mass"
  | "tare_not_less_than_gross"
  | "mass_too_large"
  | "notes_too_long"
  | "occurred_in_future"
  | "idempotency_conflict"
  | "idempotency_key_required"
  | "container_required"
  | "invalid_movement_type"
  | "invalid_movement_shape"
  | "reason_required"
  | "batch_not_found"
  | "destination_invalid"
  | "destination_inactive"
  | "destination_exists"
  | "destination_not_found"
  | "zone_invalid"
  | "occurred_before_batch"
  | "insufficient_balance"
  | "movement_not_found"
  | "already_corrected"
  | "cannot_correct_correction"
  | "verification_blocks_correction"
  | "movement_not_verifiable"
  | "evidence_required"
  | "evidence_duplicate"
  | "verification_unchanged"
  | "movement_batch_mismatch"
  | "email_invalid"
  | "user_exists"
  | "user_not_found"
  | "role_invalid"
  | "role_exists"
  | "role_not_found"
  | "last_admin"
  | "last_role"
  | "cannot_deactivate_self"
  | "cannot_reset_self"
  | "password_change_required"
  | "wrong_current_password"
  | "password_weak"
  | "auth_external"
  | "weekdays_invalid"
  | "schedule_start_invalid"
  | "schedule_overlap"
  | "schedule_not_found"
  | "schedule_already_ended"
  | "schedule_end_invalid"
  | "not_expected_today"
  | "weighing_exists"
  | "immutable_record"
  | "device_token_invalid"
  | "device_revoked"
  | "device_mismatch"
  | "simulation_not_allowed"
  | "device_exists"
  | "device_invalid"
  | "device_not_found"
  | "message_conflict"
  | "reading_invalid"
  | "rate_limited"
  | "capacity_invalid"
  | "validation"
  | "unexpected";

const MESSAGES: Record<DomainErrorCode, string> = {
  unauthenticated: "Debe iniciar sesión para continuar.",
  forbidden: "No tiene permiso para realizar esta acción.",
  container_not_found: "No existe un contenedor con ese código.",
  container_inactive: "El contenedor (o su estación/zona) está inactivo y no admite registros.",
  material_inactive: "El material del contenedor está inactivo y no admite registros.",
  invalid_mass: "Los pesos deben ser números válidos: bruto mayor que 0 y tara no negativa.",
  tare_not_less_than_gross: "La tara debe ser menor que el peso bruto: el neto debe ser positivo.",
  mass_too_large: "El peso bruto supera el máximo de 1.000 kg por registro. Revise la unidad ingresada.",
  notes_too_long: "Las observaciones no pueden superar los 500 caracteres.",
  occurred_in_future: "La fecha y hora del pesaje no puede estar en el futuro.",
  idempotency_conflict:
    "Este envío ya se registró con datos distintos. Recargue el formulario para crear un nuevo pesaje.",
  idempotency_key_required: "Falta la clave de seguridad del formulario. Recargue la página.",
  container_required: "Seleccione un contenedor.",
  invalid_movement_type: "Tipo de movimiento no válido.",
  invalid_movement_shape: "Los datos no corresponden al tipo de movimiento (ubicaciones o destino incorrectos).",
  reason_required: "Ingrese un motivo de al menos 5 caracteres.",
  batch_not_found: "No existe el lote indicado o no está dentro de su ámbito.",
  destination_invalid: "Destino no válido para este movimiento. Revise el tipo de destino y que sea del mismo origen de datos (real/DEMO).",
  destination_inactive: "El destino está inactivo. Elija otro o pida a un administrador que lo reactive.",
  destination_exists: "Ya existe un destino con ese nombre.",
  destination_not_found: "No existe el destino indicado.",
  zone_invalid: "La ubicación indicada no existe o está inactiva.",
  occurred_before_batch: "La fecha del movimiento no puede ser anterior al pesaje del lote.",
  insufficient_balance: "Saldo insuficiente en la ubicación de origen: el saldo no puede quedar negativo.",
  movement_not_found: "No existe el movimiento indicado o no está dentro de su ámbito.",
  already_corrected: "Este movimiento ya fue corregido.",
  cannot_correct_correction: "Una corrección no puede corregirse. Registre un movimiento nuevo si es necesario.",
  verification_blocks_correction:
    "El despacho tiene una valorización confirmada. Rechace primero la verificación (con motivo) para poder corregirlo.",
  movement_not_verifiable: "Solo los despachos admiten evidencia y verificación.",
  evidence_required: "Para confirmar la valorización se necesita al menos una evidencia registrada.",
  evidence_duplicate: "Esa evidencia (tipo y referencia) ya está registrada en este movimiento.",
  verification_unchanged: "La verificación ya tiene ese estado.",
  movement_batch_mismatch: "El movimiento no corresponde al lote indicado.",
  email_invalid: "Ingrese un correo electrónico válido.",
  user_exists: "Ya existe un usuario con ese correo.",
  user_not_found: "No existe el usuario indicado.",
  role_invalid: "Rol no válido.",
  role_exists: "El usuario ya tiene ese rol en ese ámbito.",
  role_not_found: "No existe el rol indicado.",
  last_admin: "Debe quedar al menos un administrador activo con acceso a todas las zonas.",
  last_role: "El usuario debe conservar al menos un rol. Para quitarle el acceso, desactívelo.",
  cannot_deactivate_self: "No puede desactivar su propia cuenta.",
  cannot_reset_self: "Para cambiar su propia contraseña use «Cambiar contraseña».",
  password_change_required: "Debe cambiar su contraseña temporal antes de continuar.",
  wrong_current_password: "La contraseña actual no es correcta.",
  password_weak: "La contraseña no cumple los requisitos.",
  auth_external: "Las contraseñas se administran en Supabase Auth (Authentication → Users en el panel de Supabase), no en HubCircular.",
  weekdays_invalid: "Seleccione al menos un día de la semana (lunes a domingo).",
  schedule_start_invalid: "La fecha de inicio debe ser hoy o posterior (máximo 366 días hacia adelante).",
  schedule_overlap: "El contenedor ya tiene un calendario vigente en esas fechas. Termine el actual antes de crear otro.",
  schedule_not_found: "No existe el calendario indicado.",
  schedule_already_ended: "Ese calendario ya está terminado.",
  schedule_end_invalid: "La fecha de término no puede ser anterior a ayer ni anterior al inicio del calendario.",
  not_expected_today: "Hoy no hay una medición esperada para este contenedor, por lo que no se puede confirmar «cero».",
  weighing_exists: "Ya hay un pesaje de este contenedor hoy; no corresponde confirmar «cero».",
  immutable_record: "Este registro no puede modificarse ni eliminarse.",
  device_token_invalid: "La credencial del dispositivo no es válida.",
  device_revoked: "El dispositivo está revocado: su credencial ya no permite enviar datos.",
  device_mismatch: "El identificador enviado no corresponde al dispositivo dueño de la credencial.",
  simulation_not_allowed: "Los datos de un simulador solo se aceptan en dispositivos DEMO.",
  device_exists: "Ya existe un dispositivo con ese código.",
  device_invalid: "Revise los datos del dispositivo: código (letras, números, guion), nombre y minutos de tolerancia (1 a 1440).",
  device_not_found: "No existe el dispositivo indicado.",
  message_conflict: "Ya se recibió ese mensaje con datos distintos.",
  reading_invalid: "La lectura no cumple el contrato (formato, unidades o rango).",
  rate_limited: "Se superó la frecuencia máxima de envío del dispositivo.",
  capacity_invalid: "La capacidad debe ser un número entero de litros entre 1 y 10000 (o quedar vacía para no mostrar llenado).",
  validation: "Revise los campos marcados.",
  unexpected: "Ocurrió un error inesperado. Intente nuevamente; si persiste, avise a un administrador.",
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;

  constructor(code: DomainErrorCode, status?: number) {
    super(code);
    this.name = "DomainError";
    this.code = code;
    this.status = status ?? defaultStatus(code);
  }

  get userMessage(): string {
    return MESSAGES[this.code];
  }
}

function defaultStatus(code: DomainErrorCode): number {
  switch (code) {
    case "unauthenticated":
    case "device_token_invalid":
      return 401;
    case "forbidden":
    case "password_change_required":
    case "device_revoked":
    case "device_mismatch":
    case "simulation_not_allowed":
      return 403;
    case "rate_limited":
      return 429;
    case "container_not_found":
    case "batch_not_found":
    case "movement_not_found":
    case "destination_not_found":
    case "user_not_found":
    case "role_not_found":
    case "schedule_not_found":
    case "device_not_found":
      return 404;
    case "idempotency_conflict":
    case "destination_exists":
    case "user_exists":
    case "role_exists":
    case "evidence_duplicate":
    case "verification_unchanged":
    case "auth_external":
    case "schedule_overlap":
    case "schedule_already_ended":
    case "device_exists":
    case "message_conflict":
      return 409;
    case "unexpected":
      return 500;
    default:
      return 422;
  }
}

export function messageForCode(code: string): string {
  return (MESSAGES as Record<string, string>)[code] ?? MESSAGES.unexpected;
}

const KNOWN = new Set<string>(Object.keys(MESSAGES));

/** Traduce un error de PostgreSQL (SQLSTATE HCxxx) a DomainError; el resto se considera inesperado. */
export function mapDbError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  const e = err as { code?: string; message?: string };
  if (typeof e?.code === "string" && e.code.startsWith("HC") && typeof e.message === "string" && KNOWN.has(e.message)) {
    return new DomainError(e.message as DomainErrorCode);
  }
  return new DomainError("unexpected");
}
