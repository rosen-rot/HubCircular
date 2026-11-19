import { describe, expect, it } from "vitest";
import { assertDumpClientCompatible, assertOutsideRepo, backupFileName, isInside, localRestoreEnv, parsePgMajor, pgEnvFromUrl } from "@/lib/backup";
import { buildClientConfig } from "@/lib/db-config";

describe("respaldo: ubicación segura", () => {
  it("detecta rutas dentro del repositorio (POSIX)", () => {
    expect(isInside("/repo", "/repo/backups", "linux")).toBe(true);
    expect(isInside("/repo", "/repo", "linux")).toBe(true);
    expect(isInside("/repo", "/repo/../otro", "linux")).toBe(false);
    expect(isInside("/repo", "/repository", "linux")).toBe(false);
  });
  it("detecta rutas dentro del repositorio (Windows, sin distinguir mayúsculas)", () => {
    expect(isInside("D:\\Proyectos\\HubCircular", "d:\\proyectos\\hubcircular\\respaldos", "win32")).toBe(true);
    expect(isInside("D:\\Proyectos\\HubCircular", "D:\\Respaldos\\HubCircular", "win32")).toBe(false);
    expect(isInside("D:\\Proyectos\\HubCircular", "D:\\Proyectos\\HubCircular2", "win32")).toBe(false);
  });
  it("rechaza BACKUP_DIR dentro del repositorio y acepta uno externo", () => {
    expect(() => assertOutsideRepo("/repo", "/repo/respaldos", "linux")).toThrow(/dentro del repositorio/);
    expect(() => assertOutsideRepo("/repo", "/mnt/respaldos", "linux")).not.toThrow();
  });
});

describe("respaldo: nombre y entorno", () => {
  it("nombre con fecha UTC y sin caracteres peligrosos", () => {
    const n = backupFileName(new Date(Date.UTC(2026, 10, 19, 3, 4, 5)), { database: "post gres;rm", local: false });
    expect(n).toBe("hubcircular-hc-remoto-post_gres_rm-20261119-030405Z.dump");
  });
  it("la clave va en PGPASSWORD (decodificada) y el TLS por defecto es require en remoto", () => {
    const e = pgEnvFromUrl("postgresql://postgres.abc:p%40ss%2Fw@aws-1-sa-east-1.pooler.supabase.com:5432/postgres", {});
    expect(e).toMatchObject({ PGHOST: "aws-1-sa-east-1.pooler.supabase.com", PGPORT: "5432", PGUSER: "postgres.abc", PGPASSWORD: "p@ss/w", PGSSLMODE: "require" });
  });
  it("local sin TLS; verify usa verify-full y el CA indicado; valor inválido falla", () => {
    expect(pgEnvFromUrl("postgresql://u:p@127.0.0.1:54329/hc_dev", {}).PGSSLMODE).toBe("disable");
    const v = pgEnvFromUrl("postgresql://u:p@db.x.supabase.co/postgres", { DB_SSL: "verify", DB_SSL_CA_FILE: "C:\\ca.crt" });
    expect(v).toMatchObject({ PGSSLMODE: "verify-full", PGSSLROOTCERT: "C:\\ca.crt" });
    expect(() => pgEnvFromUrl("postgresql://u:p@h/db", { DB_SSL: "xx" })).toThrow(/DB_SSL/);
  });
});

describe("prueba de restauración: TLS del destino local", () => {
  it("ignora DB_SSL=require/verify del .env.local (pensado para Supabase) y conecta sin TLS", () => {
    const url = "postgres://postgres@127.0.0.1:54329/hc_restore_test";
    for (const DB_SSL of ["require", "verify"]) {
      const env = localRestoreEnv({ DB_SSL, DB_SSL_CA_FILE: "C:\\ca.crt", OTRA: "x" });
      expect(env.OTRA).toBe("x");
      expect(pgEnvFromUrl(url, env).PGSSLMODE).toBe("disable");
      expect(pgEnvFromUrl(url, env).PGSSLROOTCERT).toBeUndefined();
      expect(buildClientConfig(url, env).ssl).toBeUndefined();
    }
    // sin el ajuste, DB_SSL=require habría exigido TLS al servidor local (el fallo observado)
    expect(buildClientConfig(url, { DB_SSL: "require" }).ssl).toBeTruthy();
  });
});

describe("respaldo: versiones de pg_dump", () => {
  it("rechaza un cliente más antiguo que el servidor", () => {
    expect(() => assertDumpClientCompatible(16, 17)).toThrow(/más antiguo/);
    expect(() => assertDumpClientCompatible(17, 17)).not.toThrow();
    expect(() => assertDumpClientCompatible(18, 17)).not.toThrow();
  });
  it("lee la versión mayor de la salida de --version", () => {
    expect(parsePgMajor("pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)")).toBe(16);
    expect(parsePgMajor("pg_dump (PostgreSQL) 17.2")).toBe(17);
    expect(() => parsePgMajor("nada")).toThrow();
  });
});
