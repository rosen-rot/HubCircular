import { createHash } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { assertDumpClientCompatible, assertOutsideRepo, backupFileName, parsePgMajor, pgEnvFromUrl } from "../src/lib/backup";
import { buildClientConfig, describeTarget, parseTarget } from "../src/lib/db-config";
import { collectInventory, type Manifest } from "./backup-inventory";
import { loadEnv } from "./env";

/**
 * npm run db:backup — respaldo lógico del esquema `hc` (formato custom de pg_dump) + manifiesto con conteos.
 *
 *  · SOLO LECTURA sobre la base (pg_dump + consultas `read only`); no modifica nada.
 *  · Escribe FUERA del repositorio (BACKUP_DIR obligatorio): el respaldo contiene hashes de contraseña,
 *    auditoría y datos de negocio. Trátelo como información sensible; no lo suba a GitHub ni lo envíe por correo.
 *  · La clave de la base viaja por variable de entorno del proceso hijo (no en los argumentos).
 *  · Usa MIGRATION_DATABASE_URL (conexión directa 5432 o pooler en modo sesión). No sirve el puerto 6543.
 */

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("error", reject).on("end", () => resolve(h.digest("hex")));
  });
}

async function main() {
  loadEnv();
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL en .env.local (ver docs/19).");
  const target = parseTarget(url);
  if (target.transactionPooler) throw new Error("El puerto 6543 (pooler en modo transacción) no sirve para pg_dump. Use la conexión directa o el pooler en modo sesión (5432).");

  const outDirRaw = process.env.BACKUP_DIR?.trim();
  if (!outDirRaw) throw new Error("Defina BACKUP_DIR en .env.local con una carpeta FUERA del proyecto (p. ej. BACKUP_DIR=D:\\Respaldos\\HubCircular).");
  const outDir = path.resolve(outDirRaw);
  assertOutsideRepo(process.cwd(), outDir);
  mkdirSync(outDir, { recursive: true });

  console.log(`Destino: ${describeTarget(target)}`);
  const pgDump = process.env.PG_DUMP_PATH?.trim() || "pg_dump";
  const ver = spawnSync(pgDump, ["--version"], { encoding: "utf8" });
  if (ver.error || ver.status !== 0) throw new Error(`No se encontró pg_dump («${pgDump}»). Instale las herramientas de cliente de PostgreSQL o defina PG_DUMP_PATH.`);
  const clientMajor = parsePgMajor(ver.stdout);

  const client = new Client(buildClientConfig(url));
  await client.connect();
  let inventory: Awaited<ReturnType<typeof collectInventory>>;
  let serverVersion: string;
  try {
    await client.query("begin read only isolation level repeatable read");
    const sv = await client.query<{ v: string; num: number }>("select current_setting('server_version') as v, current_setting('server_version_num')::int as num");
    serverVersion = sv.rows[0]!.v;
    assertDumpClientCompatible(clientMajor, Math.floor(sv.rows[0]!.num / 10000));
    inventory = await collectInventory(client);
    await client.query("rollback");
  } finally {
    await client.end();
  }

  const fileName = backupFileName(new Date(), target);
  const finalPath = path.join(outDir, fileName);
  const partial = `${finalPath}.partial`;
  if (existsSync(finalPath)) throw new Error(`Ya existe ${fileName}; no se sobrescribe.`);

  console.log(`Generando respaldo del esquema hc con ${ver.stdout.trim()} …`);
  const dump = spawnSync(pgDump, ["--format=custom", "--schema=hc", "--no-owner", "--serializable-deferrable", `--file=${partial}`], {
    env: { ...process.env, ...pgEnvFromUrl(url) },
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (dump.status !== 0) throw new Error("pg_dump falló; no se generó el respaldo (revise el mensaje anterior).");

  const toc = spawnSync(process.env.PG_RESTORE_PATH?.trim() || "pg_restore", ["--list", partial], { encoding: "utf8" });
  if (toc.status !== 0) throw new Error("El archivo generado no pudo leerse con pg_restore --list; se conserva como .partial para diagnóstico.");
  const tocEntries = toc.stdout.split(/\r?\n/).filter((l) => l && !l.startsWith(";")).length;

  renameSync(partial, finalPath);
  try {
    chmodSync(finalPath, 0o600);
  } catch {
    /* en Windows no aplica */
  }
  const manifest: Manifest = {
    version: 1,
    createdAtUtc: new Date().toISOString(),
    target: describeTarget(target),
    serverVersion,
    dumpFile: fileName,
    dumpBytes: statSync(finalPath).size,
    dumpSha256: await sha256(finalPath),
    tocEntries,
    ...inventory,
  };
  writeFileSync(`${finalPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  console.log(`\nRespaldo OK: ${finalPath}`);
  console.log(`  ${manifest.dumpBytes} bytes · sha256 ${manifest.dumpSha256.slice(0, 16)}… · ${tocEntries} objetos · ${Object.keys(manifest.tables).length} tablas · ${rows} filas · ${manifest.migrations.length} migraciones`);
  console.log("  Contiene hashes de contraseña y datos de negocio: guárdelo cifrado/en un lugar privado y no lo versione.");
  console.log("  Siguiente paso recomendado: npm run db:restore-check -- <archivo.dump> contra una base LOCAL vacía.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
