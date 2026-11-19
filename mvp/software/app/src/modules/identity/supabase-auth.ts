import "server-only";
import type { SupabaseAuthConfig } from "./auth-provider";

/**
 * Verificación de credenciales contra Supabase Auth (GoTrue) por REST, sin dependencias nuevas ni service_role.
 * Solo se usa para comprobar la identidad: el token de acceso devuelto se descarta (se intenta revocar) y la
 * aplicación abre su propia sesión opaca (hc.local_sessions). La autorización sigue en HubCircular (roles, zonas, RLS).
 */

export type SupabaseVerifyResult =
  | { ok: true; authUserId: string; email: string }
  | { ok: false; reason: "invalid" | "unavailable" };

const TIMEOUT_MS = 8000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TokenResponse {
  access_token?: unknown;
  user?: { id?: unknown; email?: unknown; email_confirmed_at?: unknown; confirmed_at?: unknown } | null;
}

export async function verifyWithSupabase(
  cfg: SupabaseAuthConfig,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SupabaseVerifyResult> {
  const normalized = email.trim().toLowerCase();
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: cfg.publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ email: normalized, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // 400/401/422: credenciales inválidas, correo sin confirmar, etc. 429 y 5xx: el servicio no pudo evaluar.
  if (res.status === 429 || res.status >= 500) return { ok: false, reason: "unavailable" };
  if (!res.ok) return { ok: false, reason: "invalid" };

  let body: TokenResponse;
  try {
    body = (await res.json()) as TokenResponse;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const user = body.user;
  const id = typeof user?.id === "string" ? user.id : "";
  const mail = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  const confirmed = user?.email_confirmed_at ?? user?.confirmed_at;
  const accessToken = typeof body.access_token === "string" ? body.access_token : null;

  // Se revoca la sesión de Supabase (mejor esfuerzo): no se usa para nada más.
  if (accessToken) {
    void fetchImpl(`${cfg.url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: cfg.publishableKey, authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => undefined);
  }

  // El correo debe coincidir y estar CONFIRMADO: sin eso no se vincula ninguna identidad.
  if (!UUID.test(id) || mail !== normalized || !confirmed) return { ok: false, reason: "invalid" };
  return { ok: true, authUserId: id.toLowerCase(), email: mail };
}
