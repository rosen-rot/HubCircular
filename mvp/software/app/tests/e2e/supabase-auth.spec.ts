import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PASSWORDS } from "../helpers/db";

/**
 * Modo AUTH_PROVIDER=supabase contra un servidor GoTrue SIMULADO (no es Supabase real).
 * Verifica la experiencia de la aplicación; la verificación contra el servicio real queda pendiente (docs/23).
 */
const GOTRUE = "http://127.0.0.1:54399";
const ADMIN = "admin@demo.hubcircular.test";
const ADMIN_SB = "Admin-supabase-Passw0rd!";
const GENERIC = "No fue posible iniciar sesión";

const setMode = (request: APIRequestContext, mode: string) => request.post(`${GOTRUE}/__test/mode`, { data: { mode } });
const addUser = (request: APIRequestContext, email: string, password: string, confirmed = true) =>
  request.post(`${GOTRUE}/__test/users`, { data: { email, password, confirmed } });

async function tryLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}
async function login(page: Page, email: string, password: string) {
  await tryLogin(page, email, password);
  await page.waitForURL(/\/inicio(\?|$)/);
}
const alertOf = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

test.describe.configure({ mode: "serial" });

test.describe("inicio de sesión con Supabase Auth (simulado)", () => {
  test("ingresa con la clave de Supabase; la clave local de la semilla ya no sirve; clave errónea y correo sin confirmar se rechazan", async ({ page }) => {
    await tryLogin(page, ADMIN, PASSWORDS.admin); // clave LOCAL de la semilla
    await expect(alertOf(page)).toContainText(GENERIC);
    await tryLogin(page, ADMIN, "clave-incorrecta-1234");
    await expect(alertOf(page)).toContainText(GENERIC);
    await tryLogin(page, "lector@demo.hubcircular.test", "Lector-supabase-Passw0rd!"); // correo sin confirmar
    await expect(alertOf(page)).toContainText(GENERIC);
    await expect(page).toHaveURL(/\/login/);
    await login(page, ADMIN, ADMIN_SB);
    await expect(page.getByText("Administrador DEMO", { exact: true }).first()).toBeVisible();
  });

  test("las contraseñas se administran en Supabase: sin «Mi contraseña», sin restablecer, aviso en /cuenta/clave", async ({ page }) => {
    await login(page, ADMIN, ADMIN_SB);
    await expect(page.getByRole("link", { name: "Mi contraseña" })).toHaveCount(0);
    await page.goto("/usuarios");
    await expect(page.getByTestId("modo-supabase")).toContainText("Modo Supabase Auth");
    await expect(page.getByRole("button", { name: /Restablecer contraseña/ })).toHaveCount(0);
    await page.goto("/cuenta/clave");
    await expect(page.getByTestId("clave-externa")).toContainText("Supabase Auth");
    await expect(page.getByRole("button", { name: "Cambiar contraseña" })).toHaveCount(0);
  });

  test("el administrador crea el perfil (sin clave temporal) y la persona entra cuando existe en Supabase con ese correo", async ({ page, request, browser }) => {
    const email = "nueva.persona@demo.hubcircular.test";
    await login(page, ADMIN, ADMIN_SB);
    await page.goto("/usuarios");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Nombre", { exact: true }).fill("Nueva Persona");
    await page.getByLabel("Rol", { exact: true }).first().selectOption("lector");
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByTestId("usuario-creado-externo")).toContainText("Authentication → Users");
    await expect(page.getByTestId("clave-temporal")).toHaveCount(0);

    // Sin cuenta en Supabase todavía: no entra. Cuando la cree (correo confirmado), entra y queda vinculada.
    const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:3101", locale: "es-CL" });
    const other = await ctx.newPage();
    await tryLogin(other, email, "Clave-supabase-nueva-1!");
    await expect(alertOf(other)).toContainText(GENERIC);
    await addUser(request, email, "Clave-supabase-nueva-1!");
    await login(other, email, "Clave-supabase-nueva-1!");
    await expect(other).toHaveURL(/\/inicio/); // lector: sin enlace de registro
    await expect(other.getByRole("link", { name: "Usuarios", exact: true })).toHaveCount(0);
    await ctx.close();
  });

  test("si el servicio de autenticación no está disponible se informa sin culpar a la clave, y al volver funciona", async ({ page, request }) => {
    await setMode(request, "down");
    try {
      await tryLogin(page, ADMIN, ADMIN_SB);
      await expect(alertOf(page)).toContainText("No fue posible contactar el servicio de autenticación");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await setMode(request, "ok");
    }
    await login(page, ADMIN, ADMIN_SB);
  });

  test("accesibilidad (axe-core) de /usuarios y /cuenta/clave en modo Supabase", async ({ page }) => {
    await login(page, ADMIN, ADMIN_SB);
    for (const path of ["/usuarios", "/cuenta/clave"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${path} ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    }
  });
});
