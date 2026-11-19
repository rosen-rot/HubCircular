import { defineConfig, devices } from "@playwright/test";
import { assertSafeTestUrl } from "./tests/helpers/guard";

const PORT = 3100;
export const E2E_DB = "hc_e2e";
const adminUrl = assertSafeTestUrl(process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres");
const appUrl = adminUrl.replace(/\/[^/]*$/, `/${E2E_DB}`);
const SB_PORT = 3101;
const SB_DB = "hc_e2e_sb";
const GOTRUE_PORT = 54399;
const sbAppUrl = adminUrl.replace(/\/[^/]*$/, `/${SB_DB}`);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", locale: "es-CL", timezoneId: "America/Santiago" },
  projects: [
    { name: "chromium", testIgnore: /supabase-auth\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Modo AUTH_PROVIDER=supabase contra un servidor Auth SIMULADO (puerto 54399), BD y puerto propios.
    { name: "supabase-auth", testMatch: /supabase-auth\.spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${SB_PORT}` } },
  ],
  globalTeardown: "./tests/e2e/global-teardown.ts",
  webServer: [
    {
      // Prepara una BD limpia (migraciones + semilla DEMO) y levanta la compilación de producción.
      command: `npx tsx tests/e2e/prepare-db.ts && npx next start -H 127.0.0.1 -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { DATABASE_URL: appUrl, DB_APP_ROLE: "hc_app", SESSION_COOKIE_SECURE: "false", TEST_DATABASE_URL: adminUrl, NODE_ENV: "production" },
    },
    {
      command: "npx tsx tests/e2e/fake-gotrue-server.ts",
      url: `http://127.0.0.1:${GOTRUE_PORT}/__test/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx tsx tests/e2e/prepare-db.ts && npx next start -H 127.0.0.1 -p ${SB_PORT}`,
      url: `http://127.0.0.1:${SB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: sbAppUrl,
        E2E_DB_NAME: SB_DB,
        DB_APP_ROLE: "hc_app",
        SESSION_COOKIE_SECURE: "false",
        TEST_DATABASE_URL: adminUrl,
        NODE_ENV: "production",
        AUTH_PROVIDER: "supabase",
        SUPABASE_URL: `http://127.0.0.1:${GOTRUE_PORT}`,
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_FAKE_KEY_FOR_TESTS",
      },
    },
  ],
});
