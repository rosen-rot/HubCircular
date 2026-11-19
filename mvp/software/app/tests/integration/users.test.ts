import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { hashPassword } from "../../src/modules/identity/password";

let db: TestDb;
let admin: string;
let operator: string;
let reader: string;
let z1: string;
let z2: string;
let hash: string;

const expectErr = (p: Promise<unknown>, message: string, sqlstate?: string) =>
  expect(p).rejects.toMatchObject({ message, ...(sqlstate ? { code: sqlstate } : {}) });

const as = <T>(actor: string, sql: string, params: unknown[] = []) => db.asActor(actor, async (c) => (await c.query(sql, params)).rows as T[]);

async function createUser(actor: string, email: string, role = "operador", zone: string | null = z1, h = hash) {
  const r = await as<{ o_user_id: string }>(actor, "select * from hc.admin_create_user($1,$2,$3,$4,$5,$6)", [actor, email, "Persona de prueba", role, zone, h]);
  return r[0]!.o_user_id;
}
async function session(userId: string, token = crypto.randomUUID()) {
  await db.admin.query("select hc.auth_create_session($1, $2, interval '1 hour')", [userId, token]);
  return token;
}
const sessions = async (userId: string) => Number((await db.admin.query("select count(*)::int n from hc.local_sessions where user_id = $1", [userId])).rows[0].n);

beforeAll(async () => {
  db = await createTestDb();
  ({ admin, operator, reader } = db.ids);
  z1 = db.ids.zoneCowork;
  z2 = db.ids.zoneLab;
  hash = await hashPassword("temporal-de-prueba", { N: 2 ** 10, r: 8, p: 1 });
});
afterAll(async () => {
  await db.drop();
});

describe("alta de usuarios", () => {
  it("el administrador crea un usuario con rol y zona; queda con cambio de clave obligatorio y auditado sin secretos", async () => {
    const id = await createUser(admin, "  Nuevo.Operador@Demo.hubcircular.test ");
    const p = await db.admin.query("select email, display_name, active from hc.profiles where id = $1", [id]);
    expect(p.rows[0]).toMatchObject({ email: "nuevo.operador@demo.hubcircular.test", active: true });
    const c = await db.admin.query("select must_change_password, password_hash from hc.local_credentials where user_id = $1", [id]);
    expect(c.rows[0].must_change_password).toBe(true);
    const r = await db.admin.query("select role, zone_id from hc.user_roles where user_id = $1", [id]);
    expect(r.rows).toEqual([{ role: "operador", zone_id: z1 }]);
    const a = await db.admin.query("select actor_id, new_summary from hc.audit_logs where entity = 'user' and entity_id = $1 and action = 'create'", [id]);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].actor_id).toBe(admin);
    expect(JSON.stringify(a.rows[0].new_summary)).not.toMatch(/scrypt|password/i);
    const all = await db.admin.query("select new_summary::text t from hc.audit_logs where entity = 'user'");
    expect(all.rows.every((x) => !/scrypt/.test(x.t ?? ""))).toBe(true);
  });

  it("rechaza correo duplicado (sin distinguir mayúsculas), correo/rol/zona/hash inválidos", async () => {
    await createUser(admin, "dup@demo.hubcircular.test");
    await expectErr(createUser(admin, "DUP@demo.hubcircular.test"), "user_exists", "HC409");
    await expectErr(createUser(admin, "no-es-correo"), "email_invalid", "HC422");
    await expectErr(createUser(admin, "a@b"), "email_invalid");
    await expectErr(createUser(admin, "x1@demo.hubcircular.test", "superadmin"), "role_invalid");
    await expectErr(createUser(admin, "x2@demo.hubcircular.test", "operador", crypto.randomUUID()), "zone_invalid");
    await expectErr(createUser(admin, "x3@demo.hubcircular.test", "operador", z1, "texto-plano"), "validation");
    await expectErr(createUser(admin, "x4@demo.hubcircular.test", "operador", z1, "scrypt$" + "a".repeat(400)), "validation");
    const n = await db.admin.query("select count(*)::int n from hc.profiles where email like 'x_@demo.hubcircular.test'");
    expect(n.rows[0].n).toBe(0); // los intentos fallidos no dejan filas
  });

  it("solo el administrador: operador y lector reciben forbidden; sin actor, unauthenticated", async () => {
    await expectErr(createUser(operator, "y1@demo.hubcircular.test"), "forbidden", "HC403");
    await expectErr(createUser(reader, "y2@demo.hubcircular.test"), "forbidden", "HC403");
    await expectErr(as(admin, "select * from hc.admin_list_users($1)", [operator]), "unauthenticated", "HC401");
    await expectErr(as(operator, "select * from hc.admin_list_users($1)", [operator]), "forbidden", "HC403");
    await expectErr(db.asActor(null, (c) => c.query("select * from hc.admin_create_user($1,'z@demo.hubcircular.test','Z','lector',null,$2)", [admin, hash])), "unauthenticated");
  });

  it("el listado devuelve roles, zona, bloqueo y último ingreso; el correo y las claves no son legibles por hc_app", async () => {
    const id = await createUser(admin, "lista@demo.hubcircular.test", "lector", null);
    await db.admin.query("select hc.auth_record_success($1)", [id]);
    const rows = await as<{ user_id: string; email: string; roles: { role: string; zoneName: string | null }[]; last_login_at: Date | null; must_change_password: boolean }>(admin, "select * from hc.admin_list_users($1)", [admin]);
    const me = rows.find((r) => r.user_id === id)!;
    expect(me.email).toBe("lista@demo.hubcircular.test");
    expect(me.roles).toMatchObject([{ role: "lector", zoneName: null }]);
    expect(me.last_login_at).toBeInstanceOf(Date);
    expect(me.must_change_password).toBe(true);
    expect(Object.keys(rows[0]!)).not.toContain("password_hash");
    await expect(db.asActor(admin, (c) => c.query("select password_hash from hc.local_credentials"))).rejects.toThrow(/permission denied/i);
    await expect(db.asActor(admin, (c) => c.query("select email from hc.profiles"))).rejects.toThrow(/permission denied/i);
  });
});

