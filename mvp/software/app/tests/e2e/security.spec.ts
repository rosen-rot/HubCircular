import { expect, test, type Page } from "@playwright/test";
import { PASSWORDS } from "../helpers/db";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/inicio(\?|$)/);
}

test.describe("cabeceras de seguridad", () => {
  test("CSP con nonce distinto por solicitud y cabeceras de endurecimiento en login, redirecciones y API", async ({ request }) => {
    const a = await request.get("/login");
    const b = await request.get("/login");
    const cspA = a.headers()["content-security-policy"]!;
    const cspB = b.headers()["content-security-policy"]!;
    expect(cspA).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(cspA).not.toBe(cspB);
    expect(cspA).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    for (const res of [a, b]) {
      const h = res.headers();
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["cross-origin-opener-policy"]).toBe("same-origin");
      expect(h["x-powered-by"]).toBeUndefined();
      // Sobre http local no se envía HSTS (solo tiene sentido tras HTTPS).
      expect(h["strict-transport-security"]).toBeUndefined();
    }
    const redirect = await request.get("/registro", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers()["content-security-policy"]).toBeTruthy();
    const api = await request.get("/api/weighings");
    expect(api.status()).toBe(401);
    expect(api.headers()["content-security-policy"]).toBeTruthy();
    expect(api.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("el nonce de la cabecera llega a los scripts de la página", async ({ request }) => {
    const res = await request.get("/login");
    const nonce = /'nonce-([^']+)'/.exec(res.headers()["content-security-policy"]!)![1]!;
    const html = await res.text();
    expect(html).toContain(`nonce="${nonce}"`);
  });

  test("la interfaz funciona sin violaciones de CSP (login, registro, historial, lote) y bloquea manejadores inline inyectados", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) violations.push(m.text());
    });
    await login(page, "operador@demo.hubcircular.test", PASSWORDS.operator);
    await page.goto("/registro");
    // La vista previa del neto es JavaScript de cliente: si la CSP bloqueara los scripts, no funcionaría.
    await page.getByLabel("Contenedor", { exact: true }).selectOption("DEMO-Z01-EST01-CARTON");
    await page.getByLabel("Peso bruto: recipiente + material (kg)").fill("2,000");
    await page.getByLabel("Tara: recipiente vacío (kg)").fill("0,500");
    await expect(page.getByTestId("net-preview")).toContainText("1,500 kg");
    await page.getByRole("button", { name: "Confirmar pesaje" }).click();
    await expect(page).toHaveURL(/\/pesajes\//);
    await page.getByRole("link", { name: /L-\d{6}/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lote L-");

    // Un manejador inline inyectado (vector típico de XSS por HTML) debe ser bloqueado por el navegador.
    const blocked = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          document.addEventListener("securitypolicyviolation", () => resolve(true), { once: true });
          (window as unknown as { __xss?: boolean }).__xss = false;
          const box = document.createElement("div");
          box.innerHTML = '<img src="/no-existe.png" onerror="window.__xss = true">';
          document.body.appendChild(box);
          setTimeout(() => resolve(false), 1500);
        }),
    );
    expect(blocked).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBe(false);
    expect(violations.filter((v) => !/inline event handler|inline script/i.test(v))).toEqual([]);
  });
});
