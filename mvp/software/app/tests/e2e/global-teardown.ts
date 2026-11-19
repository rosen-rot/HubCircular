import { Client } from "pg";
import { assertSafeTestUrl } from "../helpers/guard";

export default async function globalTeardown() {
  const adminUrl = assertSafeTestUrl(process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres");
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  await c.query("drop database if exists hc_e2e with (force)");
  await c.query("drop database if exists hc_e2e_sb with (force)");
  await c.end();
}
