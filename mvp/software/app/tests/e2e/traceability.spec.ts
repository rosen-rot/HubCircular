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
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
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
  await page.waitForURL(/\/inicio(\?|$)/);
}

/** Crea un lote DEMO con un neto exacto registrando un pesaje real por la interfaz. */
async function createBatch(page: Page, netG: number, container = "DEMO-Z01-EST01-CARTON"): Promise<string> {
  await page.goto("/registro");
  await page.getByLabel("Contenedor", { exact: true }).selectOption(container);
  await page.getByLabel("Peso bruto: recipiente + material (kg)").fill(((netG + 350) / 1000).toString().replace(".", ","));
  await page.getByLabel("Tara: recipiente vacío (kg)").fill("0,350");
  await page.getByRole("button", { name: "Confirmar pesaje" }).click();
  await expect(page).toHaveURL(/\/pesajes\//);
  const rows = await sql<{ id: string }>("select id from hc.batches where initial_g = $1", [netG]);
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

async function fillMovement(page: Page, o: { type: string; qty: string; dest?: string; to?: string; reason?: string }) {
  await page.getByLabel("Tipo de movimiento").selectOption(o.type);
  if (o.dest) await page.getByLabel("Destino", { exact: true }).selectOption({ label: o.dest });
  if (o.to) await page.getByLabel("Ubicación de destino").selectOption({ label: o.to });
  await page.getByLabel("Cantidad (kg)").fill(o.qty);
  if (o.reason) await page.getByLabel(/^Motivo|^Observaciones/).fill(o.reason);
}

const movs = (batchId: string) => sql<{ type: string; quantity_g: number }>("select type, quantity_g from hc.movements where batch_id = $1 order by ref_no", [batchId]);
const balances = (batchId: string) =>
  sql<{ name: string; balance_g: number }>("select z.name, l.balance_g from hc.batch_location_balances l join hc.zones z on z.id = l.zone_id where l.batch_id = $1 order by z.name", [batchId]);

test.describe("retiro parcial (casos 3 y 4)", () => {
  test("lote de 12.000 g: despacho de 9.000 g deja 3.000 g y un segundo de 4.000 g se rechaza sin cambiar nada", async ({ page }) => {
    await login(page, "operator");
    const batchId = await createBatch(page, 12_000);

    await page.goto(`/retiros?lote=${batchId}`);
    await fillMovement(page, { type: "despacho", qty: "9,00", dest: "Gestor de residuos DEMO (Gestor de residuos)" });
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();

    await expect(page).toHaveURL(new RegExp(`/lotes/${batchId}\\?movimiento=1`));
    await expect(page.getByTestId("saldo-total")).toContainText("3,000 kg");
    await expect(page.getByText("Captación inicial (no cambia)").locator("..")).toContainText("12,000 kg");
    const mov = page.getByTestId("movimiento");
    await expect(mov).toHaveCount(1);
    await expect(mov).toContainText("Despacho a gestor");
    await expect(mov).toContainText("9,000 kg");
    // Sin evidencia no se declara valorizado
    await expect(mov).toContainText("Pendiente: sin evidencia");
    await expect(page.getByText(/reciclado|valorizado confirmado/i)).toHaveCount(0);

    await page.goto(`/retiros?lote=${batchId}`);
    await fillMovement(page, { type: "despacho", qty: "4,00", dest: "Gestor de residuos DEMO (Gestor de residuos)" });
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page).toHaveURL(/\/retiros/);
    await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("Saldo insuficiente");
    expect(await movs(batchId)).toEqual([{ type: "despacho", quantity_g: 9000 }]);
    expect(await balances(batchId)).toEqual([{ name: "Cowork DEMO", balance_g: 3000 }]);
  });

  test("doble clic en «Confirmar movimiento» registra un único movimiento", async ({ page }) => {
    await login(page, "operator");
    const batchId = await createBatch(page, 6_543);
    await page.goto(`/retiros?lote=${batchId}`);
    await fillMovement(page, { type: "rechazo", qty: "1,111", reason: "contaminado con aceite" });
    await page.getByRole("button", { name: "Confirmar movimiento" }).dblclick();
    await expect(page).toHaveURL(/\/lotes\//);
    expect(await movs(batchId)).toEqual([{ type: "rechazo", quantity_g: 1111 }]);
    expect(await balances(batchId)).toEqual([{ name: "Cowork DEMO", balance_g: 5432 }]);
  });

  test("el operador no ve «Ajuste»; el administrador sí y lo registra con motivo", async ({ page }) => {
    await login(page, "operator");
    const batchId = await createBatch(page, 4_321);
    await page.goto(`/retiros?lote=${batchId}`);
    await expect(page.getByLabel("Tipo de movimiento").locator("option", { hasText: "Ajuste" })).toHaveCount(0);
    await page.getByRole("button", { name: "Salir" }).first().click();

    await login(page, "admin");
    await page.goto(`/retiros?lote=${batchId}`);
    await page.getByLabel("Tipo de movimiento").selectOption("ajuste");
    await page.getByLabel("Aumenta el saldo").check();
    await page.getByLabel("Ubicación", { exact: true }).selectOption({ label: "Cowork DEMO" });
    await page.getByLabel("Cantidad (kg)").fill("0,5");
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("motivo");
    await page.getByLabel("Motivo (obligatorio)").fill("diferencia de balanza en recuento");
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page).toHaveURL(/\/lotes\//);
    await expect(page.getByTestId("saldo-total")).toContainText("4,821 kg");
    await expect(page.getByTestId("movimiento")).toContainText("diferencia de balanza en recuento");
  });
});

test.describe("traslado, corrección y verificación", () => {
  test("traslado entre zonas conserva la masa y no crea pesajes ni lotes; el administrador puede corregirlo", async ({ page }) => {
    await login(page, "admin");
    const batchId = await createBatch(page, 7_000);
    const before = await sql<{ w: number; b: number }>("select (select count(*)::int from hc.weighings) w, (select count(*)::int from hc.batches) b");

    await page.goto(`/retiros?lote=${batchId}`);
    await fillMovement(page, { type: "traslado", qty: "7,000", to: "Laboratorio DEMO" });
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page).toHaveURL(/\/lotes\//);
    await expect(page.getByTestId("saldo-total")).toContainText("7,000 kg");
    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: /Laboratorio DEMO/ })).toContainText("7,000 kg");
    await expect(table.getByRole("row", { name: /Cowork DEMO/ })).toContainText("0,000 kg");
    const after = await sql<{ w: number; b: number }>("select (select count(*)::int from hc.weighings) w, (select count(*)::int from hc.batches) b");
    expect(after).toEqual(before);

    // Corrección: movimiento nuevo de efecto inverso, con motivo; el original permanece.
    await page.getByText("Corregir (deshacer este movimiento)…").click();
    await page.getByLabel("Motivo de la corrección").fill("traslado a la zona equivocada");
    await page.getByRole("button", { name: "Registrar corrección" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Corrección registrada" })).toBeVisible();
    await expect(page.getByTestId("movimiento")).toHaveCount(2);
    await expect(page.getByTestId("movimiento").nth(0)).toContainText(/Corregido por M-\d{6}/);
    await expect(page.getByTestId("movimiento").nth(1)).toContainText(/Corrige M-\d{6}/);
    expect(await balances(batchId)).toEqual([
      { name: "Cowork DEMO", balance_g: 7000 },
      { name: "Laboratorio DEMO", balance_g: 0 },
    ]);
    expect((await movs(batchId)).map((m) => m.type)).toEqual(["traslado", "correccion"]);
  });

  test("evidencia (operador) y verificación (solo administrador): confirmar no crea otra salida ni cambia el saldo", async ({ page }) => {
    await login(page, "operator");
    const batchId = await createBatch(page, 5_678);
    await page.goto(`/retiros?lote=${batchId}`);
    await fillMovement(page, { type: "despacho", qty: "5,000", dest: "Gestor de residuos DEMO (Gestor de residuos)" });
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page).toHaveURL(/\/lotes\//);

    // El operador agrega evidencia pero no puede decidir la verificación.
    await expect(page.getByRole("button", { name: "Confirmar valorización" })).toHaveCount(0);
    await page.getByLabel("Referencia", { exact: true }).fill("GD-2026-0042");
    await page.getByRole("button", { name: "Guardar evidencia" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Evidencia registrada" })).toBeVisible();
    await expect(page.getByTestId("movimiento")).toContainText("GD-2026-0042");
    await expect(page.getByTestId("movimiento")).toContainText("Pendiente de verificación");
    await page.getByRole("button", { name: "Salir" }).first().click();

    await login(page, "admin");
    await page.goto(`/lotes/${batchId}`);
    const salidasAntes = await movs(batchId);
    await page.getByRole("button", { name: "Confirmar valorización" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Valorización confirmada" })).toBeVisible();
    await expect(page.getByTestId("movimiento")).toContainText(/Confirmada por Administrador DEMO/);
    expect(await movs(batchId)).toEqual(salidasAntes);
    await expect(page.getByTestId("saldo-total")).toContainText("0,678 kg");

    // Con valorización confirmada no se puede corregir sin rechazar antes la verificación.
    await page.getByText("Corregir (deshacer este movimiento)…").click();
    await page.getByLabel("Motivo de la corrección").fill("registrado por error");
    await page.getByRole("button", { name: "Registrar corrección" }).click();
    await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("valorización confirmada");
    expect(await movs(batchId)).toEqual(salidasAntes);
  });

  test("rechazar una verificación exige motivo", async ({ page }) => {
    await login(page, "operator");
    const batchId = await createBatch(page, 3_456);
    await page.goto(`/retiros?lote=${batchId}`);
    await fillMovement(page, { type: "despacho", qty: "1,000", dest: "Otro destino DEMO (Otro)" });
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page).toHaveURL(/\/lotes\//);
    await page.getByRole("button", { name: "Salir" }).first().click();

    await login(page, "admin");
    await page.goto(`/lotes/${batchId}`);
    await expect(page.getByRole("button", { name: "Confirmar valorización" })).toBeDisabled();
    await page.getByRole("button", { name: "Rechazar verificación" }).click();
    await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("motivo");
    await page.getByLabel("Notas (obligatorias si se rechaza)").fill("no hay guía que respalde el retiro");
    await page.getByRole("button", { name: "Rechazar verificación" }).click();
    await expect(page.getByTestId("movimiento")).toContainText("Verificación rechazada");
  });
});

test.describe("roles", () => {
  test("el lector ve la trazabilidad pero no puede mover, agregar evidencia ni administrar destinos", async ({ page }) => {
    await login(page, "admin");
    const batchId = await createBatch(page, 2_468);
    await page.goto(`/retiros?lote=${batchId}`);
    await fillMovement(page, { type: "despacho", qty: "1,000", dest: "Gestor de residuos DEMO (Gestor de residuos)" });
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page).toHaveURL(/\/lotes\//);
    await page.getByRole("button", { name: "Salir" }).first().click();

    await login(page, "reader");
    // el lector consulta lotes y movimientos, pero no tiene destinos ni formulario de movimiento
    await expect(page.getByRole("link", { name: "Movimientos", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Destinos", exact: true })).toHaveCount(0);
    await page.goto(`/lotes/${batchId}`);
    await expect(page.getByTestId("movimiento")).toContainText("Despacho a gestor");
    await expect(page.getByRole("button", { name: /Guardar evidencia|Confirmar valorización|Registrar corrección/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Registrar movimiento" })).toHaveCount(0);
    await page.goto("/retiros");
    await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
    await page.goto("/destinos");
    await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
  });

  test("el operador no administra destinos", async ({ page }) => {
    await login(page, "operator");
    await expect(page.getByRole("link", { name: "Destinos", exact: true })).toHaveCount(0);
    await page.goto("/destinos");
    await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
  });

  test("el operador (ámbito Cowork) no ve lotes del Laboratorio entre los movibles", async ({ page }) => {
    await login(page, "admin");
    const labBatch = await createBatch(page, 1_357, "DEMO-Z02-EST01-ALUMINIO");
    await page.getByRole("button", { name: "Salir" }).first().click();
    await login(page, "operator");
    await page.goto("/retiros");
    await expect(page.getByLabel("Lote", { exact: true }).locator(`option[value="${labBatch}"]`)).toHaveCount(0);
    const res = await page.goto(`/lotes/${labBatch}`);
    expect(res?.status()).toBe(404);
  });
});

test.describe("destinos", () => {
  test("el administrador crea y desactiva; los duplicados se rechazan; un destino inactivo no se ofrece", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/destinos");
    await page.getByLabel("Nombre del destino").fill("Gestor Norte DEMO");
    await page.getByLabel(/Destino de demostración/).check();
    await page.getByRole("button", { name: "Crear destino" }).click();
    await expect(page.getByRole("status").filter({ hasText: "creado" })).toBeVisible();
    await expect(page.getByRole("row", { name: /Gestor Norte DEMO/ })).toContainText("Activo");

    await page.getByLabel("Nombre del destino").fill("  gestor norte demo ");
    await page.getByLabel(/Destino de demostración/).check();
    await page.getByRole("button", { name: "Crear destino" }).click();
    await expect(page.getByText("Ya existe un destino con ese nombre.")).toBeVisible();

    await page.getByRole("button", { name: "Desactivar Gestor Norte DEMO" }).click();
    await expect(page.getByRole("row", { name: /Gestor Norte DEMO/ })).toContainText("Inactivo");
    const batchId = await createBatch(page, 1_111);
    await page.goto(`/retiros?lote=${batchId}`);
    await page.getByLabel("Tipo de movimiento").selectOption("despacho");
    await expect(page.getByLabel("Destino", { exact: true }).locator("option", { hasText: "Gestor Norte DEMO" })).toHaveCount(0);
    await expect(page.getByLabel("Destino", { exact: true }).locator("option", { hasText: "Gestor de residuos DEMO" })).toHaveCount(1);
  });
});

test.describe("accesibilidad (axe-core) de las pantallas de trazabilidad", () => {
  test("retiros, destinos y detalle de lote con movimientos", async ({ page }) => {
    await login(page, "admin");
    const batchId = await createBatch(page, 9_999);
    await page.goto(`/retiros?lote=${batchId}`);
    await page.getByLabel("Tipo de movimiento").selectOption("despacho");
    await page.getByLabel("Destino", { exact: true }).selectOption({ label: "Gestor de residuos DEMO (Gestor de residuos)" });
    await page.getByLabel("Cantidad (kg)").fill("1,5");
    await page.getByRole("button", { name: "Confirmar movimiento" }).click();
    await expect(page).toHaveURL(/\/lotes\//);
    for (const path of [`/retiros?lote=${batchId}`, "/destinos", `/lotes/${batchId}`]) {
      await page.goto(path);
      if (path.startsWith("/lotes/")) await page.getByText("Corregir (deshacer este movimiento)…").click();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${path} ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    }
  });
});
