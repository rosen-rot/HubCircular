import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, PASSWORDS, type TestDb } from "../helpers/db";

let db: TestDb;
type Svc = typeof import("../../src/modules/identity/service");
let svc: Svc;

beforeAll(async () => {
  db = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DB_APP_ROLE = "hc_app";
  svc = await import("../../src/modules/identity/service");
});
afterAll(async () => {
  const { getPool } = await import("../../src/lib/db");
  await getPool().end();
  await db.drop();
});

const OP = "operador@demo.hubcircular.test";

describe("autenticación local", () => {
  it("login correcto devuelve token; la sesión resuelve usuario y roles con ámbito", async () => {
    const r = await svc.authenticate(OP, PASSWORDS.operator);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const actor = await svc.resolveSession(r.token);
    expect(actor).toMatchObject({ userId: db.ids.operator, email: OP, displayName: expect.stringContaining("Operador") });
    expect(actor?.roles).toEqual([{ role: "operador", zoneId: db.ids.zoneCowork }]);
  });

  it("el correo no distingue mayúsculas/espacios", async () => {
    expect((await svc.authenticate("  OPERADOR@Demo.HubCircular.test ", PASSWORDS.operator)).ok).toBe(true);
  });

  it("la BD guarda solo el hash del token (un volcado no permite suplantar sesiones)", async () => {
    const r = await svc.authenticate(OP, PASSWORDS.operator);
    if (!r.ok) throw new Error("login");
    const rows = (await db.admin.query("select token_hash from hc.local_sessions")).rows.map((x) => x.token_hash);
    expect(rows).not.toContain(r.token);
    expect(rows.every((h: string) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    const hashes = (await db.admin.query("select password_hash from hc.local_credentials")).rows.map((x) => x.password_hash);
    expect(hashes.every((h: string) => h.startsWith("scrypt$") && !Object.values(PASSWORDS).some((p) => h.includes(p)))).toBe(true);
  });

  it("clave errónea, correo inexistente y cuenta inactiva dan la misma respuesta (sin enumerar usuarios)", async () => {
    expect(await svc.authenticate(OP, "mala-clave-123")).toEqual({ ok: false });
    expect(await svc.authenticate("nadie@demo.hubcircular.test", "lo-que-sea-123")).toEqual({ ok: false });
    await db.admin.query("update hc.profiles set active=false where id=$1", [db.ids.reader]);
    expect(await svc.authenticate("lector@demo.hubcircular.test", PASSWORDS.reader)).toEqual({ ok: false });
    await db.admin.query("update hc.profiles set active=true where id=$1", [db.ids.reader]);
  });

  it("bloquea la cuenta tras 5 fallos, incluso con la clave correcta, y se audita sin guardar lo digitado", async () => {
    const email = "lector@demo.hubcircular.test";
    for (let i = 0; i < 5; i++) expect(await svc.authenticate(email, "incorrecta-" + i)).toEqual({ ok: false });
    expect(await svc.authenticate(email, PASSWORDS.reader)).toEqual({ ok: false }); // bloqueada
    const audit = (await db.admin.query("select action from hc.audit_logs where entity='auth' and actor_id=$1", [db.ids.reader])).rows.map((r) => r.action);
    expect(audit).toContain("login_locked");
    // expira el bloqueo → vuelve a funcionar y se reinician los contadores
    await db.admin.query("update hc.local_credentials set locked_until = now() - interval '1 second' where user_id=$1", [db.ids.reader]);
    expect((await svc.authenticate(email, PASSWORDS.reader)).ok).toBe(true);
    const c = (await db.admin.query("select failed_attempts, locked_until from hc.local_credentials where user_id=$1", [db.ids.reader])).rows[0];
    expect(c).toEqual({ failed_attempts: 0, locked_until: null });
    const unknownAudit = (await db.admin.query("select * from hc.audit_logs where action='login_unknown_user'")).rows;
    for (const a of unknownAudit) expect(a.new_summary).toBeNull();
  });

  it("sesión expirada, cerrada o de usuario desactivado no resuelve", async () => {
    const r = await svc.authenticate(OP, PASSWORDS.operator);
    if (!r.ok) throw new Error("login");
    expect(await svc.resolveSession(r.token)).not.toBeNull();
    // desactivar usuario
    await db.admin.query("update hc.profiles set active=false where id=$1", [db.ids.operator]);
    expect(await svc.resolveSession(r.token)).toBeNull();
    await db.admin.query("update hc.profiles set active=true where id=$1", [db.ids.operator]);
    // expirar
    await db.admin.query("update hc.local_sessions set expires_at = now() - interval '1 minute'");
    expect(await svc.resolveSession(r.token)).toBeNull();
    // token inventado
    expect(await svc.resolveSession("token-inventado")).toBeNull();
  });

  it("cerrar sesión elimina la sesión en servidor", async () => {
    const r = await svc.authenticate(OP, PASSWORDS.operator);
    if (!r.ok) throw new Error("login");
    const { anon } = await import("../../src/lib/db");
    const { hashSessionToken } = await import("../../src/modules/identity/session");
    await anon.query("select hc.auth_delete_session($1)", [hashSessionToken(r.token)]);
    expect(await svc.resolveSession(r.token)).toBeNull();
  });
});
