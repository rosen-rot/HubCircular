import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client, types } from "pg";
import { PASSWORDS } from "../helpers/db";

types.setTypeParser(20, (v) => Number(v));
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
const pad = (n: number) => String(n).padStart(6, "0");
let partial: { id: string; ref: number; movRef: number; movId: string };
let lab: { id: string; ref: number };

test.describe.configure({ mode: "serial" });

test.describe("lotes y movimientos (listas con panel de detalle)", () => {
  test.beforeAll(async () => {
    const c = new Client({ connectionString: dbUrl });
    await c.connect();
    try {
      const admin = (await c.query("select id from hc.profiles where email = 'admin@demo.hubcircular.test'")).rows[0].id as string;
      const cowork = (await c.query("select id from hc.zones where name = 'Cowork DEMO'")).rows[0].id as string;
      const gestor = (await c.query("select id from hc.destinations where type = 'gestor' and data_origin = 'demo' limit 1")).rows[0].id as string;
      await c.query("begin");
      await c.query("select set_config('hc.actor_id', $1, true)", [admin]);
      const w = (code: string, gross: number, tare: number) =>
        c.query("select * from hc.register_weighing($1,$2,$3,$4,now(),null,false,$5)", [admin, code, gross, tare, crypto.randomUUID()]);
      await w("DEMO-Z01-EST01-CARTON", 9350, 350); // 9.000 g: se despachan 3.000 → parcial
      await w("DEMO-Z02-EST01-ALUMINIO", 4500, 500); // Laboratorio: el operador (ámbito Cowork) no debe verlo
      const b1 = (await c.query("select id, ref_no from hc.batches where initial_g = 9000 order by created_at desc limit 1")).rows[0];
      const b2 = (await c.query("select id, ref_no from hc.batches where initial_g = 4000 order by created_at desc limit 1")).rows[0];
      const mv = (await c.query(
        "select * from hc.register_movement($1,$2,'despacho',3000,$3,null,$4,now(),null,$5)",
        [admin, b1.id, cowork, gestor, crypto.randomUUID()],
      )).rows[0];
      await c.query("commit");
      const m = (await c.query("select id, ref_no from hc.movements where batch_id = $1", [b1.id])).rows[0];
      void mv;
      partial = { id: b1.id, ref: b1.ref_no, movRef: m.ref_no, movId: m.id };
      lab = { id: b2.id, ref: b2.ref_no };
    } finally {
      await c.end();
    }
  });

  test("/lotes: por defecto solo datos reales (vacío con aviso); DEMO se pide de forma explícita", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/lotes");
    await expect(page.getByRole("heading", { level: 1, name: "Lotes" })).toBeVisible();
    await expect(page.getByText("Aún no hay lotes reales en su ámbito")).toBeVisible();
    await expect(page.getByTestId("lote")).toHaveCount(0);
    await page.getByRole("link", { name: "ver los lotes de demostración" }).click();
    await expect(page.getByText("Datos de demostración.")).toBeVisible();
    await expect(page.getByTestId("lote").first()).toBeVisible();
  });

  test("/lotes: filtro por estado, panel con resumen y trazabilidad, y cierre del panel", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/lotes?origin=demo&estado=parcial");
    const fila = page.getByTestId("lote").filter({ hasText: `L-${pad(partial.ref)}` });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText("Saldo parcial");
    await expect(fila).toContainText("9,000 kg");
    await expect(fila).toContainText("6,000 kg");
    // un lote parcial no aparece en «En inventario» ni en «Sin saldo»
    for (const e of ["completo", "sin_saldo"]) {
      await page.goto(`/lotes?origin=demo&estado=${e}`);
      await expect(page.getByTestId("lote").filter({ hasText: `L-${pad(partial.ref)}` })).toHaveCount(0);
    }
    await page.goto("/lotes?origin=demo&estado=parcial");
    await page.getByRole("link", { name: `L-${pad(partial.ref)}` }).first().click();
    const panel = page.getByTestId("panel-lote");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Saldo disponible");
    const eventos = panel.getByTestId("evento");
    await expect(eventos.first()).toContainText("Captación");
    await expect(eventos.filter({ hasText: "Despacho a gestor" })).toHaveCount(1);
    await expect(eventos.filter({ hasText: "Pendiente: sin evidencia" })).toHaveCount(1);
    await expect(panel.getByRole("link", { name: "Ver ficha completa" })).toHaveAttribute("href", `/lotes/${partial.id}`);
    await panel.getByRole("link", { name: "Cerrar panel" }).click();
    await expect(page.getByTestId("panel-lote")).toHaveCount(0);
  });

  test("/lotes: búsqueda por referencia y valores inválidos en la URL no rompen la página", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/lotes?origin=demo&ref=L-${partial.ref}`);
    await expect(page.getByTestId("lote")).toHaveCount(1);
    for (const q of ["page=-5", "estado=%27%3B--", "material=zz", "from=2026-02-30", "lote=nada", "origin=otro"]) {
      const res = await page.goto(`/lotes?${q}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Lotes" })).toBeVisible();
    }
    // un lote que no existe en el ámbito se informa sin revelar nada
    await page.goto("/lotes?origin=demo&lote=00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("no existe o no está dentro de su ámbito")).toBeVisible();
  });

  test("/movimientos: despacho sin evidencia, panel con línea de tiempo y filtros", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/movimientos?origin=demo&tipo=despacho&estado=pendiente_evidencia");
    const fila = page.getByTestId("movimiento-fila").filter({ hasText: `M-${pad(partial.movRef)}` });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText("Despacho a gestor");
    await expect(fila).toContainText("3,000 kg");
    await expect(fila).toContainText("Pendiente: sin evidencia");
    await fila.getByRole("link", { name: `M-${pad(partial.movRef)}` }).click();
    const panel = page.getByTestId("panel-movimiento");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("evento").filter({ hasText: "Pendiente: sin evidencia" })).toHaveCount(1);
    await expect(panel.getByRole("link", { name: "Abrir el lote" })).toHaveAttribute("href", `/lotes/${partial.id}`);
    // otro tipo no lo incluye
    await page.goto("/movimientos?origin=demo&tipo=traslado");
    await expect(page.getByTestId("movimiento-fila").filter({ hasText: `M-${pad(partial.movRef)}` })).toHaveCount(0);
    // por referencia
    await page.goto(`/movimientos?origin=demo&ref=m${partial.movRef}`);
    await expect(page.getByTestId("movimiento-fila")).toHaveCount(1);
  });

  test("agregar evidencia cambia el estado en la lista (pendiente de verificación) sin duplicar el movimiento", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/lotes/${partial.id}`);
    await page.getByLabel("Referencia", { exact: true }).fill("GD-TEST-1");
    await page.getByRole("button", { name: "Guardar evidencia" }).click();
    await expect(page.getByTestId("movimiento").getByText("GD-TEST-1")).toBeVisible();
    await page.goto(`/movimientos?origin=demo&estado=pendiente_verificacion`);
    await expect(page.getByTestId("movimiento-fila").filter({ hasText: `M-${pad(partial.movRef)}` })).toContainText("Pendiente de verificación");
    await page.goto(`/movimientos?origin=demo&mov=${partial.movId}`);
    const panel = page.getByTestId("panel-movimiento");
    await expect(panel.getByTestId("evento").filter({ hasText: "Evidencia" })).toHaveCount(1);
    await expect(panel).toContainText("GD-TEST-1");
  });

  test("ámbito: el operador de Cowork no ve el lote del Laboratorio ni en la lista ni por URL", async ({ page }) => {
    await login(page, "operator");
    await page.goto("/lotes?origin=demo");
    await expect(page.getByTestId("lote").filter({ hasText: `L-${pad(lab.ref)}` })).toHaveCount(0);
    await expect(page.getByTestId("lote").filter({ hasText: `L-${pad(partial.ref)}` })).toHaveCount(1);
    await page.goto(`/lotes?origin=demo&lote=${lab.id}`);
    await expect(page.getByText("no existe o no está dentro de su ámbito")).toBeVisible();
    await expect(page.getByTestId("panel-lote")).toHaveCount(0);
  });

  test("lector: consulta lotes y movimientos, sin botón de registrar", async ({ page }) => {
    await login(page, "reader");
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav.getByRole("link", { name: "Lotes", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Movimientos", exact: true })).toBeVisible();
    await page.goto("/lotes?origin=demo");
    await expect(page.getByRole("link", { name: "Registrar movimiento" })).toHaveCount(0);
    await page.goto("/movimientos?origin=demo");
    await expect(page.getByRole("link", { name: "Registrar movimiento" })).toHaveCount(0);
    await expect(page.getByTestId("movimiento-fila").first()).toBeVisible();
  });

  test("el administrador llega al formulario desde «Registrar movimiento»", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/movimientos?origin=demo");
    await page.getByRole("link", { name: "Registrar movimiento" }).click();
    await expect(page).toHaveURL(/\/retiros/);
    await expect(page.getByRole("heading", { name: "Movimientos de inventario" })).toBeVisible();
  });

  test("accesibilidad (axe-core) de /lotes y /movimientos con panel abierto, en escritorio y 390 px", async ({ page }) => {
    await login(page, "admin");
    const urls = [`/lotes?origin=demo&lote=${partial.id}`, `/movimientos?origin=demo&mov=${partial.movId}`, "/lotes", "/movimientos"];
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      for (const u of urls) {
        await page.goto(u);
        const res = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(res.violations, `${u} @${vp.width}`).toEqual([]);
        if (vp.width === 390) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `desborde ${u}`).toBeLessThanOrEqual(0);
      }
    }
  });

  test("registro: resumen de hoy, mis últimos registros y recordatorio", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/registro");
    await expect(page.getByRole("heading", { level: 1, name: "Nuevo pesaje" })).toBeVisible();
    const resumen = page.getByTestId("resumen-hoy");
    await expect(resumen).toContainText("Pesajes reales");
    await expect(resumen).toContainText("Pesajes de demostración");
    await expect(page.getByTestId("mis-registros").getByRole("link", { name: /^P-\d{6}$/ }).first()).toBeVisible();
    await expect(page.getByTestId("mis-registros")).toContainText("DEMO-Z02-EST01-ALUMINIO");
    await expect(page.getByRole("heading", { name: "Recordatorio" })).toBeVisible();
  });

  test("todas las pantallas del menú: sin violaciones de axe y sin desplazamiento horizontal a 390 px", async ({ page }) => {
    await login(page, "admin");
    const urls = ["/inicio?origin=demo", "/registro", "/historial", "/lotes?origin=demo", "/movimientos?origin=demo", "/retiros", "/dashboard?origin=demo", "/calendarios", "/contenedores", "/destinos", "/dispositivos", "/usuarios", "/ayuda", "/cuenta/clave"];
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      for (const u of urls) {
        await page.goto(u);
        const res = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(res.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`), `${u} @${vp.width}`).toEqual([]);
        if (vp.width === 390) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `desborde ${u}`).toBeLessThanOrEqual(0);
      }
    }
  });
});
