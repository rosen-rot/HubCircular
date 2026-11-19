import { readFileSync } from "node:fs";
import type { ClientConfig } from "pg";

/**
 * Configuración de conexión compartida por la aplicación, los scripts y las pruebas.
 * No importa "server-only" porque la usan scripts CLI; NUNCA debe importarse desde componentes de cliente.
 * Ninguna función de este módulo devuelve ni imprime la contraseña.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export interface DbTarget {
  host: string;
  port: number;
  database: string;
  user: string;
  local: boolean;
  supabase: boolean;
  /** 6543 en Supabase = pooler en modo transacción (no admite estado de sesión ni advisory locks de sesión). */
  transactionPooler: boolean;
  /** Referencia del proyecto Supabase si se puede deducir (host db.<ref>.supabase.co o usuario postgres.<ref>). */
  projectRef: string | null;
}

export function parseTarget(connectionString: string): DbTarget {
  let u: URL;
  try {
    u = new URL(connectionString);
  } catch {
    throw new Error("La cadena de conexión no es una URL válida (postgresql://usuario:clave@host:puerto/base).");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const port = u.port ? Number(u.port) : 5432;
  const user = decodeURIComponent(u.username);
  const supabase = /(^|\.)supabase\.(co|com)$/i.test(host) || /\.pooler\.supabase\.com$/i.test(host);
  let projectRef: string | null = null;
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/i.exec(host);
  if (direct) projectRef = direct[1]!.toLowerCase();
  const viaUser = /^[^.]+\.([a-z0-9]{20})$/i.exec(user);
  if (!projectRef && viaUser) projectRef = viaUser[1]!.toLowerCase();
  return {
    host,
    port,
    database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    user,
    local: LOCAL_HOSTS.has(host.toLowerCase()),
    supabase,
    transactionPooler: supabase && port === 6543,
    projectRef,
  };
}

/** Descripción segura (sin clave) para mostrar en consola o documentación. */
export function describeTarget(t: DbTarget): string {
  const ref = t.projectRef ? ` · proyecto Supabase ${t.projectRef}` : "";
  const kind = t.local ? "local" : t.supabase ? "Supabase" : "remoto";
  return `${kind} · ${t.host}:${t.port}/${t.database} · usuario ${t.user}${ref}`;
}

/**
 * Opciones TLS. DB_SSL: `disable` | `require` (cifra sin validar el certificado) | `verify` (valida con DB_SSL_CA_FILE o CAs del sistema).
 * Por defecto: local → sin TLS; Supabase/remoto → `require`.
 * El parámetro `sslmode` de la URL se elimina para que no contradiga a DB_SSL (pg 8 lo interpreta como verify-full).
 */
export function buildClientConfig(connectionString: string, env: Record<string, string | undefined> = process.env): ClientConfig {
  const t = parseTarget(connectionString);
  const u = new URL(connectionString);
  for (const k of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl"]) u.searchParams.delete(k);
  const mode = (env.DB_SSL ?? (t.local ? "disable" : "require")).trim().toLowerCase();
  if (!["disable", "require", "verify"].includes(mode)) {
    throw new Error("DB_SSL debe ser disable, require o verify.");
  }
  let ssl: ClientConfig["ssl"];
  if (mode === "require") ssl = { rejectUnauthorized: false };
  else if (mode === "verify") {
    const caFile = env.DB_SSL_CA_FILE?.trim();
    ssl = { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}) };
  }
  return { connectionString: u.toString(), ...(ssl ? { ssl } : {}) };
}

/** Valida el nombre del rol de aplicación antes de interpolarlo (no admite parámetros en SET ROLE). */
export function quoteRole(role: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error("DB_APP_ROLE tiene un formato no válido.");
  return `"${role}"`;
}

/** Para guardas de scripts destructivos: ¿se puede considerar seguro? Solo hosts locales. */
export function assertLocalOnly(connectionString: string, what: string): DbTarget {
  const t = parseTarget(connectionString);
  if (!t.local || t.supabase) {
    throw new Error(`Rechazado: «${what}» solo puede ejecutarse contra un PostgreSQL local (destino: ${t.host}).`);
  }
  return t;
}
