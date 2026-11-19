import { Client } from "pg";
import { loadEnv } from "./env";

/** SOLO desarrollo local: elimina el esquema hc. Rechaza hosts que no sean locales salvo FORCE_RESET=true. */
async function main() {
  loadEnv();
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL o DATABASE_URL.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.FORCE_RESET !== "true") {
    throw new Error(`Rechazado: ${host} no es un host local. Este comando borra TODOS los datos del esquema hc.`);
  }
  const client = new Client({ connectionString: url });
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
