import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_DB = "hc_e2e";
const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const appUrl = adminUrl.replace(/\/[^/]*$/, `/${E2E_DB}`);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", locale: "es-CL", timezoneId: "America/Santiago" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalTeardown: "./tests/e2e/global-teardown.ts",
  webServer: {
    // Prepara una BD limpia (migraciones + semilla DEMO) y levanta la compilación de producción.
    command: `npx tsx tests/e2e/prepare-db.ts && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: appUrl, DB_APP_ROLE: "hc_app", SESSION_COOKIE_SECURE: "false", TEST_DATABASE_URL: adminUrl, NODE_ENV: "production" },
  },
});
