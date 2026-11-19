import { describe, expect, it } from "vitest";
import { assertLocalOnly, buildClientConfig, describeTarget, parseTarget, quoteRole } from "../../src/lib/db-config";

describe("parseTarget", () => {
  it("reconoce un host local", () => {
    const t = parseTarget("postgres://postgres@127.0.0.1:54329/hc");
    expect(t).toMatchObject({ host: "127.0.0.1", port: 54329, database: "hc", local: true, supabase: false, transactionPooler: false });
  });

  it("reconoce la conexión directa de Supabase y extrae la referencia", () => {
    const ref = "abcdefghijklmnopqrst";
    const t = parseTarget(`postgresql://postgres:x@db.${ref}.supabase.co:5432/postgres`);
    expect(t).toMatchObject({ supabase: true, local: false, transactionPooler: false, projectRef: ref });
  });

  it("reconoce el pooler y distingue el modo transacción (6543)", () => {
    const ref = "abcdefghijklmnopqrst";
    const session = parseTarget(`postgresql://postgres.${ref}:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`);
    const tx = parseTarget(`postgresql://postgres.${ref}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`);
    expect(session).toMatchObject({ supabase: true, transactionPooler: false, projectRef: ref });
    expect(tx.transactionPooler).toBe(true);
  });

  it("no considera Supabase a un host que solo lo contiene en el nombre", () => {
    expect(parseTarget("postgres://u:p@supabase.co.evil.example:5432/x").supabase).toBe(false);
  });

  it("rechaza URLs inválidas sin filtrar su contenido", () => {
    expect(() => parseTarget("no-es-url-SECRETO")).toThrow(/URL válida/);
    try {
      parseTarget("no-es-url-SECRETO");
    } catch (e) {
      expect((e as Error).message).not.toContain("SECRETO");
    }
  });

  it("describeTarget nunca incluye la contraseña", () => {
    const d = describeTarget(parseTarget("postgres://postgres:ClaveSuperSecreta@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"));
    expect(d).not.toContain("ClaveSuperSecreta");
    expect(d).toContain("Supabase");
  });
});

describe("buildClientConfig", () => {
  it("local: sin TLS por defecto", () => {
    expect(buildClientConfig("postgres://postgres@127.0.0.1:5432/x", {}).ssl).toBeUndefined();
  });

  it("remoto: TLS obligatorio por defecto y sin sslmode en la URL", () => {
    const c = buildClientConfig("postgres://u:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=disable", {});
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toContain("sslmode");
  });

  it("DB_SSL=verify valida el certificado", () => {
    const c = buildClientConfig("postgres://u:p@h.example:5432/x", { DB_SSL: "verify" });
    expect(c.ssl).toMatchObject({ rejectUnauthorized: true });
  });

  it("DB_SSL inválido falla", () => {
    expect(() => buildClientConfig("postgres://u:p@h.example/x", { DB_SSL: "yes" })).toThrow(/DB_SSL/);
  });

  it("conserva usuario y clave con caracteres especiales", () => {
    const c = buildClientConfig("postgres://us%40er:p%40ss%2Fw@h.example:5432/x", { DB_SSL: "disable" });
    const u = new URL(c.connectionString!);
    expect(decodeURIComponent(u.username)).toBe("us@er");
    expect(decodeURIComponent(u.password)).toBe("p@ss/w");
  });
});

describe("quoteRole / assertLocalOnly", () => {
  it("acepta nombres válidos y rechaza inyección", () => {
    expect(quoteRole("hc_app")).toBe('"hc_app"');
    expect(() => quoteRole('hc_app"; drop schema hc; --')).toThrow();
    expect(() => quoteRole("Hc App")).toThrow();
  });

  it("las acciones destructivas solo se permiten en local", () => {
    expect(() => assertLocalOnly("postgres://postgres@localhost:54329/x", "t")).not.toThrow();
    expect(() => assertLocalOnly("postgres://u:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", "t")).toThrow(/solo puede ejecutarse/);
    expect(() => assertLocalOnly("postgres://u:p@10.0.0.5:5432/x", "t")).toThrow();
  });
});