describe("activación y protección del último administrador", () => {
  it("desactivar cierra las sesiones del usuario y es idempotente; reactivar lo devuelve", async () => {
    const id = await createUser(admin, "baja@demo.hubcircular.test");
    await session(id);
    await session(id);
    expect(await sessions(id)).toBe(2);
    await as(admin, "select hc.admin_set_user_active($1,$2,false)", [admin, id]);
    expect(await sessions(id)).toBe(0);
    await as(admin, "select hc.admin_set_user_active($1,$2,false)", [admin, id]); // sin efecto
    const a = await db.admin.query("select count(*)::int n from hc.audit_logs where entity = 'user' and entity_id = $1 and action = 'set_active'", [id]);
    expect(a.rows[0].n).toBe(1);
    await as(admin, "select hc.admin_set_user_active($1,$2,true)", [admin, id]);
    expect((await db.admin.query("select active from hc.profiles where id = $1", [id])).rows[0].active).toBe(true);
    await expectErr(as(admin, "select hc.admin_set_user_active($1,$2,true)", [admin, crypto.randomUUID()]), "user_not_found", "HC404");
    await expectErr(as(operator, "select hc.admin_set_user_active($1,$2,false)", [operator, id]), "forbidden");
  });

  it("no se puede desactivar a uno mismo", async () => {
    await expectErr(as(admin, "select hc.admin_set_user_active($1,$2,false)", [admin, admin]), "cannot_deactivate_self", "HC422");
    expect((await db.admin.query("select active from hc.profiles where id = $1", [admin])).rows[0].active).toBe(true);
  });

  it("no se desactiva al último administrador con acceso a todas las zonas; con otro disponible sí", async () => {
    // Un administrador limitado a una zona puede administrar, pero NO cuenta como «acceso total».
    const zonal = await createUser(admin, "zonal@demo.hubcircular.test", "administrador", z1);
    await expectErr(as(zonal, "select hc.admin_set_user_active($1,$2,false)", [zonal, admin]), "last_admin", "HC422");
    expect((await db.admin.query("select active from hc.profiles where id = $1", [admin])).rows[0].active).toBe(true);
    // Con un segundo administrador total, el primero puede desactivarse (y reactivarse)
    const second = await createUser(admin, "admin2@demo.hubcircular.test", "administrador", null);
    await as(second, "select hc.admin_set_user_active($1,$2,false)", [second, admin]);
    expect((await db.admin.query("select active from hc.profiles where id = $1", [admin])).rows[0].active).toBe(false);
    await expectErr(as(admin, "select hc.admin_set_user_active($1,$2,true)", [admin, admin]), "unauthenticated", "HC401"); // un inactivo no actúa
    await expectErr(as(zonal, "select hc.admin_set_user_active($1,$2,false)", [zonal, second]), "last_admin");
    await as(second, "select hc.admin_set_user_active($1,$2,true)", [second, admin]);
  });
});

