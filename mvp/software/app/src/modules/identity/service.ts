import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { anon } from "@/lib/db";
import { authProviderName, supabaseAuthConfig } from "./auth-provider";
import { dummyHash, verifyPassword } from "./password";
import { verifyWithSupabase } from "./supabase-auth";
import {
  hashSessionToken,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
  newSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_HOURS,
  sessionCookieOptions,
} from "./session";
import type { Actor, RoleGrant } from "./types";

interface CredentialRow {
  user_id: string;
  active: boolean;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
}

export type LoginResult = { ok: true; token: string; expires: Date } | { ok: false; reason?: "unavailable" };

async function openSession(userId: string): Promise<LoginResult> {
  const token = newSessionToken();
  const { rows: exp } = await anon.query<{ expires: Date }>(
    "select hc.auth_create_session($1, $2, make_interval(hours => $3)) as expires",
    [userId, hashSessionToken(token), SESSION_TTL_HOURS],
  );
  return { ok: true, token, expires: exp[0]!.expires };
}

/**
 * Proveedor Supabase Auth (ADR-021): Supabase verifica la identidad; HubCircular decide el acceso.
 * Solo entra quien tiene un perfil ACTIVO creado por un administrador y cuyo correo está confirmado en Supabase.
 * El bloqueo por intentos fallidos lo aplica Supabase Auth (límites de tasa del proyecto), no la base local.
 */
async function authenticateSupabase(email: string, password: string, fetchImpl?: typeof fetch): Promise<LoginResult> {
  const cfg = supabaseAuthConfig();
  const v = await verifyWithSupabase(cfg, email, password, fetchImpl);
  if (!v.ok) {
    if (v.reason === "unavailable") return { ok: false, reason: "unavailable" };
    await anon.query("select hc.auth_record_unknown_attempt()");
    return { ok: false };
  }
  const { rows } = await anon.query<{ o_user_id: string }>("select * from hc.auth_link_supabase($1, $2)", [v.email, v.authUserId]);
  const userId = rows[0]?.o_user_id;
  if (!userId) {
    await anon.query("select hc.auth_record_unknown_attempt()");
    return { ok: false };
  }
  await anon.query("select hc.auth_record_success($1)", [userId]);
  return openSession(userId);
}

/** Autentica con correo/contraseña. Respuesta uniforme ante cuenta inexistente, inactiva, bloqueada o clave errónea. */
export async function authenticate(email: string, password: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<LoginResult> {
  if (authProviderName() === "supabase") return authenticateSupabase(email, password, opts.fetchImpl);
  const normalized = email.trim().toLowerCase();
  const { rows } = await anon.query<CredentialRow>("select * from hc.auth_get_credentials($1)", [normalized]);
  const cred = rows[0];

  if (!cred) {
    await verifyPassword(password, await dummyHash());
    await anon.query("select hc.auth_record_unknown_attempt()");
    return { ok: false };
  }
  if (cred.locked_until && cred.locked_until.getTime() > Date.now()) {
    await verifyPassword(password, await dummyHash());
    return { ok: false };
  }
  const valid = await verifyPassword(password, cred.password_hash);
  if (!valid || !cred.active) {
    if (cred.active) {
      await anon.query("select hc.auth_record_failure($1, $2, make_interval(mins => $3))", [
        cred.user_id,
        LOGIN_MAX_FAILURES,
        LOGIN_LOCK_MINUTES,
      ]);
    }
    return { ok: false };
  }
  await anon.query("select hc.auth_record_success($1)", [cred.user_id]);
  return openSession(cred.user_id);
}

interface SessionRow {
  user_id: string;
  email: string;
  display_name: string;
  roles: RoleGrant[];
  must_change_password: boolean;
}

export async function resolveSession(token: string): Promise<Actor | null> {
  const { rows } = await anon.query<SessionRow>("select * from hc.auth_resolve_session($1)", [hashSessionToken(token)]);
  const r = rows[0];
  if (!r) return null;
  return { userId: r.user_id, email: r.email, displayName: r.display_name, roles: r.roles, mustChangePassword: r.must_change_password === true };
}

/** Usuario de la solicitud actual (una consulta por solicitud gracias a `cache`). */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
});

export async function startSession(token: string, expires: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await anon.query("select hc.auth_delete_session($1)", [hashSessionToken(token)]);
  jar.delete(SESSION_COOKIE);
}
