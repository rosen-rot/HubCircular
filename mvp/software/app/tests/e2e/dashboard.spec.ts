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

const todayCl = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const tile = (page: Page, title: string) => page.locator("h3", { hasText: title }).locator("..");
const PERIOD = "from=2026-03-09&to=2026-03-13&origin=demo";

test.describe.configure({ mode: "serial" });

test.describe("tablero de indicadores", () => {
  test.beforeAll(async () => {
    // Captaciones con fecha fija (hora de Chile en verano: UTC-3) y un despacho, todo DEMO.
    const admin = (await sql<{ id: string }>("select id from hc.profiles where email = 'admin@demo.hubcircular.test'"))[0]!.id;
    const cowork = (await sql<{ id: string }>("select id from hc.zones where name = 'Cowork DEMO'"))[0]!.id;
    const gestor = (await sql<{ id: string }>("select id from hc.destinations where type = 'gestor' and data_origin = 'demo' limit 1"))[0]!.id;
    // Las funciones transaccionales exigen el actor de la sesión (hc.actor_id), igual que la aplicación.
    const c = new Client({ connectionString: dbUrl });
    await c.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('hc.actor_id', $1, true)", [admin]);
      const w = (code: string, gross: number, tare: number, at: string) =>
        c.query("select * from hc.register_weighing($1,$2,$3,$4,$5::timestamptz,null,false,$6)", [admin, code, gross, tare, at, crypto.randomUUID()]);
      await w("DEMO-Z01-EST01-CARTON", 5350, 350, "2026-03-10T13:00:00Z");
      await w("DEMO-Z01-EST01-PET", 3350, 350, "2026-03-11T13:00:00Z");
      await w("DEMO-Z02-EST01-ALUMINIO", 2500, 500, "2026-03-10T14:00:00Z");
      const batch = (await c.query("select id from hc.batches where initial_g = 5000 and data_origin = 'demo' order by created_at desc limit 1")).rows[0].id as string;
      await c.query("select * from hc.register_movement($1,$2,'despacho',2000,$3,null,$4,'2026-03-12T14:00:00Z'::timestamptz,null,$5)", [admin, batch, cowork, gestor, crypto.randomUUID()]);
      await c.query("commit");
    } finally {
      await c.end();
    }
  });

  test("administrador: cifras conciliadas, cierre contable, gráfico con tabla y enlaces de soporte", async ({ page }) => {
    await login(page, "admin");
    await page.goto(`/dashboard?${PERIOD}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tablero de indicadores");
    await expect(page.getByText("Datos de demostración.")).toBeVisible();
    await expect(tile(page, "Reciclable captado")).toContainText("10,000 kg");
    await expect(tile(page, "Reciclable captado")).toContainText("3 pesajes");
    await expect(tile(page, "Despachado a gestor")).toContainText("2,000 kg");
    await expect(tile(page, "Despachado a gestor")).toContainText("Sin decisión: 2,000 kg (de ellos 2,000 kg sin evidencia)");
    await expect(tile(page, "Inventario al cierre")).toContainText("8,000 kg");
    // Cierre contable: 0 + 10.000 − 2.000 = 8.000 g y la conciliación coincide
    const table = page.getByRole("table", { name: "Conciliación del inventario del período" });
    await expect(table).toContainText("= Inventario al cierre");
    await expect(table.getByRole("row", { name: /Inventario al cierre/ })).toContainText("8.000 g");
    await expect(page.getByText("La suma coincide con el inventario reconstruido")).toBeVisible();
    // Gráfico SVG con alternativa textual y tabla de datos
    const svg = page.locator("svg[role=img]");
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute("aria-label", /Captación semanal por material.*total 10,000 kg/);
    await page.getByText("Ver tabla de datos").click();
    const chartTable = page.getByRole("table", { name: "Captación semanal por material, en kilogramos" });
    await expect(chartTable).toContainText("09/03 – 15/03");
    await expect(chartTable).toContainText("10,000 kg");
    // Soporte: movimientos y enlace a pesajes con el mismo período
    await expect(page.getByRole("table", { name: "Movimientos efectivos del período" })).toContainText("Despacho a gestor");
    const link = page.getByRole("link", { name: "Ver pesajes" });
    await expect(link).toHaveAttribute("href", /\/historial\?from=2026-03-09&to=2026-03-13/);
  });

  test("origen real por defecto: sin datos reales no se muestran los DEMO y se explica", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard?from=2026-03-09&to=2026-03-13");
    await expect(page.getByText("Datos de demostración.")).toHaveCount(0);
    await expect(page.getByText("Aún no hay pesajes reales registrados en su ámbito")).toBeVisible();
    await expect(tile(page, "Reciclable captado")).toContainText("0,000 kg");
    await expect(tile(page, "Cobertura de medición")).toContainText("Sin datos");
  });

  test("el operador solo ve su zona: el Laboratorio no suma a sus cifras", async ({ page }) => {
    await login(page, "operator");
    await page.goto(`/dashboard?${PERIOD}`);
    await expect(tile(page, "Reciclable captado")).toContainText("8,000 kg");
    await expect(tile(page, "Reciclable captado")).toContainText("2 pesajes");
    await expect(tile(page, "Inventario al cierre")).toContainText("6,000 kg");
    // pedir otra zona no amplía el ámbito
    const lab = (await sql<{ id: string }>("select id from hc.zones where name = 'Laboratorio DEMO'"))[0]!.id;
    await page.goto(`/dashboard?${PERIOD}&zone=${lab}`);
    await expect(tile(page, "Reciclable captado")).toContainText("0,000 kg");
  });

  test("filtros inválidos se corrigen con aviso; las fechas futuras no se aceptan", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard?from=2026-02-30&to=2999-01-01&origin=demo&zone=%27%3B--");
    await expect(page.getByText("La fecha «desde» no es válida")).toBeVisible();
    await expect(page.getByText("La fecha «hasta» no puede ser futura")).toBeVisible();
    await expect(page.getByText("La zona indicada no es válida")).toBeVisible();
    await expect(page.getByText("El período incluye hoy")).toBeVisible();
  });

  test("lector: ve el tablero pero no los calendarios", async ({ page }) => {
    await login(page, "reader");
    await expect(page.getByRole("link", { name: "Tablero" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Calendarios" })).toHaveCount(0);
    await page.goto(`/dashboard?${PERIOD}`);
    await expect(tile(page, "Reciclable captado")).toContainText("10,000 kg");
    await page.goto("/calendarios");
    await expect(page.getByRole("heading", { name: "Acceso denegado" })).toBeVisible();
  });

  test("exportación CSV: unidades y zona horaria explícitas, ámbito y permisos del servidor", async ({ page, request }) => {
    // Sin cookie: el proxy redirige a /login (cortesía). Con una cookie inválida, el propio endpoint responde 401.
    const anon = await request.get(`/dashboard/export?kind=kpis&${PERIOD}`, { maxRedirects: 0 });
    expect(anon.status()).toBe(307);
    expect(anon.headers()["location"]).toContain("/login");
    const forged = await request.get(`/dashboard/export?kind=kpis&${PERIOD}`, { headers: { cookie: "hc_session=invalida" }, maxRedirects: 0 });
    expect(forged.status()).toBe(401);
    expect(forged.headers()["content-type"]).not.toContain("text/csv");
    await login(page, "admin");
    const res = await page.request.get(`/dashboard/export?kind=kpis&${PERIOD}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toContain("hubcircular-kpis-demo-2026-03-09_2026-03-13.csv");
    expect(res.headers()["cache-control"]).toBe("no-store");
    const kpis = await res.text();
    expect(kpis).toContain("indicador;valor;unidad;desde;hasta;zona_horaria;origen;zona;material");
    expect(kpis).toContain("captado;10000;g;2026-03-09;2026-03-13;America/Santiago;demo;todas;todos");
    expect(kpis).toContain("inventario_cierre;8000;g;");
    expect(kpis).toContain("cobertura_porcentaje;sin datos;%;");

    const pes = await (await page.request.get(`/dashboard/export?kind=pesajes&${PERIOD}`)).text();
    const lines = pes.trim().split("\r\n");
    expect(lines).toHaveLength(4); // encabezado + 3 pesajes
    expect(lines[0]).toContain("pesaje;fecha_local;contenedor;material;zona;bruto_g;tara_g;neto_g");
    expect(pes).toContain("2026-03-10 10:00:00;DEMO-Z01-EST01-CARTON");
    const mov = await (await page.request.get(`/dashboard/export?kind=movimientos&${PERIOD}`)).text();
    expect(mov).toMatch(/;despacho;sí;/);
    expect((await page.request.get("/dashboard/export?kind=otra")).status()).toBe(422);
    // el origen real no mezcla DEMO
    const real = await (await page.request.get("/dashboard/export?kind=pesajes&from=2026-03-09&to=2026-03-13")).text();
    expect(real.trim().split("\r\n")).toHaveLength(1);
  });

  test("el operador exporta solo lo de su zona", async ({ page }) => {
    await login(page, "operator");
    const pes = await (await page.request.get(`/dashboard/export?kind=pesajes&${PERIOD}`)).text();
    expect(pes).toContain("DEMO-Z01-EST01-CARTON");
    expect(pes).not.toContain("DEMO-Z02-EST01-ALUMINIO");
  });
});

