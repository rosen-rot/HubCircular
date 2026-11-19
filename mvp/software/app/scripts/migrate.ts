import { Client } from "pg";
import { runMigrations } from "../src/lib/migrator";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL o DATABASE_URL (ver .env.example).");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
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
