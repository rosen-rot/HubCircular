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
  | "immutable_record"
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
  immutable_record: "Este registro no puede modificarse ni eliminarse.",
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
      return 401;
    case "forbidden":
      return 403;
    case "container_not_found":
      return 404;
    case "idempotency_conflict":
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
