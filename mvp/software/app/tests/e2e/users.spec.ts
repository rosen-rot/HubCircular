import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORDS } from "../helpers/db";

const ADMIN = ["admin@demo.hubcircular.test", PASSWORDS.admin] as const;
const NEW_PASSWORD = "caballo bateria grapa correcta";

async function login(page: Page, email: string, password: string, expectUrl: RegExp = /\/(registro|historial|cuenta\/clave)(\?|$)/) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(expectUrl);
}
const logout = (page: Page) => page.getByRole("button", { name: "Salir" }).first().click();
const alertOf = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

/** Crea un usuario desde la interfaz y devuelve su clave temporal (mostrada una sola vez). */
async function createUser(page: Page, o: { email: string; name: string; role: string; zone?: string }): Promise<string> {
  await page.goto("/usuarios");
  await page.getByLabel("Correo electrónico").fill(o.email);
  await page.getByLabel("Nombre", { exact: true }).fill(o.name);
  await page.getByLabel("Rol", { exact: true }).first().selectOption(o.role);
  if (o.zone) await page.getByLabel("Zona", { exact: true }).first().selectOption({ label: o.zone });
  await page.getByRole("button", { name: "Crear usuario" }).click();
  const temp = page.getByTestId("clave-temporal").getByLabel("Clave temporal");
  await expect(temp).toBeVisible();
  const text = (await temp.textContent())!.trim();
  expect(text).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  return text;
}

