import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client, types } from "pg";
import { PASSWORDS } from "../helpers/db";

types.setTypeParser(20, (v) => Number(v));
const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const dbUrl = adminUrl.replace(/\/[^/]*$/, "/hc_e2e");

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try { return (await c.query(text, params)).rows as T[]; } finally { await c.end(); }
}

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
  await page.waitForURL(/\/(registro|historial)(\?|$)/);
}

/** Alertas de la aplicación (excluye el anunciador de rutas que inyecta Next, que también usa role=alert). */
const appAlert = (page: Page) => page.locator("[role=alert]:not(#__next-route-announcer__)");

async function fillWeighing(page: Page, o: { container?: string; gross: string; tare: string; notes?: string }) {
  if (o.container) await page.getByLabel("Contenedor").selectOption(o.container);
  await page.getByLabel("Peso bruto (kg)").fill(o.gross);
  await page.getByLabel("Tara (kg)").fill(o.tare);
  if (o.notes) await page.getByLabel("Observaciones (opcional)").fill(o.notes);
}

test.describe("acceso y sesión", () => {
  test("anónimo es enviado a /login y la API responde 401", async ({ page, request }) => {
    await page.goto("/registro");
    await expect(page).toHaveURL(/\/login\?next=%2Fregistro/);
    await page.goto("/historial");
    await expect(page).toHaveURL(/\/login/);
    const res = await request.get("/api/weighings");
    expect(res.status()).toBe(401);
    const post = await request.post("/api/weighings", { data: {}, headers: { "idempotency-key": crypto.randomUUID() } });
    expect(post.status()).toBe(401);
  });

  test("credenciales inválidas muestran un mensaje genérico, sin revelar si el correo existe", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("nadie@demo.hubcircular.test");
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(appAlert(page)).toContainText("No fue posible iniciar sesión");
    await page.getByLabel("Correo electrónico").fill(USERS.operator[0]);
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(appAlert(page)).toContainText("No fue posible iniciar sesión");
  });

  test("redirección abierta bloqueada: next externo se ignora", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example%2F");
    await page.getByLabel("Correo electrónico").fill(USERS.operator[0]);
    await page.getByLabel("Contraseña").fill(USERS.operator[1]);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.waitForURL(/\/(registro|historial)/);
    expect(new URL(page.url()).hostname).toBe("127.0.0.1");
  });

  test("cerrar sesión invalida el acceso", async ({ page }) => {
    await login(page, "operator");
    await page.getByRole("button", { name: "Salir" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/historial");
    await expect(page).toHaveURL(/\/login/);
  });

  test("la cookie de sesión es HttpOnly y SameSite=Lax", async ({ page, context }) => {
    await login(page, "operator");
    const c = (await context.cookies()).find((x) => x.name === "hc_session")!;
    expect(c).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  });
});

