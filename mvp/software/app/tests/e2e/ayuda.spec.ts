import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORDS } from "../helpers/db";

const USERS = {
  admin: ["admin@demo.hubcircular.test", PASSWORDS.admin],
  reader: ["lector@demo.hubcircular.test", PASSWORDS.reader],
} as const;

async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(USERS[who][0]);
  await page.getByLabel("Contraseña").fill(USERS[who][1]);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(registro|historial)(\?|$)/);
}

test.describe("ayuda: iconos (i) y glosario", () => {
  test("sin sesión, /ayuda lleva al login", async ({ page }) => {
    await page.goto("/ayuda");
    await expect(page).toHaveURL(/\/login/);
  });

  test("el lector también ve el menú Ayuda y el glosario completo, sin violaciones de accesibilidad", async ({ page }) => {
    await login(page, "reader");
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Ayuda" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ayuda y glosario" })).toBeVisible();
    for (const t of ["Tara (peso del recipiente vacío)", "Cero confirmado (revisado, sin residuos)", "Saldo disponible", "Cobertura de medición"]) {
      await expect(page.getByRole("heading", { level: 3, name: t })).toBeVisible();
    }
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(res.violations).toEqual([]);
  });

  test("en el formulario de pesaje la tara se explica con teclado y sin salir de la pantalla", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/registro");
    await expect(page.getByLabel("Tara: recipiente vacío (kg)")).toBeVisible();
    const tip = page.getByLabel("Qué significa: Tara (peso del recipiente vacío)");
    await tip.focus();
    await page.keyboard.press("Enter");
    const note = page.getByRole("note").filter({ hasText: "Lo que pesa el recipiente solo" });
    await expect(note).toBeVisible();
    await expect(note.getByRole("link", { name: "Más detalle en Ayuda" })).toHaveAttribute("href", "/ayuda#tara");
    await page.keyboard.press("Enter");
    await expect(note).toBeHidden();
    // abrir la explicación no marca ni cambia nada: el campo sigue vacío y la página es la misma
    await expect(page.getByLabel("Tara: recipiente vacío (kg)")).toHaveValue(/^$|^\d/);
    await expect(page).toHaveURL(/\/registro/);
  });

  test("el globo se cierra con Escape y queda dentro de la ventana, también en el borde derecho del tablero", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await login(page, "admin");
    await page.goto("/dashboard?origin=demo");
    await page.getByLabel("Qué significa: Cobertura de medición").first().click();
    const note = page.getByRole("note").filter({ hasText: "Qué porcentaje de las revisiones esperadas" });
    await expect(note).toBeVisible();
    const box = (await note.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1100);
    await page.keyboard.press("Escape");
    await expect(note).toBeHidden();
    // pulsar fuera también lo cierra
    await page.getByLabel("Qué significa: Cobertura de medición").first().click();
    await expect(note).toBeVisible();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(note).toBeHidden();
  });

  test("en una tabla con desplazamiento el globo no queda recortado", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await login(page, "admin");
    await page.goto("/contenedores");
    await page.getByLabel("Qué significa: Tara de referencia").click();
    const note = page.getByRole("note").filter({ hasText: "peso habitual del recipiente vacío" });
    await expect(note).toBeVisible();
    const box = (await note.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(1100);
    expect(box.height).toBeGreaterThan(80); // se ve completo, no recortado por el contenedor de la tabla
    await expect(note.getByRole("link", { name: "Más detalle en Ayuda" })).toBeInViewport();
  });

  test("el icono de contaminación no marca la casilla al pulsarlo", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/registro");
    const box = page.getByRole("checkbox", { name: /Contaminación visible/ });
    await expect(box).not.toBeChecked();
    await page.getByLabel("Qué significa: Contaminación observada").click();
    await expect(box).not.toBeChecked();
  });

  test("el enlace «Más detalle en Ayuda» abre el término correcto", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/registro");
    await page.getByLabel("Qué significa: Peso neto (solo el material)").click();
    await page.getByRole("link", { name: "Más detalle en Ayuda" }).click();
    await expect(page).toHaveURL(/\/ayuda#neto$/);
    await expect(page.locator("#neto")).toContainText("Peso neto");
  });

  test("tablero y calendarios con iconos (i) siguen sin violaciones de accesibilidad", async ({ page }) => {
    await login(page, "admin");
    for (const path of ["/registro", "/dashboard?origin=demo", "/calendarios", "/contenedores"]) {
      await page.goto(path);
      await expect(page.locator('summary[aria-label^="Qué significa:"]').first(), path).toBeVisible();
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(res.violations, path).toEqual([]);
    }
  });
});