describe("roles", () => {
  it("agregar y quitar roles; duplicados, zonas y roles inválidos; debe conservar al menos un rol", async () => {
    const id = await createUser(admin, "roles@demo.hubcircular.test", "lector", null);
    const added = await as<{ o_role_id: string }>(admin, "select * from hc.admin_add_role($1,$2,'operador',$3)", [admin, id, z2]);
    await expectErr(as(admin, "select * from hc.admin_add_role($1,$2,'operador',$3)", [admin, id, z2]), "role_exists", "HC409");
    await expectErr(as(admin, "select * from hc.admin_add_role($1,$2,'rey',null)", [admin, id]), "role_invalid");
    await expectErr(as(admin, "select * from hc.admin_add_role($1,$2,'lector',$3)", [admin, id, crypto.randomUUID()]), "zone_invalid");
    await expectErr(as(admin, "select * from hc.admin_add_role($1,$2,'lector',null)", [admin, crypto.randomUUID()]), "user_not_found");
    await expectErr(as(operator, "select * from hc.admin_add_role($1,$2,'administrador',null)", [operator, operator]), "forbidden");
    await as(admin, "select hc.admin_remove_role($1,$2)", [admin, added[0]!.o_role_id]);
    const left = await db.admin.query("select id from hc.user_roles where user_id = $1", [id]);
    expect(left.rows).toHaveLength(1);
    await expectErr(as(admin, "select hc.admin_remove_role($1,$2)", [admin, left.rows[0].id]), "last_role", "HC422");
    await expectErr(as(admin, "select hc.admin_remove_role($1,$2)", [admin, crypto.randomUUID()]), "role_not_found", "HC404");
  });

  it("no se puede quitar el rol del último administrador con acceso total", async () => {
    const adminRole = (await db.admin.query("select id from hc.user_roles where user_id = $1 and role = 'administrador'", [admin])).rows[0].id as string;
    // Ya existen otros administradores en esta base (pruebas previas): se desactivan para aislar el caso
    await db.admin.query("update hc.profiles set active = false where id <> $1 and id in (select user_id from hc.user_roles where role = 'administrador' and zone_id is null)", [admin]);
    await as(admin, "select * from hc.admin_add_role($1,$2,'lector',$3)", [admin, admin, z1]); // para que tenga otro rol
    await expectErr(as(admin, "select hc.admin_remove_role($1,$2)", [admin, adminRole]), "last_admin", "HC422");
  });
});

