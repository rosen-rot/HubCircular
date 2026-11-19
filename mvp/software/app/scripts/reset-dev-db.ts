import { Client } from "pg";
import { buildClientConfig, describeTarget, assertLocalOnly } from "../src/lib/db-config";
import { loadEnv } from "./env";

/**
 * SOLO PostgreSQL LOCAL de desarrollo: elimina el esquema hc.
 * Se niega SIEMPRE a actuar sobre un host que no sea local (incluido Supabase); no existe variable que lo anule.
 */
async function main() {
  loadEnv();
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL o DATABASE_URL.");
  const target = assertLocalOnly(url, "db:reset");
  console.log(`Destino: ${describeTarget(target)}`);
  const client = new Client(buildClientConfig(url));
  await client.connect();
  try {
    await client.query("drop schema if exists hc cascade");
    console.log("Esquema hc eliminado. Ejecute: npm run db:migrate && npm run db:seed");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
