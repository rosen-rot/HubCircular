import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { startFakeGoTrue, type FakeGoTrue } from "../helpers/fake-gotrue";
import type { Actor } from "../../src/modules/identity/types";

/**
 * Supabase Auth como segundo proveedor (ADR-021), contra un servidor GoTrue SIMULADO.
 * Esto NO prueba Supabase real: prueba que HubCircular verifica, vincula y autoriza correctamente
 * a partir de las respuestas documentadas de GoTrue (200 con usuario / 400 / 429 / 5xx).
 */
let db: TestDb;
let gotrue: FakeGoTrue;
type Svc = typeof import("../../src/modules/identity/service");
type Users = typeof import("../../src/modules/users/service");
let svc: Svc;
let users: Users;
let adminActor: Actor;

const OP = "operador@demo.hubcircular.test";
const q = async <T>(sql: string, p: unknown[] = []) => (await db.admin.query(sql, p)).rows as T[];
const countAudit = async (action: string) => Number((await q<{ n: number }>("select count(*)::int n from hc.audit_logs where entity='auth' and action=$1", [action]))[0]!.n);
const sessionsOf = async (id: string) => Number((await q<{ n: number }>("select count(*)::int n from hc.local_sessions where user_id=$1", [id]))[0]!.n);
const linked = async (email: string) => (await q<{ auth_user_id: string | null }>("select auth_user_id from hc.profiles where email=$1", [email]))[0]!.auth_user_id;

const mk = async (email: string, name = "Persona", role = "lector") =>
  (await db.asActor(db.ids.admin, (c) => c.query("select * from hc.admin_create_user($1,$2,$3,$4,$5,$6)", [db.ids.admin, email, name, role, null, null]))).rows[0].o_user_id as string;

beforeAll(async () => {
  db = await createTestDb();
  gotrue = await startFakeGoTrue();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  process.env.AUTH_PROVIDER = "supabase";
  process.env.SUPABASE_URL = gotrue.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = gotrue.publishableKey;
  svc = await import("../../src/modules/identity/service");
  users = await import("../../src/modules/users/service");
  adminActor = { userId: db.ids.admin, email: "admin@demo.hubcircular.test", displayName: "Admin", roles: [{ role: "administrador", zoneId: null }] };
});
afterAll(async () => {
  delete process.env.AUTH_PROVIDER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  await gotrue.close();
  const { getPool } = await import("../../src/lib/db");
  await getPool().end();
  await db.drop();
});
beforeEach(async () => {
  await db.admin.query("update hc.profiles set auth_user_id = null"); // cada prueba parte sin vínculos
  gotrue.mode = "ok";
  gotrue.requests.length = 0;
  gotrue.users.clear();
});

