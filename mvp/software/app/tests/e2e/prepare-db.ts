import { Client } from "pg";
import { seedDemo } from "../../db/seed/demo";
import { runMigrations } from "../../src/lib/migrator";
import { PASSWORDS } from "../helpers/db";
import { assertSafeTestUrl } from "../helpers/guard";

const E2E_DB = process.env.E2E_DB_NAME ?? "hc_e2e";
if (!/^hc_e2e[a-z_]*$/.test(E2E_DB)) throw new Error("E2E_DB_NAME no válido");

(async () => {
  const adminUrl = assertSafeTestUrl(process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres");
  const root = new Client({ connectionString: adminUrl });
  await root.connect();
  await root.query(`drop database if exists ${E2E_DB} with (force)`);
  await root.query(`create database ${E2E_DB}`);
  await root.end();
  const c = new Client({ connectionString: adminUrl.replace(/\/[^/]*$/, `/${E2E_DB}`) });
  await c.connect();
  await runMigrations(c);
  await seedDemo(c, { passwords: PASSWORDS, fastHash: true });
  await c.end();
  console.log("BD E2E lista");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
