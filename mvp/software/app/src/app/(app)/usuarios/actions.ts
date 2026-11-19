"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { getCurrentActor } from "@/modules/identity/service";
import { parseAddRole, parseCreateUser, parseUuidField } from "@/modules/users/schema";
import { addUserRole, createUser, removeUserRole, resetUserPassword, setUserActive } from "@/modules/users/service";

export interface UserFormState {
  errors?: Record<string, string>;
  /** Clave temporal: se muestra UNA vez en la respuesta y no se guarda en ningún lado. */
  temp?: { email: string; name?: string; password: string };
  /** Modo Supabase Auth: perfil creado; la cuenta de acceso se crea en Supabase (sin clave en HubCircular). */
  created?: { email: string; name: string };
}

async function actorOrLogin() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login?next=%2Fusuarios");
  return actor;
}

function failure(err: unknown, field = "form"): UserFormState {
  const e = err instanceof DomainError ? err : new DomainError("unexpected");
  if (e.code === "unauthenticated") redirect("/login?next=%2Fusuarios");
  const target = e.code === "user_exists" || e.code === "email_invalid" ? "email" : e.code === "zone_invalid" ? "zoneId" : field;
  return { errors: { [target]: e.userMessage } };
}

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const actor = await actorOrLogin();
  const parsed = parseCreateUser(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  try {
    const r = await createUser(actor, parsed.value);
    revalidatePath("/usuarios");
    if (r.tempPassword === null) return { created: { email: parsed.value.email, name: parsed.value.name } };
    return { temp: { email: parsed.value.email, name: parsed.value.name, password: r.tempPassword } };
  } catch (err) {
    return failure(err);
  }
}

export async function resetPasswordAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const actor = await actorOrLogin();
  const userId = parseUuidField(Object.fromEntries(formData), "userId");
  if (!userId) return { errors: { form: "Usuario no válido. Recargue la página." } };
  try {
    const r = await resetUserPassword(actor, userId);
    revalidatePath("/usuarios");
    return { temp: { email: String(formData.get("email") ?? "").slice(0, 254), password: r.tempPassword } };
  } catch (err) {
    return failure(err);
  }
}

function back(code?: string, ok?: string): never {
  const q = code ? `?error=${encodeURIComponent(code)}` : ok ? `?ok=${encodeURIComponent(ok)}` : "";
  redirect(`/usuarios${q}`);
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const userId = parseUuidField(Object.fromEntries(formData), "userId");
  if (!userId) back("validation");
  const active = formData.get("active") === "true";
  try {
    await setUserActive(actor, userId, active);
  } catch (err) {
    back(err instanceof DomainError ? err.code : "unexpected");
  }
  revalidatePath("/usuarios");
  back(undefined, active ? "activado" : "desactivado");
}

export async function addRoleAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const parsed = parseAddRole(Object.fromEntries(formData));
  if (!parsed.ok) back("validation");
  try {
    await addUserRole(actor, parsed.value);
  } catch (err) {
    back(err instanceof DomainError ? err.code : "unexpected");
  }
  revalidatePath("/usuarios");
  back(undefined, "rol_agregado");
}

export async function removeRoleAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const roleId = parseUuidField(Object.fromEntries(formData), "roleId");
  if (!roleId) back("validation");
  try {
    await removeUserRole(actor, roleId);
  } catch (err) {
    back(err instanceof DomainError ? err.code : "unexpected");
  }
  revalidatePath("/usuarios");
  back(undefined, "rol_quitado");
}