test.describe("calendarios de medición y cero confirmado", () => {
  const PET = "DEMO-Z01-EST01-PET";

  test("el administrador programa; el operador confirma «cero»; la cobertura lo refleja; el administrador termina el calendario", async ({ page }) => {
    const today = todayCl();
    await login(page, "admin");
    await page.goto("/calendarios");
    const create = page.getByRole("form", { name: `Crear calendario de ${PET}` });
    for (const d of ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]) await create.getByLabel(d, { exact: true }).check();
    await create.getByRole("button", { name: "Crear calendario" }).click();
    await expect(page.getByText("Calendario creado.")).toBeVisible();
    await expect(page.getByText("lun, mar, mié, jue, vie, sáb, dom").first()).toBeVisible();
    // sin días seleccionados se rechaza con un mensaje
    const lab = page.getByRole("form", { name: "Crear calendario de DEMO-Z02-EST01-ALUMINIO" });
    await lab.getByRole("button", { name: "Crear calendario" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Seleccione al menos un día" })).toBeVisible();
    // hoy aparece como medición pendiente
    await page.goto(`/dashboard?from=${today}&to=${today}&origin=demo`);
    await expect(tile(page, "Cobertura de medición")).toContainText("Sin datos"); // pendiente: fuera del denominador
    await expect(tile(page, "Cobertura de medición")).toContainText("1 pendiente de hoy");

    // El operador del Cowork confirma «cero»
    await page.context().clearCookies();
    await login(page, "operator");
    await page.goto("/calendarios");
    await expect(page.getByRole("form", { name: /Crear calendario/ })).toHaveCount(0); // el operador no programa
    await page.getByRole("form", { name: `Confirmar cero en ${PET}` }).getByLabel("Nota (opcional)").fill("contenedor vacío al cierre");
    await page.getByRole("button", { name: "Confirmar cero (revisado, sin residuos)" }).click();
    await expect(page.getByText("«Cero» confirmado para hoy.")).toBeVisible();
    await expect(page.getByText("Nota: contenedor vacío al cierre")).toBeVisible();
    await expect(page.getByRole("form", { name: `Confirmar cero en ${PET}` })).toHaveCount(0);
    expect(await sql("select 1 from hc.weighings where container_id = (select id from hc.containers where code = $1) and occurred_at::date = current_date", [PET])).toHaveLength(0); // no se creó pesaje

    await page.goto(`/dashboard?from=${today}&to=${today}&origin=demo`);
    await expect(tile(page, "Cobertura de medición")).toContainText("100 %");
    await expect(tile(page, "Cobertura de medición")).toContainText("1 cero confirmado");
    await expect(tile(page, "Reciclable captado")).toContainText("0,000 kg"); // el cero no suma masa

    // El administrador termina el calendario (como máximo ayer: lo esperado hoy deja de existir)
    await page.context().clearCookies();
    await login(page, "admin");
    await page.goto("/calendarios");
    await page.getByRole("form", { name: `Terminar calendario de ${PET}` }).getByRole("button", { name: "Terminar calendario" }).click();
    await expect(page.getByText("Calendario terminado.")).toBeVisible();
    await expect(page.getByText("Hoy no hay mediciones esperadas en su ámbito.")).toBeVisible();
  });

  test("accesibilidad (axe-core) de tablero y calendarios", async ({ page }) => {
    await login(page, "admin");
    for (const path of [`/dashboard?${PERIOD}`, "/dashboard", "/calendarios"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${path} ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    }
  });
});
