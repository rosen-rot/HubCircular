import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { localRestoreEnv, pgEnvFromUrl } from "../src/lib/backup";
import { assertLocalOnly, buildClientConfig, describeTarget } from "../src/lib/db-config";
import { loadEnv } from "./env";
import { collectInventory, type Manifest } from "./backup-inventory";

/**
 * npm run db:restore-check -- <respaldo.dump> — prueba de restauración REAL en un PostgreSQL LOCAL y VACÍO.
 *
 *  · Destino: RESTORE_TEST_DATABASE_URL (obligatorio). Se niega a actuar sobre hosts no locales (incluido Supabase)
 *    y sobre una base que ya tenga el esquema hc: nunca borra ni sobrescribe nada.
 *  · Verifica: checksum del archivo contra el manifiesto, restauración sin errores, mismas tablas con las mismas
 *    filas, mismas migraciones, mismas políticas RLS y funciones, mismo estado de RLS por tabla, concesiones clave y saldos no negativos.
 *  · Los roles anon / authenticated / hc_app se crean (NOLOGIN) en el servidor local si faltan, porque las
 *    concesiones del esquema los referencian (en Supabase ya existen).
 */

type Level = "OK" | "ERROR";
let errors = 0;
const line = (l: Level, m: string) => {
  if (l === "ERROR") errors++;
  console.log(`  [${l}] ${m}`);
};

async function main() {
  loadEnv();
  const file = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (!file) throw new Error("Uso: npm run db:restore-check -- <ruta-al-respaldo.dump>");
  const dumpPath = path.resolve(file);
  if (!existsSync(dumpPath)) throw new Error(`No existe ${dumpPath}`);
  const manifestPath = `${dumpPath}.manifest.json`;
  if (!existsSync(manifestPath)) throw new Error("Falta el manifiesto (.manifest.json) junto al respaldo.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  const url = process.env.RESTORE_TEST_DATABASE_URL?.trim();
  if (!url) throw new Error("Defina RESTORE_TEST_DATABASE_URL con una base LOCAL vacía (p. ej. postgresql://postgres:clave@127.0.0.1:5432/hc_restore_test).");
  const target = assertLocalOnly(url, "db:restore-check");
  console.log(`Respaldo: ${manifest.dumpFile} (${manifest.createdAtUtc}) · origen: ${manifest.target}`);
  console.log(`Prueba de restauración en: ${describeTarget(target)}`);

  const sum = createHash("sha256").update(readFileSync(dumpPath)).digest("hex");
  if (sum === manifest.dumpSha256) line("OK", "Checksum del archivo coincide con el manifiesto.");
  else line("ERROR", "El checksum del archivo NO coincide con el manifiesto (archivo alterado o dañado).");
  if (errors) process.exit(1);

  const restoreEnv = localRestoreEnv();
  const client = new Client(buildClientConfig(url, restoreEnv));
  await client.connect();
  try {
    const has = await client.query<{ n: number }>("select count(*)::int as n from pg_namespace where nspname = 'hc'");
    if (has.rows[0]!.n > 0) throw new Error("La base de prueba ya tiene el esquema hc. Use una base vacía (no se borra nada automáticamente).");
    for (const r of ["anon", "authenticated", "hc_app"]) {
      await client.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${r}') then create role "${r}" nologin; end if; end $$`);
    }
  } finally {
    await client.end();
  }

  const restore = spawnSync(process.env.PG_RESTORE_PATH?.trim() || "pg_restore", ["--no-owner", "--exit-on-error", "--dbname", pgEnvFromUrl(url, restoreEnv).PGDATABASE, dumpPath], {
    env: { ...process.env, ...pgEnvFromUrl(url, restoreEnv) },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (restore.status !== 0) throw new Error("pg_restore falló; la base de prueba quedó parcialmente poblada (descártela).");
  line("OK", "pg_restore terminó sin errores.");

  const c2 = new Client(buildClientConfig(url, restoreEnv));
  await c2.connect();
  try {
    await c2.query("begin read only");
    const inv = await collectInventory(c2);
    const missing = Object.keys(manifest.tables).filter((t) => !(t in inv.tables));
    const extra = Object.keys(inv.tables).filter((t) => !(t in manifest.tables));
    if (!missing.length && !extra.length) line("OK", `${Object.keys(inv.tables).length} tablas restauradas (mismas que el origen).`);
    else line("ERROR", `Tablas distintas. Faltan: ${missing.join(", ") || "—"}; sobran: ${extra.join(", ") || "—"}.`);
    const diffs = Object.entries(manifest.tables).filter(([t, n]) => inv.tables[t] !== n).map(([t, n]) => `${t}: origen ${n} · restaurado ${inv.tables[t]}`);
    const rows = Object.values(inv.tables).reduce((a, b) => a + b, 0);
    if (!diffs.length) line("OK", `Conteo de filas idéntico en todas las tablas (${rows} filas).`);
    else line("ERROR", `Conteos distintos (si el origen recibió escrituras tras el respaldo, repita el respaldo):\n      ${diffs.join("\n      ")}`);
    if (JSON.stringify(inv.migrations) === JSON.stringify(manifest.migrations)) line("OK", `${inv.migrations.length} migraciones registradas (idénticas).`);
    else line("ERROR", "La lista de migraciones restauradas difiere del origen.");
    if (inv.policies === manifest.policies) line("OK", `${inv.policies} políticas RLS restauradas.`);
    else line("ERROR", `Políticas RLS: origen ${manifest.policies} · restaurado ${inv.policies}.`);
    if (inv.functions === manifest.functions) line("OK", `${inv.functions} funciones restauradas.`);
    else line("ERROR", `Funciones: origen ${manifest.functions} · restaurado ${inv.functions}.`);

    if (JSON.stringify(inv.tablesWithoutRls) === JSON.stringify(manifest.tablesWithoutRls)) {
      line("OK", `RLS idéntico al origen: activo en ${Object.keys(inv.tables).length - inv.tablesWithoutRls.length} tablas; sin RLS solo ${inv.tablesWithoutRls.join(", ") || "ninguna"}.`);
    } else {
      line("ERROR", `Tablas sin RLS distintas al origen (origen: ${manifest.tablesWithoutRls.join(", ") || "ninguna"}; restaurado: ${inv.tablesWithoutRls.join(", ") || "ninguna"}).`);
    }

    const priv = await c2.query<{ ok: boolean; anon: boolean }>(
      `select has_schema_privilege('hc_app','hc','usage') as ok,
              has_table_privilege('anon','hc.profiles','select') as anon`,
    );
    if (priv.rows[0]!.ok && !priv.rows[0]!.anon) line("OK", "Concesiones restauradas: hc_app usa el esquema y anon no lee profiles.");
    else line("ERROR", "Las concesiones no se restauraron como se esperaba (hc_app/anon).");

    if ("batch_location_balances" in inv.tables) {
      const neg = await c2.query<{ n: number }>("select count(*)::int as n from hc.batch_location_balances where balance_g < 0");
      if (neg.rows[0]!.n === 0) line("OK", "Sin saldos de inventario negativos.");
      else line("ERROR", `${neg.rows[0]!.n} saldos negativos tras restaurar.`);
    }
    await c2.query("rollback");
  } finally {
    await c2.end();
  }

  if (errors) {
    console.error(`\nPrueba de restauración FALLIDA (${errors} error/es). No confíe en este respaldo.`);
    process.exit(1);
  }
  console.log("\nPrueba de restauración OK. Descarte la base de prueba cuando termine (drop database …); este script no la borra.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
