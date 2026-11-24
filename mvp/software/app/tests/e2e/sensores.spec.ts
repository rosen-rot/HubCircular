import AxeBuilder from "@axe-core/playwright";
import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { PASSWORDS } from "../helpers/db";
import { deviceTokenPrefix, hashDeviceToken, newDeviceToken } from "../../src/modules/devices/token";

/** Revisión de diseño con datos simulados: estado del sensor y llenado (solo con capacidad) en Inicio y Contenedores. */
const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const dbUrl = adminUrl.replace(/\/[^/]*$/, "/hc_e2e");

const USERS = {
  admin: ["admin@demo.hubcircular.test", PASSWORDS.admin],
  operator: ["operador@demo.hubcircular.test", PASSWORDS.operator],
  reader: ["lector@demo.hubcircular.test", PASSWORDS.reader],
} as const;

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[who][0]);
  await page.getByLabel("Contraseña").fill(USERS[who][1]);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/inicio(\?|$)/);
}

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}
const business = async () =>
  (await sql<{ w: string; b: string; m: string }>("select (select count(*) from hc.weighings) w, (select count(*) from hc.batches) b, (select count(*) from hc.movements) m"))[0]!;

const CODE = "DEMO-Z01-EST01-PET";
const DEVICE = "E2E-SENSOR-PET";
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const token = newDeviceToken();
let before: { w: string; b: string; m: string };

test.describe.configure({ mode: "serial" });

