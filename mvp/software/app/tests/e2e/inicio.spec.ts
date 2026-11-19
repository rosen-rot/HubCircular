import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { PASSWORDS } from "../helpers/db";

const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const dbUrl = adminUrl.replace(/\/[^/]*$/, "/hc_e2e");

const USERS = {
  admin: ["admin@demo.hubcircular.test", PASSWORDS.admin],
  reader: ["lector@demo.hubcircular.test", PASSWORDS.reader],
} as const;

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[who][0]);
  await page.getByLabel("Contraseña").fill(USERS[who][1]);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/inicio(\?|$)/);
}

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test.describe.configure({ mode: "serial" });

test.describe("inicio (dashboard)", () => {
  test.beforeAll(async () => {
    // Dos pesajes DEMO de hoy (hora actual), registrados por la misma función transaccional que usa la aplicación.
    const c = new Client({ connectionString: dbUrl });
    await c.connect();
    try {
      const admin = (await c.query("select id from hc.profiles where email = 'admin@demo.hubcircular.test'")).rows[0].id as string;
      await c.query("begin");
      await c.query("select set_config('hc.actor_id', $1, true)", [admin]);
      for (const [code, gross, tare] of [["DEMO-Z01-EST01-CARTON", 6350, 350], ["DEMO-Z01-EST01-PET", 2350, 350]] as const) {
        await c.query("select * from hc.register_weighing($1,$2,$3,$4,now(),null,false,$5)", [admin, code, gross, tare, crypto.randomUUID()]);
      }
      await c.query("commit");
    } finally {
      await c.end();
    }
  });

  test("tras ingresar se llega al Inicio; sin pesajes reales avisa y no mezcla los DEMO", async ({ page }) => {
    await login(page, "admin");
    await expect(page.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();
    await expect(page.getByText("Aún no hay pesajes reales registrados en su ámbito")).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrar pesaje" })).toBeVisible();
    await expect(page.getByRole("link", { name: "30 días" })).toHaveAttribute("aria-current", "true");
  });

  test("con datos DEMO: tarjetas, anillo por material, tendencia (kg / n.º de pesajes) y últimos pesajes", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/inicio?origin=demo&days=7");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("DEMO");
    await expect(page.getByText("Datos de demostración.")).toBeVisible();
    const kpi = (label: string) => page.locator("h3", { hasText: label }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    // otras pruebas también registran pesajes de hoy: se exige al menos los dos de esta
    const today = Number(/Hoy:\s*(\d+)/.exec((await kpi("Pesajes").textContent()) ?? "")?.[1]);
    expect(today).toBeGreaterThanOrEqual(2);
    await expect(kpi("Reciclable captado")).toContainText(/kg/);
    await expect(page.getByRole("img", { name: /Reparto del reciclable captado por material/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Tendencia diaria en kg/ })).toBeVisible();
    await page.getByRole("link", { name: "N.º de pesajes" }).click();
    await expect(page).toHaveURL(/serie=n/);
    await expect(page.getByRole("img", { name: /Tendencia diaria en pesajes/ })).toBeVisible();
    const recent = page.getByRole("table", { name: "Los 6 pesajes más recientes" });
    await expect(recent.getByRole("row")).toHaveCount(7); // encabezado + los 6 más recientes
    await expect(recent.getByRole("rowheader").first()).toHaveText(/^P-\d{6}$/);
    // el período y el origen se conservan al cambiar de serie
    await expect(page).toHaveURL(/days=7/);
    await expect(page).toHaveURL(/origin=demo/);
  });

  test("valores inválidos en la URL vuelven a los valores por defecto sin fallar", async ({ page }) => {
    await login(page, "admin");
    const res = await page.goto("/inicio?days=999&origin=%27%3B--&serie=zz");
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/^Del \d{2}-\d{2}-\d{4} al /)).toBeVisible();
    await expect(page.getByRole("link", { name: "30 días" })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("link", { name: "Reales" })).toHaveAttribute("aria-current", "true");
  });

  test("lector: ve el Inicio y el tablero, pero no el botón de registrar", async ({ page }) => {
    await login(page, "reader");
    await expect(page.getByRole("heading", { level: 1, name: "Inicio" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrar pesaje" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Registro", exact: true })).toHaveCount(0);
  });

  test("accesibilidad (axe-core) del Inicio en escritorio y en teléfono", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/inicio?origin=demo");
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/inicio?origin=demo");
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  });

  test("teléfono (390 px): el menú está plegado, se abre con el botón, navega y se cierra; sin desplazamiento horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "admin");
    await page.goto("/inicio?origin=demo");
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav).toBeHidden();
    const toggle = page.getByRole("button", { name: "Abrir menú" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    await nav.getByRole("link", { name: "Ayuda" }).click();
    await expect(page).toHaveURL(/\/ayuda/);
    await expect(nav).toBeHidden();
    await page.goto("/inicio?origin=demo");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
