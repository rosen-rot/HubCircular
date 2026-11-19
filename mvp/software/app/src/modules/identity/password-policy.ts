import { randomInt } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

// Sin caracteres ambiguos (0/O, 1/I/L) para que la clave temporal pueda dictarse o copiarse sin errores.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Clave temporal aleatoria: 16 caracteres de un alfabeto de 31 (≈ 79 bits), formato XXXX-XXXX-XXXX-XXXX. */
export function generateTempPassword(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]!);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

const COMMON = new Set(["contraseña123", "password1234", "123456789012", "qwertyuiop12", "hubcircular1", "hubcircular123"]);

/**
 * Política de contraseñas elegidas por la persona (criterio NIST 800-63B: longitud mínima y rechazo de claves
 * obvias; sin reglas de composición). Devuelve un mensaje en español o null si es aceptable.
 */
export function validateNewPassword(password: string, ctx: { email?: string; current?: string } = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use como máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  if (password.trim().length === 0 || /^(.)\1+$/.test(password)) return "La contraseña es demasiado simple.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "La contraseña es demasiado común.";
  if (ctx.email) {
    const local = ctx.email.toLowerCase().split("@")[0] ?? "";
    if (lower === ctx.email.toLowerCase() || (local.length >= 4 && lower.includes(local))) {
      return "La contraseña no puede contener su correo.";
    }
  }
  if (ctx.current !== undefined && password === ctx.current) return "La nueva contraseña debe ser distinta de la actual.";
  return null;
}
