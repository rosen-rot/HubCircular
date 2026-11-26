import AxeBuilder from "@axe-core/playwright";
import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { PASSWORDS } from "../helpers/db";

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

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const reading = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, deviceId: "E2E-ESP32-001", messageId: crypto.randomUUID(), measuredAt: new Date().toISOString(),
  weightGrams: 4250, distanceMm: 180, fillPercent: 65.0, quality: "stable", firmwareVersion: "sim-0.1.0", ...over,
});

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

let token = "";
let rotated = "";
let before: { w: string; b: string; m: string };

test.describe.configure({ mode: "serial" });

test.describe("dispositivos e ingesta IoT (simulada)", () => {
  test("el administrador crea un dispositivo y la credencial se muestra una sola vez", async ({ page }) => {
    before = await business();
    await login(page, "admin");
    await page.getByRole("link", { name: "Dispositivos", exact: true }).click();
    await expect(page).toHaveURL(/\/dispositivos$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dispositivos" })).toBeVisible();
    await expect(page.getByTestId("aviso-telemetria")).toContainText("no suman captación");
    await expect(page.getByTestId("sin-dispositivos")).toBeVisible();

    await page.getByLabel("Código del dispositivo").fill("e2e-esp32-001");
    await page.getByLabel("Nombre", { exact: true }).fill("Sensor cartón E2E");
    await page.getByLabel("Contenedor donde está instalado").selectOption({ label: "DEMO-Z01-EST01-CARTON · Cowork DEMO (DEMO)" });
    await page.getByRole("button", { name: "Crear dispositivo" }).click();
    const notice = page.getByTestId("token-dispositivo");
    await expect(notice).toBeVisible();
    token = (await notice.getByLabel("Credencial del dispositivo").innerText()).trim();
    expect(token).toMatch(/^hcd_[A-Za-z0-9_-]{43}$/);
    await expect(notice).toContainText("una sola vez");

    // En la BD solo está el hash
    const rows = await sql<{ token_hash: string; token_prefix: string; data_origin: string }>("select token_hash, token_prefix, data_origin from hc.devices where device_code = 'E2E-ESP32-001'");
    expect(rows[0]!.data_origin).toBe("demo");
    expect(JSON.stringify(rows[0])).not.toContain(token);
    expect(rows[0]!.token_prefix).toBe(token.slice(0, 8));

    // Al recargar la credencial completa ya no aparece; solo su prefijo
    await page.reload();
    await expect(page.getByTestId("token-dispositivo")).toHaveCount(0);
    expect(await page.content()).not.toContain(token);
    const card = page.getByTestId("dispositivo").filter({ hasText: "E2E-ESP32-001" });
    await expect(card).toContainText(`${token.slice(0, 8)}…`);
    await expect(card.getByTestId("estado-dispositivo")).toHaveText("Sin datos aún");
    await expect(card.getByText("DEMO", { exact: true })).toBeVisible();
    await expect(card.getByTestId("ultimo-contacto")).toContainText("nunca");
  });

  test("el endpoint acepta lecturas sin cookie de sesión y aplica sus reglas (202/409/401/400/415)", async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL });
    const url = "/api/iot/v1/readings";
    const hdr = (t: string) => ({ authorization: `Bearer ${t}` });

    const body = reading();
    const a = await api.post(url, { headers: hdr(token), data: body });
    expect(a.status()).toBe(202);
    const ja = await a.json();
    expect(ja).toMatchObject({ accepted: true, duplicate: false });
    const dup = await api.post(url, { headers: hdr(token), data: body });
    expect(dup.status()).toBe(202);
    expect(await dup.json()).toMatchObject({ readingId: ja.readingId, duplicate: true });
    const alt = await api.post(url, { headers: hdr(token), data: { ...body, weightGrams: 1 } });
    expect(alt.status()).toBe(409);

    expect((await api.post(url, { data: reading() })).status()).toBe(401);
    expect((await api.post(url, { headers: hdr("hcd_" + "x".repeat(43)), data: reading() })).status()).toBe(401);
    expect((await api.post(url, { headers: hdr(token), data: reading({ fillPercent: 130 }) })).status()).toBe(400);
    expect((await api.post(url, { headers: { ...hdr(token), "content-type": "text/plain" }, data: JSON.stringify(reading()) })).status()).toBe(415);
    expect((await api.post(url, { headers: hdr(token), data: reading({ deviceId: "OTRO-DISPOSITIVO" }) })).status()).toBe(403);
    // 429 con Retry-After y cabeceras de seguridad presentes
    const sec = await api.post(url, { headers: hdr(token), data: reading({ quality: "sensor_error", weightGrams: null, distanceMm: null, fillPercent: null }) });
    expect(sec.status()).toBe(202);
    expect(sec.headers()["content-security-policy"]).toBeTruthy();
    expect(sec.headers()["cache-control"]).toBe("no-store");
    // Las demás APIs siguen exigiendo cookie de sesión
    expect((await api.post("/api/weighings", { data: {} })).status()).toBe(401);
    await api.dispose();
  });

  test("el panel muestra en línea, última lectura (sin ceros inventados) y que nada se sumó a la captación", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dispositivos");
    const card = page.getByTestId("dispositivo").filter({ hasText: "E2E-ESP32-001" });
    await expect(card.getByTestId("estado-dispositivo")).toHaveText("En línea");
    // La última lectura aceptada fue el sensor_error: sin valores, no «0 kg»
    const last = card.getByTestId("ultima-lectura");
    await expect(last).toContainText("Error de sensor");
    await expect(last.getByText("—")).toHaveCount(3);
    await expect(last).not.toContainText(/0 kg|0 mm|0,0 %/);
    await expect(card).toContainText("1 con error de sensor");
    const table = page.getByTestId("tabla-lecturas");
    await expect(table).toContainText("E2E-ESP32-001");
    await expect(table).toContainText(/4[.,]250 kg/);
    await expect(table).toContainText("65,0 %");
    await expect(table).toContainText("180 mm");
    // Telemetría ≠ captación
    expect(await business()).toEqual(before);
  });

  test("sin conexión: pasado el tiempo de tolerancia el dato aparece desactualizado", async ({ page }) => {
    await sql("update hc.devices set last_seen_at = now() - interval '2 hours' where device_code = 'E2E-ESP32-001'");
    await login(page, "admin");
    await page.goto("/dispositivos");
    const card = page.getByTestId("dispositivo").filter({ hasText: "E2E-ESP32-001" });
    await expect(card.getByTestId("estado-dispositivo")).toHaveText("Dato desactualizado");
    await expect(card.getByTestId("ultimo-contacto")).toContainText("hace 2 h");
    // Una lectura nueva lo devuelve a «En línea»
    const api = await pwRequest.newContext({ baseURL: test.info().project.use.baseURL });
    expect((await api.post("/api/iot/v1/readings", { headers: { authorization: `Bearer ${token}` }, data: reading() })).status()).toBe(202);
    await api.dispose();
    await page.reload();
    await expect(card.getByTestId("estado-dispositivo")).toHaveText("En línea");
  });

  test("rotar la credencial invalida la anterior; revocar bloquea con 403", async ({ page, baseURL }) => {
    await login(page, "admin");
    await page.goto("/dispositivos");
    const card = page.getByTestId("dispositivo").filter({ hasText: "E2E-ESP32-001" });
    await card.getByRole("button", { name: /Rotar credencial de E2E-ESP32-001/ }).click();
    const notice = card.getByTestId("token-dispositivo");
    await expect(notice).toBeVisible();
    rotated = (await notice.getByLabel("Credencial del dispositivo").innerText()).trim();
    expect(rotated).toMatch(/^hcd_/);
    expect(rotated).not.toBe(token);

    const api = await pwRequest.newContext({ baseURL });
    const send = (t: string) => api.post("/api/iot/v1/readings", { headers: { authorization: `Bearer ${t}` }, data: reading() });
    expect((await send(token)).status()).toBe(401);
    expect((await send(rotated)).status()).toBe(202);

    await page.goto("/dispositivos");
    await page.getByTestId("dispositivo").filter({ hasText: "E2E-ESP32-001" }).getByRole("button", { name: /Revocar E2E-ESP32-001/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Dispositivo revocado" })).toBeVisible();
    await expect(page.getByTestId("dispositivo").filter({ hasText: "E2E-ESP32-001" }).getByTestId("estado-dispositivo")).toHaveText("Revocado");
    const r = await send(rotated);
    expect(r.status()).toBe(403);
    expect((await r.json()).error.code).toBe("device_revoked");
    await api.dispose();

    // Auditoría de la administración, sin secretos
    const audit = await sql<{ action: string }>("select action from hc.audit_logs where entity = 'device' order by occurred_at");
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["create", "rotate_token", "revoke"]));
    expect(JSON.stringify(await sql("select * from hc.audit_logs where entity = 'device'"))).not.toContain(rotated);
    expect(await business()).toEqual(before);
  });

  test("ámbito y permisos: el operador ve solo su zona y no administra; el lector solo consulta", async ({ page }) => {
    // Un dispositivo en Laboratorio (fuera del ámbito del operador), creado por el administrador
    await login(page, "admin");
    await page.goto("/dispositivos");
    await page.getByLabel("Código del dispositivo").fill("E2E-LAB-001");
    await page.getByLabel("Nombre", { exact: true }).fill("Sensor laboratorio");
    await page.getByLabel("Contenedor donde está instalado").selectOption({ label: "DEMO-Z02-EST01-ALUMINIO · Laboratorio DEMO (DEMO)" });
    await page.getByRole("button", { name: "Crear dispositivo" }).click();
    await expect(page.getByTestId("token-dispositivo")).toBeVisible();
    await page.getByRole("button", { name: "Salir" }).click();

    await login(page, "operator");
    await page.goto("/dispositivos");
    await expect(page.getByRole("heading", { level: 1, name: "Dispositivos" })).toBeVisible();
    await expect(page.getByTestId("dispositivo").filter({ hasText: "E2E-ESP32-001" })).toBeVisible();
    await expect(page.getByTestId("dispositivo").filter({ hasText: "E2E-LAB-001" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Nuevo dispositivo" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Rotar|Revocar/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Salir" }).click();

    await login(page, "reader");
    await page.goto("/dispositivos");
    await expect(page.getByTestId("dispositivo").filter({ hasText: "E2E-LAB-001" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nuevo dispositivo" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Rotar|Revocar/ })).toHaveCount(0);
  });

  test("accesibilidad (axe-core) y sin desbordes a 390 px", async ({ page }) => {
    await login(page, "admin");
    for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      await page.goto("/dispositivos");
      await expect(page.getByTestId("dispositivo").first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `desborde horizontal a ${size.width}px`).toBeLessThanOrEqual(0);
    }
    // También con el aviso de credencial visible
    await page.getByLabel("Código del dispositivo").fill("E2E-AXE-001");
    await page.getByLabel("Nombre", { exact: true }).fill("Sensor axe");
    await page.getByLabel("Contenedor donde está instalado").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Crear dispositivo" }).click();
    await expect(page.getByTestId("token-dispositivo")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
