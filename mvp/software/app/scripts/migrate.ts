import { Client } from "pg";
import { buildClientConfig, describeTarget, parseTarget } from "../src/lib/db-config";
import { planMigrations, runMigrations } from "../src/lib/migrator";
import { loadEnv } from "./env";

/**
 * npm run db:migrate              → aplica migraciones pendientes
 * npm run db:migrate -- --dry-run → solo informa (no escribe nada)
 *
 * Contra una BD que NO es local (p. ej. Supabase) exige confirmación explícita:
 *   CONFIRM_REMOTE_MIGRATION=<host> (el host exacto que imprime este script) o --dry-run.
 * Requiere conexión directa o «session pooler» (puerto 5432): usa un advisory lock de sesión.
 */
async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL o DATABASE_URL en .env.local (ver .env.example).");
  const target = parseTarget(url);
  console.log(`Destino: ${describeTarget(target)}`);
  if (target.transactionPooler) {
    throw new Error("El puerto 6543 es el pooler en modo transacción: no sirve para migrar. Use la conexión directa o el «session pooler» (puerto 5432).");
  }
  if (!target.local && !dryRun && process.env.CONFIRM_REMOTE_MIGRATION !== target.host) {
    throw new Error(
      `Destino remoto: para aplicar migraciones defina CONFIRM_REMOTE_MIGRATION=${target.host} (confirmación explícita). ` +
        "Revise antes con: npm run db:check y npm run db:migrate -- --dry-run",
    );
  }
  const client = new Client(buildClientConfig(url));
  await client.connect();
  try {
    if (dryRun) {
      const plan = await planMigrations(client);
      console.log(`Aplicadas (${plan.applied.length}): ${plan.applied.join(", ") || "ninguna"}`);
      console.log(`Pendientes (${plan.pending.length}): ${plan.pending.join(", ") || "ninguna"}`);
      if (plan.conflicts.length) console.log(`CONFLICTOS: ${plan.conflicts.join("; ")}`);
      console.log("Simulación: no se escribió nada.");
      return;
    }
    const { applied, skipped } = await runMigrations(client);
    console.log(`Migraciones aplicadas: ${applied.length ? applied.join(", ") : "ninguna nueva"}`);
    if (skipped.length) console.log(`Ya aplicadas: ${skipped.length}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