test.describe("gestión de usuarios", () => {
  test("alta → clave temporal mostrada una vez → primer ingreso obliga a cambiarla → acceso normal", async ({ page, request }) => {
    await login(page, ...ADMIN);
    const temp = await createUser(page, { email: "ana.nueva@demo.hubcircular.test", name: "Ana Nueva", role: "operador", zone: "Cowork DEMO" });

    // La clave no se vuelve a mostrar al recargar la página
    await page.goto("/usuarios");
    await expect(page.getByTestId("clave-temporal")).toHaveCount(0);
    const card = page.getByTestId("usuario").filter({ hasText: "ana.nueva@demo.hubcircular.test" });
    await expect(card).toContainText("Debe cambiar la clave");
    await expect(card).toContainText("Operador — Cowork DEMO");
    await expect(card).toContainText("Último ingreso: nunca");
    expect(await page.content()).not.toContain(temp);
    await logout(page);

    // Primer ingreso con la clave temporal: solo se puede cambiar la contraseña
    await login(page, "ana.nueva@demo.hubcircular.test", temp, /\/cuenta\/clave/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cambiar contraseña");
    await expect(page.getByRole("link", { name: "Movimientos", exact: true })).toHaveCount(0);
    for (const path of ["/registro", "/historial", "/retiros", "/usuarios", "/contenedores"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/cuenta\/clave/);
    }
    // El servidor también lo exige (API con la sesión de clave temporal)
    const api = await page.request.post("/api/weighings", {
      data: { containerCode: "DEMO-Z01-EST01-CARTON", grossG: 1000, tareG: 100 },
      headers: { "idempotency-key": crypto.randomUUID() },
    });
    expect(api.status()).toBe(403);
    void request;

    // Validaciones del cambio
    await page.goto("/cuenta/clave");
    await page.getByLabel("Contraseña actual (o clave temporal)").fill(temp);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("corta");
    await page.getByLabel("Repita la contraseña nueva").fill("corta");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("Use al menos 12 caracteres.")).toBeVisible();
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Repita la contraseña nueva").fill("no coincide con la anterior");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
    await page.getByLabel("Contraseña actual (o clave temporal)").fill("clave-actual-incorrecta");
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Repita la contraseña nueva").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("La contraseña actual no es correcta.")).toBeVisible();

    // Tras cada intento fallido el formulario se vacía (React 19): se completan los tres campos
    await page.getByLabel("Contraseña actual (o clave temporal)").fill(temp);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Repita la contraseña nueva").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await page.waitForURL(/\/registro/);
    await expect(page.getByRole("heading", { name: "Nuevo pesaje" })).toBeVisible();
    await logout(page);

    // La clave temporal ya no sirve; la nueva sí, y ya no obliga a cambiarla
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("ana.nueva@demo.hubcircular.test");
    await page.getByLabel("Contraseña").fill(temp);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(alertOf(page)).toContainText("No fue posible iniciar sesión");
    await login(page, "ana.nueva@demo.hubcircular.test", NEW_PASSWORD, /\/registro/);
  });

  test("desactivar cierra la sesión activa; restablecer exige nueva clave temporal", async ({ browser }) => {
    const adminCtx = await browser.newContext({ baseURL: "http://127.0.0.1:3100", locale: "es-CL" });
    const userCtx = await browser.newContext({ baseURL: "http://127.0.0.1:3100", locale: "es-CL" });
    const adminPage = await adminCtx.newPage();
    const userPage = await userCtx.newPage();
    await login(adminPage, ...ADMIN);
    const temp = await createUser(adminPage, { email: "baja.persona@demo.hubcircular.test", name: "Baja Persona", role: "lector" });
    await login(userPage, "baja.persona@demo.hubcircular.test", temp, /\/cuenta\/clave/);
    await userPage.getByLabel("Contraseña actual (o clave temporal)").fill(temp);
    await userPage.getByLabel("Contraseña nueva", { exact: true }).fill(NEW_PASSWORD);
    await userPage.getByLabel("Repita la contraseña nueva").fill(NEW_PASSWORD);
    await userPage.getByRole("button", { name: "Cambiar contraseña" }).click();
    await userPage.waitForURL(/\/historial/);

    // Restablecer: nueva clave temporal, sesión del usuario cerrada
    await adminPage.goto("/usuarios");
    const card = adminPage.getByTestId("usuario").filter({ hasText: "baja.persona@demo.hubcircular.test" });
    await card.getByRole("button", { name: /Restablecer contraseña/ }).click();
    const temp2 = (await card.getByTestId("clave-temporal").getByLabel("Clave temporal").textContent())!.trim();
    expect(temp2).not.toBe(temp);
    await userPage.goto("/historial");
    await expect(userPage).toHaveURL(/\/login/);
    await login(userPage, "baja.persona@demo.hubcircular.test", temp2, /\/cuenta\/clave/);

    // Desactivar: la sesión (con clave temporal) deja de valer y no puede volver a ingresar
    await adminPage.goto("/usuarios");
    await adminPage.getByRole("button", { name: "Desactivar a Baja Persona" }).click();
    await expect(adminPage.getByRole("status").filter({ hasText: "Usuario desactivado" })).toBeVisible();
    await userPage.goto("/cuenta/clave");
    await expect(userPage).toHaveURL(/\/login/);
    await userPage.getByLabel("Correo electrónico").fill("baja.persona@demo.hubcircular.test");
    await userPage.getByLabel("Contraseña").fill(temp2);
    await userPage.getByRole("button", { name: "Ingresar" }).click();
    await expect(alertOf(userPage)).toContainText("No fue posible iniciar sesión");
    await adminPage.getByRole("button", { name: "Activar a Baja Persona" }).click();
    await expect(adminPage.getByRole("status").filter({ hasText: "Usuario activado" })).toBeVisible();
    await adminCtx.close();
    await userCtx.close();
  });

  test("protecciones: sin botón para desactivarse; no se quita el último rol ni se duplica; correo repetido", async ({ page }) => {
    await login(page, ...ADMIN);
    await page.goto("/usuarios");
    const me = page.getByTestId("usuario").filter({ hasText: "admin@demo.hubcircular.test" });
    await expect(me).toContainText("Usted");
    await expect(me.getByRole("button", { name: /Desactivar/ })).toHaveCount(0);
    await expect(me.getByRole("button", { name: /Restablecer/ })).toHaveCount(0);
    // Último rol propio
    await me.getByRole("button", { name: /Quitar rol Administrador/ }).click();
    await expect(alertOf(page)).toContainText("al menos un rol");
    // Agregar un rol ya existente
    await me.getByText("Agregar rol…").click();
    await me.getByLabel("Rol", { exact: true }).selectOption("administrador");
    await me.getByRole("button", { name: /Agregar rol a/ }).click();
    await expect(alertOf(page)).toContainText("ya tiene ese rol");
    // Correo repetido
    await page.getByLabel("Correo electrónico").fill("ADMIN@demo.hubcircular.test");
    await page.getByLabel("Nombre", { exact: true }).fill("Duplicado");
    await page.getByLabel("Rol", { exact: true }).first().selectOption("administrador");
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByText("Ya existe un usuario con ese correo.")).toBeVisible();
    // Un operador sin zona no se acepta
    await page.getByLabel("Correo electrónico").fill("sin.zona@demo.hubcircular.test");
    await page.getByLabel("Nombre", { exact: true }).fill("Sin Zona");
    await page.getByLabel("Rol", { exact: true }).first().selectOption("operador");
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByText(/operador debe tener una zona/i)).toBeVisible();
  });

  test("solo el administrador ve /usuarios; cambiar contraseña está disponible para el operador", async ({ page }) => {
    await login(page, "operador@demo.hubcircular.test", PASSWORDS.operator);
    await expect(page.getByRole("link", { name: "Usuarios", exact: true })).toHaveCount(0);
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
    await page.getByRole("link", { name: "Mi contraseña" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cambiar contraseña");
    await expect(page.getByText("Está usando una clave temporal")).toHaveCount(0);
  });

  test("accesibilidad (axe-core) de /usuarios y /cuenta/clave", async ({ page }) => {
    await login(page, ...ADMIN);
    for (const path of ["/usuarios", "/cuenta/clave"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${path} ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    }
  });
});
