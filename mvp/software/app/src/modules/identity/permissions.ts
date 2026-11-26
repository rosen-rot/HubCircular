import { DomainError } from "@/lib/errors";
import type { Actor, AppRole } from "./types";

/**
 * Matriz de permisos de la aplicación. NO es la única barrera: la base de datos vuelve a verificar
 * (funciones SECURITY DEFINER y RLS). Ocultar botones no es seguridad.
 */
export type Permission =
  | "weighing:create"
  | "movement:create"
  | "movement:adjust"
  | "movement:correct"
  | "movement:read"
  | "evidence:add"
  | "verification:decide"
  | "destination:manage"
  | "weighing:read"
  | "batch:read"
  | "catalog:read"
  | "catalog:manage"
  | "audit:read"
  | "indicators:read"
  | "schedule:manage"
  | "measurement:zero"
  | "device:read"
  | "device:manage"
  | "user:manage"
  | "account:password";

const MATRIX: Record<Permission, AppRole[]> = {
  "weighing:create": ["administrador", "operador"],
  "movement:create": ["administrador", "operador"],
  "movement:adjust": ["administrador"],
  "movement:correct": ["administrador"],
  "movement:read": ["administrador", "operador", "lector"],
  "evidence:add": ["administrador", "operador"],
  "verification:decide": ["administrador"],
  "destination:manage": ["administrador"],
  "weighing:read": ["administrador", "operador", "lector"],
  "batch:read": ["administrador", "operador", "lector"],
  "catalog:read": ["administrador", "operador", "lector"],
  "catalog:manage": ["administrador"],
  "audit:read": ["administrador"],
  "indicators:read": ["administrador", "operador", "lector"],
  "schedule:manage": ["administrador"],
  "measurement:zero": ["administrador", "operador"],
  "device:read": ["administrador", "operador", "lector"],
  "device:manage": ["administrador"],
  "user:manage": ["administrador"],
  "account:password": ["administrador", "operador", "lector"],
};

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return false;
  // Con clave temporal solo se puede cambiar la propia contraseña (defensa para páginas, acciones y API).
  if (actor.mustChangePassword) return permission === "account:password";
  return actor.roles.some((g) => MATRIX[permission].includes(g.role));
}

export function assertCan(actor: Actor | null | undefined, permission: Permission): asserts actor is Actor {
  if (!actor) throw new DomainError("unauthenticated");
  if (actor.mustChangePassword && permission !== "account:password") throw new DomainError("password_change_required");
  if (!can(actor, permission)) throw new DomainError("forbidden");
}

export function roleLabel(role: AppRole): string {
  return { administrador: "Administrador", operador: "Operador", lector: "Lector" }[role];
}

/** Acepta solo rutas internas relativas; evita redirecciones abiertas tras el login. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  if (next.startsWith("/login")) return fallback;
  return next;
}
