import path from "node:path";
import { parseTarget } from "./db-config";

/**
 * Utilidades puras del respaldo (sin E/S), probadas en tests/unit/backup.test.ts.
 * Un respaldo contiene hashes de contraseña, auditoría y datos de negocio: es información SENSIBLE.
 */

/** ¿`child` es `parent` o está dentro de él? (compara rutas ya resueltas, sin distinguir mayúsculas en Windows) */
export function isInside(parent: string, child: string, platform: NodeJS.Platform = process.platform): boolean {
  const norm = (p: string) => (platform === "win32" ? path.win32.resolve(p).toLowerCase() : path.posix.resolve(p));
  const rel = (platform === "win32" ? path.win32 : path.posix).relative(norm(parent), norm(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** El destino de los respaldos NUNCA puede estar dentro del repositorio (se publicaría o versionaría por accidente). */
export function assertOutsideRepo(repoRoot: string, outDir: string, platform: NodeJS.Platform = process.platform): void {
  if (isInside(repoRoot, outDir, platform)) {
    throw new Error(
      "Rechazado: BACKUP_DIR está dentro del repositorio. Los respaldos contienen hashes de contraseña y datos de negocio; use una carpeta fuera del proyecto (p. ej. D:\\Respaldos\\HubCircular).",
    );
  }
}

export function backupFileName(now: Date, target: { database: string; local: boolean }): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
  const db = target.database.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `hubcircular-hc-${target.local ? "local" : "remoto"}-${db}-${stamp}.dump`;
}

export interface PgEnv {
  PGHOST: string;
  PGPORT: string;
  PGUSER: string;
  PGPASSWORD: string;
  PGDATABASE: string;
  PGSSLMODE: string;
  PGSSLROOTCERT?: string;
}

/**
 * Variables de entorno para pg_dump/pg_restore: la clave viaja por PGPASSWORD, nunca en los argumentos
 * (los argumentos son visibles en la lista de procesos).
 */
export function pgEnvFromUrl(connectionString: string, env: Record<string, string | undefined> = process.env): PgEnv {
  const t = parseTarget(connectionString);
  const u = new URL(connectionString);
  const mode = (env.DB_SSL ?? (t.local ? "disable" : "require")).trim().toLowerCase();
  if (!["disable", "require", "verify"].includes(mode)) throw new Error("DB_SSL debe ser disable, require o verify.");
  const out: PgEnv = {
    PGHOST: t.host,
    PGPORT: String(t.port),
    PGUSER: t.user,
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: t.database,
    PGSSLMODE: mode === "disable" ? "disable" : mode === "verify" ? "verify-full" : "require",
  };
  if (mode === "verify" && env.DB_SSL_CA_FILE?.trim()) out.PGSSLROOTCERT = env.DB_SSL_CA_FILE.trim();
  return out;
}

/** pg_dump no puede volcar un servidor de versión mayor que la suya. */
export function assertDumpClientCompatible(clientMajor: number, serverMajor: number): void {
  if (clientMajor < serverMajor) {
    throw new Error(
      `pg_dump ${clientMajor} es más antiguo que el servidor PostgreSQL ${serverMajor}: instale PostgreSQL ${serverMajor} (o superior) y apunte PG_DUMP_PATH a su pg_dump.`,
    );
  }
}

export function parsePgMajor(versionOutput: string): number {
  const m = /\(PostgreSQL\)\s+(\d+)/.exec(versionOutput) ?? /^\s*(\d+)/.exec(versionOutput);
  if (!m) throw new Error(`No se pudo leer la versión de «${versionOutput.trim()}».`);
  return Number(m[1]);
}
