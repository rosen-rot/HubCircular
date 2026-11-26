import { createHash, randomBytes } from "node:crypto";

/**
 * Credencial de un dispositivo IoT: 32 bytes aleatorios (256 bits) con prefijo `hcd_`.
 * Es de alta entropía, por lo que basta un hash rápido (SHA-256) para guardarla; la BD nunca ve el token.
 * Se muestra UNA vez al crearla o rotarla; no se registra en logs ni se imprime.
 */
export const DEVICE_TOKEN_PREFIX = "hcd_";

export function newDeviceToken(): string {
  return DEVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Parte NO secreta que se guarda para reconocer el token en pantalla: `hcd_` + 4 caracteres. */
export function deviceTokenPrefix(token: string): string {
  return token.slice(0, DEVICE_TOKEN_PREFIX.length + 4);
}

const TOKEN_SHAPE = /^hcd_[A-Za-z0-9_-]{43}$/;

/** Extrae el token de `Authorization: Bearer <token>`; null si falta o no tiene la forma esperada. */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer ([^\s]+)$/.exec(header.trim());
  if (!m) return null;
  return TOKEN_SHAPE.test(m[1]!) ? m[1]! : null;
}