describe("restablecer y cambiar contraseña", () => {
  it("restablecer: nueva clave temporal, cambio obligatorio, desbloqueo y cierre de sesiones; no a uno mismo", async () => {
    const id = await createUser(admin, "reset@demo.hubcircular.test");
    await db.admin.query("update hc.local_credentials set must_change_password = false, failed_attempts = 3, locked_until = now() + interval '10 minutes' where user_id = $1", [id]);
    await session(id);
    const newHash = await hashPassword("otra-temporal", { N: 2 ** 10, r: 8, p: 1 });
    await as(admin, "select hc.admin_reset_password($1,$2,$3)", [admin, id, newHash]);
    const c = (await db.admin.query("select password_hash, must_change_password, failed_attempts, locked_until from hc.local_credentials where user_id = $1", [id])).rows[0];
    expect(c).toMatchObject({ password_hash: newHash, must_change_password: true, failed_attempts: 0, locked_until: null });
    expect(await sessions(id)).toBe(0);
    await expectErr(as(admin, "select hc.admin_reset_password($1,$2,$3)", [admin, admin, newHash]), "cannot_reset_self", "HC422");
    await expectErr(as(admin, "select hc.admin_reset_password($1,$2,'texto')", [admin, id]), "validation");
    await expectErr(as(admin, "select hc.admin_reset_password($1,$2,$3)", [admin, crypto.randomUUID(), newHash]), "user_not_found");
    await expectErr(as(operator, "select hc.admin_reset_password($1,$2,$3)", [operator, id, newHash]), "forbidden");
    const a = await db.admin.query("select new_summary from hc.audit_logs where entity = 'user' and entity_id = $1 and action = 'reset_password'", [id]);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].new_summary).toBeNull();
  });

  it("resolve_session informa must_change_password; cambiar la propia clave lo limpia y cierra las demás sesiones", async () => {
    const id = await createUser(admin, "cambio@demo.hubcircular.test");
    const keep = await session(id, "token-a");
    await session(id, "token-b");
    const flag = async (t: string) => (await as<{ must_change_password: boolean }>(admin, "select * from hc.auth_resolve_session($1)", [t]))[0]?.must_change_password;
    expect(await flag("token-a")).toBe(true);
    const newHash = await hashPassword("clave-nueva-larga-123", { N: 2 ** 10, r: 8, p: 1 });
    await as(id, "select hc.auth_change_password($1,$2,$3)", [id, newHash, keep]);
    expect(await flag("token-a")).toBe(false);
    expect(await flag("token-b")).toBeUndefined();
    expect(await sessions(id)).toBe(1);
    expect((await db.admin.query("select password_hash from hc.local_credentials where user_id = $1", [id])).rows[0].password_hash).toBe(newHash);
    await expectErr(as(id, "select hc.auth_change_password($1,$2,null)", [id, "texto"]), "validation");
    await expectErr(as(operator, "select hc.auth_change_password($1,$2,null)", [id, newHash]), "unauthenticated");
  });

  it("un usuario inactivo no puede cambiar clave ni administrar; la sesión de un inactivo no se resuelve", async () => {
    const id = await createUser(admin, "inactivo@demo.hubcircular.test");
    const t = await session(id);
    await db.admin.query("update hc.profiles set active = false where id = $1", [id]);
    expect(await as(admin, "select * from hc.auth_resolve_session($1)", [t])).toHaveLength(0);
    await expectErr(as(id, "select hc.auth_change_password($1,$2,null)", [id, hash]), "unauthenticated");
  });
});

describe("privilegios", () => {
  it("las funciones nuevas no son ejecutables por anon/authenticated y hc_app no escribe directamente", async () => {
    const r = await db.admin.query(
      `select count(*)::int n from pg_proc f join pg_namespace n on n.oid = f.pronamespace and n.nspname = 'hc'
        cross join unnest(array['anon','authenticated']) r
        where (f.proname like 'admin\\_%' or f.proname in ('auth_change_password','auth_resolve_session','_other_active_admins'))
          and has_function_privilege(r, f.oid, 'EXECUTE')`,
    );
    expect(r.rows[0].n).toBe(0);
    for (const sql of [
      "insert into hc.profiles (email, display_name) values ('intruso@x.test','x')",
      "update hc.profiles set active = false",
      "insert into hc.user_roles (user_id, role) values (gen_random_uuid(), 'administrador')",
      "update hc.local_credentials set must_change_password = false",
    ]) {
      await expect(db.asActor(admin, (c) => c.query(sql))).rejects.toThrow(/permission denied/i);
    }
    await expect(db.asActor(admin, (c) => c.query("select hc._other_active_admins(null, null)"))).rejects.toThrow(/permission denied/i);
  });
});
