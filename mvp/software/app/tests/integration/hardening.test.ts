import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planMigrations, runMigrations } from "../../src/lib/migrator";
import { ADMIN_URL } from "../helpers/db";

/**
 * Simula lo que hace Supabase: privilegios por defecto que otorgan acceso a anon/authenticated sobre objetos nuevos.
 * Se aplican 0001–0005, se concede acceso indebido y se comprueba que 0006 lo retira.
 */
const name = `hc_test_${randomBytes(5).toString("hex")}`;
let admin: Client;

beforeAll(async () => {
  const root = new Client({ connectionString: ADMIN_URL });
  await root.connect();
  await root.query(`create database ${name}`);
  await root.end();
  admin = new Client({ connectionString: ADMIN_URL.replace(/\/[^/]*$/, `/${name}`) });
  await admin.connect();
});

afterAll(async () => {
  await admin.end();
  const root = new Client({ connectionString: ADMIN_URL });
  await root.connect();
  await root.query(`drop database if exists ${name} with (force)`);
  await root.query("drop role if exists hc_mig_noadmin");
  await root.end();
});

describe("0006 · endurecimiento", () => {
  it("retira privilegios de anon/authenticated concedidos tras 0005 y no afecta a hc_app", async () => {
    const src = path.join(process.cwd(), "db", "migrations");
    const partial = mkdtempSync(path.join(tmpdir(), "hcmig-"));
    for (const f of readdirSync(src).filter((f) => /^000[1-5]_/.test(f))) cpSync(path.join(src, f), path.join(partial, f));
    await runMigrations(admin, partial);

    // Simula privilegios por defecto de la plataforma
    await admin.query("grant usage on schema hc to anon, authenticated");
    await admin.query("grant select, insert on all tables in schema hc to anon, authenticated");
    await admin.query("grant execute on all functions in schema hc to anon, authenticated, public");
    const before = await admin.query("select has_table_privilege('anon','hc.weighings','SELECT') as a, has_schema_privilege('authenticated','hc','USAGE') as b");
    expect(before.rows[0]).toEqual({ a: true, b: true });

    const plan = await planMigrations(admin);
    // Pendientes: 0006 y toda migración posterior (las posteriores deben dejar también cerrados anon/authenticated).
    expect(plan.pending).toEqual(readdirSync(src).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f >= "0006").sort());
    await runMigrations(admin);

    const exposed = await admin.query(
      `select
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'hc' and c.relkind in ('r','p')
           cross join unnest(array['anon','authenticated']) r
           where has_table_privilege(r, c.oid, 'SELECT') or has_table_privilege(r, c.oid, 'INSERT')) as tables,
         (select count(*) from pg_proc f join pg_namespace n on n.oid = f.pronamespace and n.nspname = 'hc'
           cross join unnest(array['anon','authenticated']) r where has_function_privilege(r, f.oid, 'EXECUTE')) as funcs,
         has_schema_privilege('anon','hc','USAGE') or has_schema_privilege('authenticated','hc','USAGE') as schema`,
    );
    expect(Number(exposed.rows[0].tables)).toBe(0);
    expect(Number(exposed.rows[0].funcs)).toBe(0);
    expect(exposed.rows[0].schema).toBe(false);

    const app = await admin.query(
      `select has_schema_privilege('hc_app','hc','USAGE') as usage,
              has_table_privilege('hc_app','hc.weighings','SELECT') as sel,
              has_function_privilege('hc_app','hc.register_weighing(uuid,text,bigint,bigint,timestamptz,text,boolean,uuid)','EXECUTE') as fn`,
    );
    expect(app.rows[0]).toEqual({ usage: true, sel: true, fn: true });
  });

  it("es idempotente: volver a ejecutarla no falla", async () => {
    const sql = (await import("node:fs")).readFileSync(path.join(process.cwd(), "db", "migrations", "0006_managed_postgres_hardening.sql"), "utf8");
    await expect(admin.query(sql)).resolves.toBeDefined();
  });

  it("falla de forma explícita si el rol que migra no es miembro de hc_app (rol sin superusuario)", async () => {
    await admin.query("drop role if exists hc_mig_noadmin");
    await admin.query("create role hc_mig_noadmin login nosuperuser noinherit");
    await admin.query("grant usage on schema hc to hc_mig_noadmin");
    const sql = (await import("node:fs")).readFileSync(path.join(process.cwd(), "db", "migrations", "0006_managed_postgres_hardening.sql"), "utf8");
    await admin.query("begin");
    try {
      await admin.query("set local role hc_mig_noadmin");
      await expect(admin.query(sql)).rejects.toThrow(/no es miembro de hc_app/);
    } finally {
      await admin.query("rollback");
    }
  });
});
