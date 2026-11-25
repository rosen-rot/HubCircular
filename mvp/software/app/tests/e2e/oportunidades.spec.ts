import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { PASSWORDS } from "../helpers/db";

/** Iteración 5 · oportunidades de mejora: casos con evidencia, DEMO y real separados, accesibilidad. */
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
const SCOPE = "Cartón y papel (demo) · Cowork DEMO";

test.describe.configure({ mode: "serial" });

test.describe("oportunidades de mejora", () => {
  test.beforeAll(async () => {
    // Acumulación DEMO: 3 pesajes de 9 kg de cartón, el más antiguo hace 20 días (registrados con la función real).
    const c = new Client({ connectionString: dbUrl });
    await c.connect();
    try {
      const admin = (await c.query("select id from hc.profiles where email = $1", [USERS.admin[0]])).rows[0].id;
      for (const d of [20, 10, 3]) {
        await c.query("begin");
        await c.query("set local role hc_app");
        await c.query("select set_config('hc.actor_id', $1, true)", [admin]);
        await c.query("select * from hc.register_weighing($1, 'DEMO-Z01-EST01-CARTON', 9350, 350, $2, null, false, $3)", [
          admin, new Date(Date.now() - d * 86_400_000), crypto.randomUUID(),
        ]);
        await c.query("commit");
      }
    } finally {
      await c.end();
    }
  });

  test("DEMO: muestra el caso con umbral, observación, sugerencia y evidencia enlazada", async ({ page }) => {
    await login(page, "admin");
    await page.getByRole("link", { name: "Oportunidades", exact: true }).click();
    await expect(page).toHaveURL(/\/oportunidades$/);
    await page.getByRole("link", { name: "DEMO", exact: true }).click();
    await expect(page).toHaveURL(/origin=demo/);
    await expect(page.getByTestId("aviso-oportunidades")).toContainText("sugerencias para revisar");

    const rule = page.locator('[data-testid="regla"][data-rule="acumulacion"]');
    await expect(rule.getByTestId("umbral")).toContainText("20 kg o más");
    const caso = rule.getByTestId("caso").filter({ hasText: SCOPE });
    await expect(caso).toBeVisible();
    // Otras pruebas dejan lotes de cartón propios: se verifica la forma del hallazgo y que nuestro lote de hace 20 días está en la evidencia.
    await expect(caso).toContainText(/kg en inventario en \d+ lotes; el más antiguo lleva \d+ días\./);
    await expect(caso.getByTestId("evidencia")).toContainText("9,0 kg · 20 días");
    await expect(caso).toContainText("Sugerencia: Revisar la frecuencia de retiro");
    await caso.getByText(/Ver evidencia/).click();
    const link = caso.getByTestId("evidencia").getByRole("link").first();
    await expect(link).toHaveAttribute("href", /^\/lotes\//);
    await link.click();
    await expect(page).toHaveURL(/\/lotes\/[0-9a-f-]{36}/);

    // Cada regla sin casos lo dice explícitamente (no se oculta)
    for (const id of ["omitidas", "contaminacion"]) {
      const r = page.locator(`[data-testid="regla"][data-rule="${id}"]`);
      await page.goto("/oportunidades?origin=demo");
      await expect(r.getByTestId("umbral")).not.toBeEmpty();
    }
  });

  test("REAL (por defecto): nunca muestra casos DEMO", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/oportunidades");
    await expect(page.getByRole("link", { name: "Reales", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.locator("main")).not.toContainText(SCOPE);
    await expect(page.locator("main")).not.toContainText("Cowork DEMO");
  });

  test("Inicio resume las oportunidades del origen elegido", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/inicio?origin=demo");
    const card = page.getByTestId("tarjeta-oportunidades");
    await expect(card.getByTestId("oportunidades-total")).toContainText("Acumulación prolongada: ");
    await expect(card).toContainText(SCOPE);
    await expect(card.getByRole("link", { name: "Ver detalle y evidencia" })).toHaveAttribute("href", "/oportunidades?origin=demo");
    await page.goto("/inicio");
    await expect(page.getByTestId("tarjeta-oportunidades")).not.toContainText(SCOPE);
  });

  test("el lector también consulta las oportunidades", async ({ page }) => {
    await login(page, "reader");
    await page.getByRole("link", { name: "Oportunidades", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Oportunidades de mejora");
  });

  test("Ayuda: guía rápida del operador con enlaces a cada pantalla", async ({ page }) => {
    await login(page, "reader");
    await page.goto("/ayuda");
    const guia = page.getByTestId("guia-operador");
    await expect(guia.getByRole("heading", { name: "Guía rápida del operador" })).toBeVisible();
    await expect(guia.locator("ol > li")).toHaveCount(6);
    await expect(guia.getByRole("link", { name: "Ir a Registro" })).toHaveAttribute("href", "/registro");
    await expect(guia).toContainText("Confirmar cero");
    await page.getByRole("link", { name: "Guía rápida", exact: true }).click();
    await expect(page).toHaveURL(/#guia$/);
  });

  test("accesibilidad (axe-core) y sin desborde a 390 px", async ({ page }) => {
    await login(page, "admin");
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      for (const u of ["/oportunidades", "/oportunidades?origin=demo", "/inicio?origin=demo"]) {
        await page.goto(u);
        const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(r.violations, `${u} @${vp.width}`).toEqual([]);
        if (vp.width === 390) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `desborde ${u}`).toBeLessThanOrEqual(0);
      }
    }
  });
});
