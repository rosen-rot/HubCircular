import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/identity/password";
import { assertCan, can, safeNextPath } from "@/modules/identity/permissions";
import { hashSessionToken, newSessionToken } from "@/modules/identity/session";
import type { Actor } from "@/modules/identity/types";
import { DomainError, mapDbError } from "@/lib/errors";

const fast = { N: 2 ** 10, r: 8, p: 1 };
const actor = (role: "administrador" | "operador" | "lector"): Actor => ({
  userId: "u", email: "u@x.test", displayName: "U", roles: [{ role, zoneId: null }],
});

describe("contraseñas (scrypt)", () => {
  it("verifica la correcta y rechaza la errónea; hashes distintos por sal", async () => {
    const h1 = await hashPassword("clave-correcta-123", fast);
    const h2 = await hashPassword("clave-correcta-123", fast);
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain("clave-correcta");
    expect(await verifyPassword("clave-correcta-123", h1)).toBe(true);
    expect(await verifyPassword("otra", h1)).toBe(false);
  });
  it("rechaza hashes malformados sin lanzar", async () => {
    for (const bad of ["", "x", "scrypt$1$2", "bcrypt$1$2$3$4$5", "scrypt$a$b$c$d$e"]) {
      expect(await verifyPassword("x", bad)).toBe(false);
    }
  });
});

describe("tokens de sesión", () => {
  it("son aleatorios y se almacenan solo como hash", () => {
    const a = newSessionToken();
    expect(a).not.toBe(newSessionToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).not.toContain(a);
  });
});

describe("permisos (RBAC)", () => {
  it("matriz por rol", () => {
    expect(can(actor("operador"), "weighing:create")).toBe(true);
    expect(can(actor("administrador"), "weighing:create")).toBe(true);
    expect(can(actor("lector"), "weighing:create")).toBe(false);
    expect(can(actor("lector"), "weighing:read")).toBe(true);
    expect(can(actor("operador"), "audit:read")).toBe(false);
    expect(can(actor("administrador"), "user:manage")).toBe(true);
    expect(can(actor("operador"), "user:manage")).toBe(false);
    expect(can(null, "weighing:read")).toBe(false);
  });
  it("assertCan lanza unauthenticated / forbidden", () => {
    expect(() => assertCan(null, "weighing:read")).toThrowError(DomainError);
    try { assertCan(actor("lector"), "weighing:create"); } catch (e) { expect((e as DomainError).code).toBe("forbidden"); }
    try { assertCan(undefined, "weighing:create"); } catch (e) { expect((e as DomainError).code).toBe("unauthenticated"); }
  });
});

describe("safeNextPath (sin redirección abierta)", () => {
  it.each([
    ["/historial?x=1", "/historial?x=1"],
    ["/", "/"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["/\\evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["/login", "/"],
    ["/a\nb", "/"],
    [null, "/"],
    [undefined, "/"],
    ["", "/"],
  ])("%j → %j", (input, out) => {
    expect(safeNextPath(input as string | null | undefined)).toBe(out);
  });
});

describe("mapDbError", () => {
  it("traduce SQLSTATE HC* con mensaje conocido y oculta el resto", () => {
    expect(mapDbError({ code: "HC422", message: "tare_not_less_than_gross" }).code).toBe("tare_not_less_than_gross");
    expect(mapDbError({ code: "HC403", message: "forbidden" }).status).toBe(403);
    expect(mapDbError({ code: "HC409", message: "idempotency_conflict" }).status).toBe(409);
    const unknown = mapDbError({ code: "23505", message: "duplicate key value violates ... secret detail" });
    expect(unknown.code).toBe("unexpected");
    expect(unknown.userMessage).not.toContain("secret");
    expect(mapDbError({ code: "HC422", message: "algo_raro" }).code).toBe("unexpected");
  });
});
