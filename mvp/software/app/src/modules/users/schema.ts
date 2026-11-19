import { z } from "zod";
import type { AppRole } from "@/modules/identity/types";
import { MAX_PASSWORD_LENGTH, validateNewPassword } from "@/modules/identity/password-policy";

export const ROLES: readonly AppRole[] = ["administrador", "operador", "lector"];
const uuid = z.string().uuid();
const CONTROL = /[\u0000-\u001f\u007f]/g;

type Raw = Record<string, FormDataEntryValue | null | undefined>;
const str = (raw: Raw, k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");

const role = (v: string): AppRole | null => ((ROLES as readonly string[]).includes(v) ? (v as AppRole) : null);

/** Zona «todas»: valor vacío o «all». Cualquier otro valor debe ser un UUID. */
function zone(v: string): { ok: true; value: string | null } | { ok: false } {
  if (v === "" || v === "all") return { ok: true, value: null };
  return uuid.safeParse(v).success ? { ok: true, value: v } : { ok: false };
}

export function parseCreateUser(raw: Raw):
  | { ok: true; value: { email: string; name: string; role: AppRole; zoneId: string | null } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const email = str(raw, "email").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) errors.email = "Ingrese un correo electrónico válido.";
  const name = str(raw, "name").replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (name.length < 1) errors.name = "Ingrese el nombre.";
  else if (name.length > 120) errors.name = "Máximo 120 caracteres.";
  const r = role(str(raw, "role"));
  if (!r) errors.role = "Seleccione un rol.";
  const z = zone(str(raw, "zoneId"));
  if (!z.ok) errors.zoneId = "Zona no válida.";
  else if (r === "operador" && z.value === null) errors.zoneId = "Un operador debe tener una zona asignada.";
  if (Object.keys(errors).length || !r || !z.ok) return { ok: false, errors };
  return { ok: true, value: { email, name, role: r, zoneId: z.value } };
}

export function parseAddRole(raw: Raw):
  | { ok: true; value: { userId: string; role: AppRole; zoneId: string | null } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const userId = uuid.safeParse(str(raw, "userId"));
  if (!userId.success) errors.form = "Usuario no válido. Recargue la página.";
  const r = role(str(raw, "role"));
  if (!r) errors.role = "Seleccione un rol.";
  const z = zone(str(raw, "zoneId"));
  if (!z.ok) errors.zoneId = "Zona no válida.";
  else if (r === "operador" && z.value === null) errors.zoneId = "Un operador debe tener una zona asignada.";
  if (Object.keys(errors).length || !userId.success || !r || !z.ok) return { ok: false, errors };
  return { ok: true, value: { userId: userId.data, role: r, zoneId: z.value } };
}

export function parseUuidField(raw: Raw, key: string): string | null {
  const v = uuid.safeParse(str(raw, key));
  return v.success ? v.data : null;
}

export function parseChangePassword(raw: Raw, email: string):
  | { ok: true; value: { current: string; next: string } }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const current = str(raw, "current");
  const next = str(raw, "next");
  const repeat = str(raw, "repeat");
  if (!current) errors.current = "Ingrese su contraseña actual.";
  else if (current.length > MAX_PASSWORD_LENGTH) errors.current = "Contraseña actual no válida.";
  const weak = validateNewPassword(next, { email, current });
  if (weak) errors.next = weak;
  else if (next !== repeat) errors.repeat = "Las contraseñas no coinciden.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { current, next } };
}
