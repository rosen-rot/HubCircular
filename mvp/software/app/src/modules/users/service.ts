import "server-only";
import { cookies } from "next/headers";
import { anon, withActor, type Queryable } from "@/lib/db";
import { DomainError, mapDbError } from "@/lib/errors";
import { authProviderName } from "@/modules/identity/auth-provider";
import { assertCan, type Permission } from "@/modules/identity/permissions";
import { generateTempPassword } from "@/modules/identity/password-policy";
import { hashPassword, verifyPassword } from "@/modules/identity/password";
import { hashSessionToken, LOGIN_LOCK_MINUTES, LOGIN_MAX_FAILURES, SESSION_COOKIE } from "@/modules/identity/session";
import type { Actor, AppRole } from "@/modules/identity/types";

async function run<T>(actor: Actor, permission: Permission, fn: (db: Queryable) => Promise<T>): Promise<T> {
  assertCan(actor, permission);
  try {
    return await withActor(actor.userId, fn);
  } catch (err) {
    throw mapDbError(err);
  }
}

/**
 * Con proveedor local, la clave temporal se devuelve UNA vez para mostrarla al administrador; nunca se guarda en claro ni se registra.
 * Con Supabase Auth (ADR-021) solo se crea el perfil y roles: la persona obtiene su cuenta en Supabase y `tempPassword` es null.
 */
export async function createUser(
  actor: Actor,
  input: { email: string; name: string; role: AppRole; zoneId: string | null },
): Promise<{ userId: string; tempPassword: string | null }> {
  assertCan(actor, "user:manage");
  const tempPassword = authProviderName() === "local" ? generateTempPassword() : null;
  const hash = tempPassword ? await hashPassword(tempPassword) : null;
  const userId = await run(actor, "user:manage", async (db) => {
    const r = await db.query<{ o_user_id: string }>("select * from hc.admin_create_user($1,$2,$3,$4,$5,$6)", [
      actor.userId,
      input.email,
      input.name,
      input.role,
      input.zoneId,
      hash,
    ]);
    return r.rows[0]!.o_user_id;
  });
  return { userId, tempPassword };
}

export async function resetUserPassword(actor: Actor, userId: string): Promise<{ tempPassword: string }> {
  assertCan(actor, "user:manage");
  if (authProviderName() !== "local") throw new DomainError("auth_external");
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  await run(actor, "user:manage", async (db) => {
    await db.query("select hc.admin_reset_password($1,$2,$3)", [actor.userId, userId, hash]);
  });
  return { tempPassword };
}

export async function setUserActive(actor: Actor, userId: string, active: boolean): Promise<void> {
  await run(actor, "user:manage", async (db) => {
    await db.query("select hc.admin_set_user_active($1,$2,$3)", [actor.userId, userId, active]);
  });
}

export async function addUserRole(actor: Actor, input: { userId: string; role: AppRole; zoneId: string | null }): Promise<void> {
  await run(actor, "user:manage", async (db) => {
    await db.query("select * from hc.admin_add_role($1,$2,$3,$4)", [actor.userId, input.userId, input.role, input.zoneId]);
  });
}

export async function removeUserRole(actor: Actor, roleId: string): Promise<void> {
  await run(actor, "user:manage", async (db) => {
    await db.query("select hc.admin_remove_role($1,$2)", [actor.userId, roleId]);
  });
}

/** Cambia la propia contraseña: verifica la actual, guarda el hash nuevo y cierra las demás sesiones. */
export async function changeOwnPassword(actor: Actor, input: { current: string; next: string }): Promise<void> {
  assertCan(actor, "account:password");
  if (authProviderName() !== "local") throw new DomainError("auth_external");
  const { rows } = await anon.query<{ user_id: string; password_hash: string; locked_until: Date | null }>(
    "select * from hc.auth_get_credentials($1)",
    [actor.email],
  );
  const cred = rows[0];
  if (!cred || cred.user_id !== actor.userId) throw new DomainError("wrong_current_password");
  if (cred.locked_until && cred.locked_until.getTime() > Date.now()) throw new DomainError("wrong_current_password");
  if (!(await verifyPassword(input.current, cred.password_hash))) {
    await anon.query("select hc.auth_record_failure($1, $2, make_interval(mins => $3))", [actor.userId, LOGIN_MAX_FAILURES, LOGIN_LOCK_MINUTES]);
    throw new DomainError("wrong_current_password");
  }
  const hash = await hashPassword(input.next);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    await withActor(actor.userId, async (db) => {
      await db.query("select hc.auth_change_password($1,$2,$3)", [actor.userId, hash, token ? hashSessionToken(token) : null]);
    });
  } catch (err) {
    throw mapDbError(err);
  }
}