test.describe("estado del sensor y llenado (datos simulados DEMO)", () => {
  test.beforeAll(async ({ baseURL }) => {
    before = await business();
    const [c] = await sql<{ id: string }>("select id from hc.containers where code = $1", [CODE]);
    const [a] = await sql<{ id: string }>("select id from hc.profiles where email = $1", [USERS.admin[0]]);
    await sql(
      `insert into hc.devices (device_code, name, container_id, token_hash, token_prefix, stale_after_minutes, data_origin, created_by)
       values ($1, 'Sensor PET E2E', $2, $3, $4, 15, 'demo', $5)`,
      [DEVICE, c!.id, hashDeviceToken(token), deviceTokenPrefix(token), a!.id],
    );
    const api = await pwRequest.newContext({ baseURL });
    const r = await api.post("/api/iot/v1/readings", {
      headers: { authorization: `Bearer ${token}` },
      data: {
        schemaVersion: 1, deviceId: DEVICE, messageId: crypto.randomUUID(), measuredAt: new Date().toISOString(),
        weightGrams: 3100, distanceMm: 210, fillPercent: 72, quality: "stable", firmwareVersion: "sim-0.1.0",
      },
    });
    expect(r.status()).toBe(202);
    await api.dispose();
  });

  test("Contenedores: sensor en línea y, sin capacidad, no muestra llenado", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/contenedores");
    await expect(page.getByTestId("aviso-llenado")).toContainText("no suman captación");
    const row = page.locator(`[data-testid="fila-contenedor"][data-code="${CODE}"]`);
    await expect(row.getByTestId("estado-sensor")).toHaveAttribute("data-state", "en_linea");
    await expect(row.getByTestId("estado-sensor")).toContainText("En línea");
    await expect(row.getByTestId("llenado")).toHaveText("Sin capacidad definida");
    await expect(row).not.toContainText("72 %");
    // Un contenedor sin dispositivo dice «Sin sensor» (se busca en la BD: otras pruebas crean dispositivos)
    const free = await sql<{ code: string }>("select c.code from hc.containers c where not exists (select 1 from hc.devices d where d.container_id = c.id) order by c.code limit 1");
    if (free[0]) {
      await expect(page.locator(`[data-testid="fila-contenedor"][data-code="${free[0].code}"]`).getByTestId("estado-sensor")).toHaveText("Sin sensor");
    }
  });

  test("el administrador define la capacidad y aparece el llenado con litros aproximados; vacío la quita", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/contenedores");
    await page.getByLabel("Contenedor", { exact: true }).selectOption({ label: `${CODE} · Cowork DEMO (DEMO)` });
    // Decimales: el navegador frena el envío (pattern); el servidor también los rechaza (pruebas unitarias e integración).
    await page.getByLabel("Capacidad (litros)").fill("12.5");
    await page.getByRole("button", { name: "Guardar capacidad" }).click();
    expect(await page.getByLabel("Capacidad (litros)").evaluate((el) => (el as HTMLInputElement).validity.patternMismatch)).toBe(true);
    await expect(page).not.toHaveURL(/ok=capacidad/);

    await page.getByLabel("Contenedor", { exact: true }).selectOption({ label: `${CODE} · Cowork DEMO (DEMO)` });
    await page.getByLabel("Capacidad (litros)").fill("120");
    await page.getByRole("button", { name: "Guardar capacidad" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Capacidad guardada" })).toBeVisible();
    const row = page.locator(`[data-testid="fila-contenedor"][data-code="${CODE}"]`);
    await expect(row.getByTestId("capacidad")).toHaveText("120 L");
    await expect(row.getByTestId("llenado")).toHaveAttribute("data-kind", "ok");
    await expect(row.getByTestId("llenado")).toContainText("72 %");
    await expect(row.getByTestId("llenado")).toContainText("≈ 86 de 120 L");
    const audit = await sql<{ n: string }>("select count(*) n from hc.audit_logs where entity = 'container' and action = 'set_capacity'");
    expect(Number(audit[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  test("Inicio: con DEMO muestra el sensor y el llenado; con datos reales no los mezcla", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/inicio?origin=demo");
    const card = page.getByTestId("tarjeta-sensores");
    await expect(card).toContainText("Sensores de contenedores");
    await expect(card.getByText("DEMO", { exact: true })).toBeVisible();
    const row = card.locator(`[data-testid="fila-sensor"][data-code="${CODE}"]`);
    await expect(row.getByTestId("estado-sensor")).toContainText("En línea");
    await expect(row.getByTestId("llenado")).toContainText("72 %");
    await expect(card.getByTestId("resumen-sensores")).toContainText("En línea:");

    await page.goto("/inicio");
    const real = page.getByTestId("tarjeta-sensores");
    await expect(real.getByTestId("sin-sensores")).toContainText("Aún no hay sensores instalados en contenedores reales");
    await expect(real.locator('[data-testid="fila-sensor"]')).toHaveCount(0);
    await expect(real).not.toContainText(CODE);
  });

  test("sensor desactualizado: se marca y el llenado queda en gris como último dato conocido", async ({ page }) => {
    await sql("update hc.devices set last_seen_at = now() - interval '2 hours' where device_code = $1", [DEVICE]);
    await login(page, "admin");
    await page.goto("/contenedores");
    const row = page.locator(`[data-testid="fila-contenedor"][data-code="${CODE}"]`);
    await expect(row.getByTestId("estado-sensor")).toHaveAttribute("data-state", "desactualizado");
    await expect(row.getByTestId("estado-sensor")).toContainText("Dato desactualizado");
    await expect(row.getByTestId("llenado")).toHaveAttribute("data-stale", "true");
    await expect(row.getByTestId("llenado")).toContainText("Último dato conocido");
    await page.goto("/inicio?origin=demo");
    await expect(page.getByTestId("tarjeta-sensores").getByTestId("resumen-sensores").locator('[data-state="desactualizado"]')).toContainText("1");
  });

  test("operador y lector ven estado y llenado, pero no el formulario de capacidad", async ({ page }) => {
    for (const who of ["operator", "reader"] as const) {
      await page.context().clearCookies();
      await login(page, who);
      await page.goto("/contenedores");
      await expect(page.locator(`[data-testid="fila-contenedor"][data-code="${CODE}"]`).getByTestId("llenado")).toContainText("72 %");
      await expect(page.getByRole("button", { name: "Guardar capacidad" })).toHaveCount(0);
    }
  });

  test("accesibilidad y sin desborde a 390 px en Inicio (DEMO) y Contenedores", async ({ page }) => {
    await login(page, "admin");
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      for (const u of ["/inicio?origin=demo", "/contenedores"]) {
        await page.goto(u);
        const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(r.violations, `${u} @${vp.width}`).toEqual([]);
        if (vp.width === 390) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `desborde ${u}`).toBeLessThanOrEqual(0);
      }
    }
  });

  test("quitar la capacidad oculta el llenado; la telemetría no creó pesajes, lotes ni movimientos", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/contenedores");
    await page.getByLabel("Contenedor", { exact: true }).selectOption({ label: `${CODE} · Cowork DEMO (DEMO) · 120 L` });
    await page.getByLabel("Capacidad (litros)").fill("");
    await page.getByRole("button", { name: "Guardar capacidad" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Capacidad quitada" })).toBeVisible();
    await expect(page.locator(`[data-testid="fila-contenedor"][data-code="${CODE}"]`).getByTestId("llenado")).toHaveText("Sin capacidad definida");
    expect(await business()).toEqual(before);
  });
});
