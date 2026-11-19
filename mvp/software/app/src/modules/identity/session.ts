import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "hc_session";
export const SESSION_TTL_HOURS = 12;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MINUTES = 15;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** La BD solo guarda el hash: un volcado de la tabla no permite suplantar sesiones. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires,
  };
}
