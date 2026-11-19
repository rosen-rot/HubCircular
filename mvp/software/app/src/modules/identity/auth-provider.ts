/**
 * Configuración del proveedor de identidad (ADR-021). Módulo puro y SOLO de servidor (nunca NEXT_PUBLIC_*).
 *
 *  · AUTH_PROVIDER=local (por defecto) | supabase.
 *  · Con `supabase` se necesitan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (clave publicable / anon).
 *    NO se usa ni se acepta la clave secreta / service_role: si se detecta, la configuración se rechaza.
 */

export type AuthProviderName = "local" | "supabase";

export interface SupabaseAuthConfig {
  /** Origen del proyecto, sin barra final ni ruta (p. ej. https://<ref>.supabase.co). */
  url: string;
  publishableKey: string;
}

export function authProviderName(env: Record<string, string | undefined> = process.env): AuthProviderName {
  const v = (env.AUTH_PROVIDER ?? "local").trim().toLowerCase();
  if (v === "" || v === "local") return "local";
  if (v === "supabase") return "supabase";
  throw new Error("AUTH_PROVIDER debe ser «local» o «supabase».");
}

/** ¿La clave es de rol privilegiado (secret / service_role)? */
export function looksLikeSecretKey(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return true;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { role?: unknown };
      return payload.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}

export function supabaseAuthConfig(env: Record<string, string | undefined> = process.env): SupabaseAuthConfig {
  const rawUrl = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!rawUrl || !key) {
    throw new Error("AUTH_PROVIDER=supabase requiere SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en .env.local (ver docs/19).");
  }
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("SUPABASE_URL no es una URL válida (https://<referencia>.supabase.co).");
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) {
    throw new Error("SUPABASE_URL debe usar https (http solo para localhost en pruebas).");
  }
  if (u.username || u.password) throw new Error("SUPABASE_URL no debe incluir credenciales.");
  if (looksLikeSecretKey(key)) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY contiene una clave secreta/service_role: no se usa ni se acepta. Use la clave publicable (sb_publishable_…) o anon.");
  }
  return { url: u.origin, publishableKey: key };
}