describe("login con Supabase Auth", () => {
  it("primer ingreso verificado: vincula la identidad, abre sesión propia con roles y zona de HubCircular y audita", async () => {
    const u = gotrue.add(OP, "clave-de-supabase-1");
    const linksBefore = await countAudit("auth_linked_supabase");
    const r = await svc.authenticate(OP, "clave-de-supabase-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await linked(OP)).toBe(u.id);
    expect(await countAudit("auth_linked_supabase")).toBe(linksBefore + 1);
    const actor = await svc.resolveSession(r.token);
    expect(actor).toMatchObject({ userId: db.ids.operator, email: OP, mustChangePassword: false });
    expect(actor?.roles).toEqual([{ role: "operador", zoneId: db.ids.zoneCowork }]);
    // La sesión es la opaca de HubCircular: solo se guarda el hash; el token de Supabase no se almacena
    const hashes = (await q<{ token_hash: string }>("select token_hash from hc.local_sessions")).map((x) => x.token_hash);
    expect(hashes).not.toContain(r.token);
    expect(JSON.stringify(await q("select * from hc.local_sessions"))).not.toContain("fake.access");
  });

  it("solo se envía la clave publicable y el correo normalizado; la sesión de Supabase se revoca", async () => {
    gotrue.add(OP, "clave-de-supabase-1");
    await svc.authenticate("  OPERADOR@Demo.HubCircular.test ", "clave-de-supabase-1");
    await new Promise((r) => setTimeout(r, 50));
    const login = gotrue.requests.find((x) => x.path === "/auth/v1/token")!;
    expect(login.apikey).toBe(gotrue.publishableKey);
    expect(login.authorization).toBeUndefined();
    expect(login.body.email).toBe(OP);
    expect(gotrue.requests.every((x) => x.apikey === gotrue.publishableKey)).toBe(true);
    expect(gotrue.logouts).toBeGreaterThanOrEqual(1);
  });

  it("segundo ingreso con la misma identidad funciona y no vuelve a vincular", async () => {
    gotrue.add(OP, "clave-de-supabase-1");
    const before = await countAudit("auth_linked_supabase");
    expect((await svc.authenticate(OP, "clave-de-supabase-1")).ok).toBe(true);
    expect((await svc.authenticate(OP, "clave-de-supabase-1")).ok).toBe(true);
    expect(await countAudit("auth_linked_supabase")).toBe(before + 1); // solo el primer ingreso vincula
  });

  it("la contraseña LOCAL de la semilla no sirve en modo Supabase (Supabase es quien verifica)", async () => {
    // El servidor simulado no conoce al usuario: la clave local no abre sesión
    const before = await sessionsOf(db.ids.operator);
    expect((await svc.authenticate(OP, "Operador-demo-Passw0rd!")).ok).toBe(false);
    expect(await sessionsOf(db.ids.operator)).toBe(before);
  });

  it("contraseña incorrecta: rechazo uniforme, sin sesión y auditado sin guardar el correo ingresado", async () => {
    gotrue.add(OP, "clave-de-supabase-1");
    const before = await countAudit("login_unknown_user");
    const sess = await sessionsOf(db.ids.operator);
    const r = await svc.authenticate(OP, "otra-clave");
    expect(r).toEqual({ ok: false });
    expect(await countAudit("login_unknown_user")).toBe(before + 1);
    expect(await sessionsOf(db.ids.operator)).toBe(sess);
  });

  it("correo SIN confirmar en Supabase: no hay acceso", async () => {
    gotrue.add("lector@demo.hubcircular.test", "clave-supabase-2", false);
    expect((await svc.authenticate("lector@demo.hubcircular.test", "clave-supabase-2")).ok).toBe(false);
    expect(await linked("lector@demo.hubcircular.test")).toBeNull();
  });

  it("registrarse en Supabase NO da acceso: sin perfil creado por un administrador no hay sesión ni perfil nuevo", async () => {
    gotrue.add("intruso@externo.test", "clave-supabase-3");
    const n = (await q<{ n: number }>("select count(*)::int n from hc.profiles"))[0]!.n;
    expect((await svc.authenticate("intruso@externo.test", "clave-supabase-3")).ok).toBe(false);
    expect((await q<{ n: number }>("select count(*)::int n from hc.profiles"))[0]!.n).toBe(n);
  });

  it("perfil desactivado: no entra aunque su cuenta de Supabase siga válida y no queda vinculado", async () => {
    const email = "inactivo@demo.hubcircular.test";
    const id = await mk(email, "Inactivo");
    await db.asActor(db.ids.admin, (c) => c.query("select hc.admin_set_user_active($1,$2,false)", [db.ids.admin, id]));
    gotrue.add(email, "clave-supabase-4");
    expect((await svc.authenticate(email, "clave-supabase-4")).ok).toBe(false);
    expect(await linked(email)).toBeNull();
  });

  it("misma dirección de correo pero OTRA identidad de Supabase: se rechaza (no hay toma de cuenta)", async () => {
    const email = "vinculado@demo.hubcircular.test";
    await mk(email, "Vinculado");
    const first = gotrue.add(email, "clave-original-1");
    expect((await svc.authenticate(email, "clave-original-1")).ok).toBe(true);
    // El usuario se borra y se recrea en Supabase (otro id) o alguien consigue otra cuenta con ese correo
    gotrue.users.clear();
    const second = gotrue.add(email, "clave-original-2");
    expect(second.id).not.toBe(first.id);
    expect((await svc.authenticate(email, "clave-original-2")).ok).toBe(false);
    expect(await linked(email)).toBe(first.id);
  });

  it("una identidad de Supabase no puede vincularse a dos perfiles", async () => {
    const id = crypto.randomUUID();
    const a = (await q<{ o: string[] }>("select array_agg(o_user_id) o from hc.auth_link_supabase($1,$2)", ["lector@demo.hubcircular.test", id]))[0]!.o;
    expect(a).toHaveLength(1);
    const b = (await q<{ o: string[] | null }>("select array_agg(o_user_id) o from hc.auth_link_supabase($1,$2)", ["admin@demo.hubcircular.test", id]))[0]!.o;
    expect(b).toBeNull();
    await q("update hc.profiles set auth_user_id = null where email = 'lector@demo.hubcircular.test'");
  });

  it("servicio caído, límite de tasa o respuesta ilegible: se informa «no disponible», sin sesión y sin marcar como fallo de clave", async () => {
    gotrue.add(OP, "clave-de-supabase-1");
    const before = await countAudit("login_unknown_user");
    for (const mode of ["down", "rate", "malformed"] as const) {
      gotrue.mode = mode;
      expect(await svc.authenticate(OP, "clave-de-supabase-1")).toEqual({ ok: false, reason: "unavailable" });
    }
    expect(await countAudit("login_unknown_user")).toBe(before);
  });

  it("servidor Auth inalcanzable (puerto cerrado) → no disponible", async () => {
    const old = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "http://127.0.0.1:1";
    try {
      expect(await svc.authenticate(OP, "x")).toEqual({ ok: false, reason: "unavailable" });
    } finally {
      process.env.SUPABASE_URL = old;
    }
  });

  it("una clave service_role en la configuración se rechaza antes de llamar a Supabase", async () => {
    const old = process.env.SUPABASE_PUBLISHABLE_KEY;
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_secret_NO_USAR";
    try {
      await expect(svc.authenticate(OP, "x")).rejects.toThrow(/secreta|service_role/);
      expect(gotrue.requests).toHaveLength(0);
    } finally {
      process.env.SUPABASE_PUBLISHABLE_KEY = old;
    }
  });

  it("desactivar el perfil cierra la sesión abierta con Supabase (la autorización es de HubCircular)", async () => {
    const email = "sesion@demo.hubcircular.test";
    await mk(email, "Con sesión");
    gotrue.add(email, "clave-supabase-5");
    const r = await svc.authenticate(email, "clave-supabase-5");
    if (!r.ok) throw new Error("login");
    expect(await svc.resolveSession(r.token)).not.toBeNull();
    const id = (await q<{ id: string }>("select id from hc.profiles where email=$1", [email]))[0]!.id;
    await db.asActor(db.ids.admin, (c) => c.query("select hc.admin_set_user_active($1,$2,false)", [db.ids.admin, id]));
    expect(await svc.resolveSession(r.token)).toBeNull();
  });
});

describe("gestión de usuarios con Supabase Auth", () => {
  it("el alta crea perfil y rol SIN credencial local ni clave temporal", async () => {
    const r = await users.createUser(adminActor, { email: "nuevo.supabase@demo.hubcircular.test", name: "Nuevo Supabase", role: "operador", zoneId: db.ids.zoneCowork });
    expect(r.tempPassword).toBeNull();
    expect((await q<{ n: number }>("select count(*)::int n from hc.local_credentials where user_id=$1", [r.userId]))[0]!.n).toBe(0);
    expect((await q<{ n: number }>("select count(*)::int n from hc.user_roles where user_id=$1", [r.userId]))[0]!.n).toBe(1);
    // Y puede ingresar en cuanto exista en Supabase con el mismo correo confirmado
    gotrue.add("nuevo.supabase@demo.hubcircular.test", "clave-supabase-6");
    const login = await svc.authenticate("nuevo.supabase@demo.hubcircular.test", "clave-supabase-6");
    expect(login.ok).toBe(true);
    if (login.ok) expect((await svc.resolveSession(login.token))?.mustChangePassword).toBe(false);
  });

  it("restablecer o cambiar contraseña en HubCircular se rechaza: se administran en Supabase", async () => {
    await expect(users.resetUserPassword(adminActor, db.ids.operator)).rejects.toMatchObject({ code: "auth_external" });
    await expect(users.changeOwnPassword(adminActor, { current: "a", next: "b".repeat(14) })).rejects.toMatchObject({ code: "auth_external" });
  });

  it("volver a proveedor local: el administrador restablece la clave y el usuario sin credencial local puede entrar", async () => {
    const email = "vuelta.local@demo.hubcircular.test";
    const c = await users.createUser(adminActor, { email, name: "Vuelta Local", role: "lector", zoneId: null });
    process.env.AUTH_PROVIDER = "local";
    try {
      expect((await svc.authenticate(email, "cualquiera")).ok).toBe(false);
      const { tempPassword } = await users.resetUserPassword(adminActor, c.userId);
      const r = await svc.authenticate(email, tempPassword);
      expect(r.ok).toBe(true);
      if (r.ok) expect((await svc.resolveSession(r.token))?.mustChangePassword).toBe(true);
    } finally {
      process.env.AUTH_PROVIDER = "supabase";
    }
  });
});

describe("permisos de la base para el vínculo", () => {
  it("auth_user_id no es legible por hc_app; auth_link_supabase solo la ejecuta hc_app", async () => {
    const app = await db.appClient();
    try {
      await expect(app.query("select auth_user_id from hc.profiles")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await app.end();
    }
    const p = (await q<{ anon: boolean; auth: boolean; pub: boolean; app: boolean }>(
      `select has_function_privilege('anon','hc.auth_link_supabase(text,uuid)','execute') anon,
              has_function_privilege('authenticated','hc.auth_link_supabase(text,uuid)','execute') auth,
              has_function_privilege('public','hc.auth_link_supabase(text,uuid)','execute') pub,
              has_function_privilege('hc_app','hc.auth_link_supabase(text,uuid)','execute') app`,
    ))[0]!;
    expect(p).toEqual({ anon: false, auth: false, pub: false, app: true });
  });

  it("en modo local el comportamiento anterior no cambia (clave local, bloqueo y sesión)", async () => {
    process.env.AUTH_PROVIDER = "local";
    try {
      expect((await svc.authenticate("admin@demo.hubcircular.test", "Admin-demo-Passw0rd!")).ok).toBe(true);
      expect((await svc.authenticate("admin@demo.hubcircular.test", "mala")).ok).toBe(false);
    } finally {
      process.env.AUTH_PROVIDER = "supabase";
    }
  });
});