test.describe("registro manual (flujo principal del operador)", () => {
  test("operador registra un pesaje: neto en vivo, confirmación con referencias y aparece en el historial", async ({ page }) => {
    await login(page, "operator");
    await expect(page).toHaveURL(/\/registro/);
    await fillWeighing(page, { container: "DEMO-Z01-EST01-CARTON", gross: "4,250", tare: "0,350", notes: "Caja limpia" });
    await expect(page.getByTestId("net-preview")).toContainText("3,900 kg");
    await expect(page.getByTestId("net-preview")).toContainText("3.900 g");
    await page.getByRole("button", { name: "Confirmar pesaje" }).click();

    await expect(page).toHaveURL(/\/pesajes\/[0-9a-f-]{36}\?nuevo=1/);
    await expect(page.getByRole("status").first()).toContainText("Pesaje registrado");
    await expect(page.getByText("3,900 kg (3.900 g)").first()).toBeVisible();
    await expect(page.getByText("DEMO").first()).toBeVisible();
    const ref = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/P-\d{6}/)![0];

    await page.getByRole("link", { name: "Ver historial" }).click();
    const row = page.getByRole("row", { name: new RegExp(ref) });
    await expect(row).toContainText("3,900 kg");
    await expect(row).toContainText("Operador DEMO");

    // el lote existe con el saldo correcto
    await row.getByRole("link", { name: /L-\d{6}/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lote L-");
    await expect(page.getByText("Saldo disponible").locator("..")).toContainText("3,900 kg");
  });

  test("valida en servidor: tara ≥ bruto no registra nada y explica el error", async ({ page }) => {
    await login(page, "operator");
    const before = (await sql<{ n: number }>("select count(*)::int n from hc.weighings"))[0]!.n;
    await fillWeighing(page, { container: "DEMO-Z01-EST01-PET", gross: "0,300", tare: "0,350" });
    await expect(page.getByTestId("net-preview")).toContainText("La tara debe ser menor");
    await page.getByRole("button", { name: "Confirmar pesaje" }).click();
    await expect(appAlert(page).filter({ hasText: "No se registró el pesaje" })).toBeVisible();
    await expect(appAlert(page)).toContainText("tara debe ser menor");
    expect((await sql<{ n: number }>("select count(*)::int n from hc.weighings"))[0]!.n).toBe(before);
    // lo ingresado se conserva para corregir
    await expect(page.getByLabel("Peso bruto (kg)")).toHaveValue("0,300");
  });

  test("rechaza texto, negativos, demasiados decimales y más de 1.000 kg", async ({ page }) => {
    await login(page, "operator");
    for (const [gross, expected] of [["abc", "solo números"], ["-2", "solo números"], ["1,2345", "3 decimales"], ["1000,5", "1.000 kg"]] as const) {
      await fillWeighing(page, { container: "DEMO-Z01-EST01-PET", gross, tare: "0,100" });
      await page.getByRole("button", { name: "Confirmar pesaje" }).click();
      await expect(appAlert(page).filter({ hasText: "No se registró" })).toContainText(expected);
    }
  });

  test("doble clic en «Confirmar pesaje» crea un único pesaje y un único lote", async ({ page }) => {
    await login(page, "operator");
    await fillWeighing(page, { container: "DEMO-Z01-EST01-CARTON", gross: "7,777", tare: "0,111" });
    await page.getByRole("button", { name: "Confirmar pesaje" }).dblclick();
    await expect(page).toHaveURL(/\/pesajes\//);
    const w = await sql<{ id: string }>("select id from hc.weighings where net_g = 7666");
    expect(w).toHaveLength(1);
    const b = await sql("select 1 from hc.batches where weighing_id = $1", [w[0]!.id]);
    expect(b).toHaveLength(1);
  });

  test("reenviar el mismo formulario (recarga POST/reintento) no duplica: muestra el registro original", async ({ page }) => {
    await login(page, "operator");
    await page.goto("/registro");
    const key = await page.locator("input[name=idempotencyKey]").inputValue();
    await fillWeighing(page, { container: "DEMO-Z01-EST01-PET", gross: "2,222", tare: "0,222" });
    await page.getByRole("button", { name: "Confirmar pesaje" }).click();
    await expect(page).toHaveURL(/nuevo=1/);
    expect(await sql("select 1 from hc.weighings where net_g = 2000 and idempotency_key = $1", [key])).toHaveLength(1);
    // reintento con la misma clave directamente contra la API de la sesión
    const res = await page.request.post("/api/weighings", {
      headers: { "idempotency-key": key },
      data: { containerCode: "DEMO-Z01-EST01-PET", grossG: 2222, tareG: 222 },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(await sql("select 1 from hc.weighings where idempotency_key = $1", [key])).toHaveLength(1);
  });

  test("QR: /registro?container=CÓDIGO preselecciona el contenedor y precarga la tara nominal, sin saltarse el login", async ({ page }) => {
    await page.goto("/registro?container=DEMO-Z01-EST01-PET");
    await expect(page).toHaveURL(/\/login\?next=/); // el QR no otorga acceso
    await login(page, "operator");
    await page.goto("/registro?container=DEMO-Z01-EST01-PET");
    await expect(page.getByLabel("Contenedor")).toHaveValue("DEMO-Z01-EST01-PET");
    await expect(page.getByLabel("Tara (kg)")).toHaveValue("0,35");
    await expect(page.getByText("Contenedor de demostración")).toBeVisible();
  });

  test("API: contrato POST /api/weighings (Idempotency-Key obligatoria, neto no aceptado del cliente)", async ({ page }) => {
    await login(page, "operator");
    const data = { containerCode: "demo-z01-est01-carton", grossG: 4250, tareG: 350 };
    expect((await page.request.post("/api/weighings", { data })).status()).toBe(422);
    const key = crypto.randomUUID();
    const ok = await page.request.post("/api/weighings", { data, headers: { "idempotency-key": key } });
    expect(ok.status()).toBe(201);
    expect(await ok.json()).toMatchObject({ netG: 3900, duplicate: false });
    const withNet = await page.request.post("/api/weighings", { data: { ...data, netG: 9999 }, headers: { "idempotency-key": crypto.randomUUID() } });
    expect(withNet.status()).toBe(422);
    const bad = await page.request.post("/api/weighings", { data: { ...data, tareG: 5000 }, headers: { "idempotency-key": crypto.randomUUID() } });
    expect(bad.status()).toBe(422);
    expect((await bad.json()).error.code).toBe("tare_not_less_than_gross");
  });
});

test.describe("roles y ámbito", () => {
  test("operador (ámbito Cowork) no ve contenedores ni pesajes del Laboratorio", async ({ page }) => {
    await login(page, "operator");
    const options = await page.getByLabel("Contenedor").locator("option").allTextContents();
    expect(options.join("|")).toContain("DEMO-Z01-EST01-CARTON");
    expect(options.join("|")).not.toContain("DEMO-Z02");
    await page.goto("/contenedores");
    await expect(page.getByRole("cell", { name: /DEMO-Z02/ })).toHaveCount(0);

    const lab = await sql<{ id: string }>(
      "select w.id from hc.weighings w join hc.zones z on z.id = w.zone_id where z.name = 'Laboratorio DEMO' limit 1",
    );
    if (lab[0]) {
      await page.goto(`/pesajes/${lab[0].id}`);
      await expect(page.getByRole("heading", { name: "No encontrado" })).toBeVisible();
    }
    // forzar el código por la URL no sirve: se advierte y no se preselecciona
    await page.goto("/registro?container=DEMO-Z02-EST01-ALUMINIO");
    await expect(appAlert(page)).toContainText("no corresponde a un contenedor activo");
    await expect(page.getByLabel("Contenedor")).toHaveValue("");
  });

  test("el administrador ve todo y puede registrar en el Laboratorio", async ({ page }) => {
    await login(page, "admin");
    await fillWeighing(page, { container: "DEMO-Z02-EST01-ALUMINIO", gross: "2", tare: "0,5" });
    await page.getByRole("button", { name: "Confirmar pesaje" }).click();
    await expect(page).toHaveURL(/nuevo=1/);
    await expect(page.getByText("Laboratorio DEMO").first()).toBeVisible();
    await page.goto("/historial");
    await expect(page.getByRole("combobox", { name: "Zona" }).locator("option")).toHaveCount(3); // Todas + 2 zonas
  });

  test("el lector puede consultar pero no registrar (UI y servidor)", async ({ page }) => {
    await login(page, "reader");
    await expect(page).toHaveURL(/\/historial/);
    await expect(page.getByRole("link", { name: "Registro", exact: true })).toHaveCount(0);
    await page.goto("/registro");
    await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
    const res = await page.request.post("/api/weighings", {
      data: { containerCode: "DEMO-Z01-EST01-CARTON", grossG: 1000, tareG: 100 },
      headers: { "idempotency-key": crypto.randomUUID() },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("historial", () => {
  test("filtra por referencia y por fechas; muestra estado vacío claro", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/historial");
    const first = await page.getByRole("row").nth(1).getByRole("link").first().textContent();
    await page.getByLabel("Referencia o contenedor").fill(first!);
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 pesaje" })).toBeVisible();
    await page.goto("/historial?from=2001-01-01&to=2001-01-02");
    await expect(page.getByText("Ningún pesaje coincide con los filtros.")).toBeVisible();
    await page.goto("/historial?ref=%27%3B%20drop%20table%20hc.weighings%3B%20--");
    await expect(page.getByText("Ningún pesaje coincide")).toBeVisible();
  });
});

test.describe("accesibilidad (axe-core: sin violaciones serias o críticas)", () => {
  for (const [name, path, who] of [
    ["login", "/login", null],
    ["registro", "/registro", "operator"],
    ["historial", "/historial", "admin"],
    ["contenedores", "/contenedores", "admin"],
  ] as const) {
    test(name, async ({ page }) => {
      if (who) await login(page, who);
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }
});
