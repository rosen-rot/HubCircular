import type { Client } from "pg";

export interface Manifest {
  version: 1;
  createdAtUtc: string;
  target: string;
  serverVersion: string;
  dumpFile: string;
  dumpBytes: number;
  dumpSha256: string;
  tocEntries: number;
  migrations: string[];
  tables: Record<string, number>;
  /** Tablas sin RLS en el origen (p. ej. schema_migrations, sin concesiones a roles de la aplicación). */
  tablesWithoutRls: string[];
  policies: number;
  functions: number;
}

export async function collectInventory(client: Client): Promise<Pick<Manifest, "migrations" | "tables" | "tablesWithoutRls" | "policies" | "functions">> {
  const migs = await client.query<{ name: string }>("select name from hc.schema_migrations order by name");
  const tabs = await client.query<{ t: string }>(
    "select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'hc' and c.relkind in ('r','p') order by 1",
  );
  const tables: Record<string, number> = {};
  for (const { t } of tabs.rows) {
    const r = await client.query<{ n: string }>(`select count(*)::text as n from hc."${t.replace(/"/g, '""')}"`);
    tables[t] = Number(r.rows[0]!.n);
  }
  const noRls = await client.query<{ t: string }>(
    "select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'hc' and c.relkind in ('r','p') and not c.relrowsecurity order by 1",
  );
  const pol = await client.query<{ n: number }>("select count(*)::int as n from pg_policies where schemaname = 'hc'");
  const fn = await client.query<{ n: number }>(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'hc'",
  );
  return { migrations: migs.rows.map((m) => m.name), tables, tablesWithoutRls: noRls.rows.map((r) => r.t), policies: pol.rows[0]!.n, functions: fn.rows[0]!.n };
}
