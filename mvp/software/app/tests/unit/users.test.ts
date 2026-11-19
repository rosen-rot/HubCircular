import { describe, expect, it } from "vitest";
import { DomainError, mapDbError } from "@/lib/errors";
import { generateTempPassword, validateNewPassword } from "@/modules/identity/password-policy";
import { assertCan, can } from "@/modules/identity/permissions";
import type { Actor } from "@/modules/identity/types";
import { parseAddRole, parseChangePassword, parseCreateUser } from "@/modules/users/schema";

const U = "00000000-0000-4000-8000-000000000001";
const actor = (role: "administrador" | "operador" | "lector", mustChange = false): Actor => ({
  userId: "u", email: "u@x.test", displayName: "U", roles: [{ role, zoneId: null }], mustChangePassword: mustChange,
});

describe("clave temporal", () => {
  it("formato XXXX-XXXX-XXXX-XXXX, sin caracteres ambiguos y distinta en cada llamada", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toMatch(/^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$/);
      expect(p).not.toMatch(/[01OILl]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});

describe("política de contraseñas", () => {
  it("exige 12+ caracteres y rechaza claves triviales, comunes, iguales al correo o a la actual", () => {
    expect(validateNewPassword("corta")).toMatch(/12/);
    expect(validateNewPassword("a".repeat(129))).toMatch(/128/);
    expect(validateNewPassword("aaaaaaaaaaaa")).toMatch(/simple/);
    expect(validateNewPassword("            ")).toMatch(/simple/);
    expect(validateNewPassword("hubcircular123")).toMatch(/común/);
    expect(validateNewPassword("maria.perez@hub.cl", { email: "maria.perez@hub.cl" })).toMatch(/correo/);
    expect(validateNewPassword("xx-maria.perez-xx", { email: "maria.perez@hub.cl" })).toMatch(/correo/);
    expect(validateNewPassword("la-misma-clave-123", { current: "la-misma-clave-123" })).toMatch(/distinta/);
  });
  it("acepta frases largas sin reglas de composición", () => {
    expect(validateNewPassword("caballo bateria grapa correcta", { email: "a@b.cl", current: "otra" })).toBeNull();
    expect(validateNewPassword("soloMinusculasLargas", {})).toBeNull();
  });
});

describe("formularios de usuarios", () => {
  it("alta: normaliza correo y nombre, exige zona para operador", () => {
    const ok = parseCreateUser({ email: "  Ana@Hub.CL ", name: "  Ana   Pérez ", role: "operador", zoneId: U });
    expect(ok).toMatchObject({ ok: true, value: { email: "ana@hub.cl", name: "Ana Pérez", role: "operador", zoneId: U } });
    expect(parseCreateUser({ email: "ana@hub.cl", name: "Ana", role: "operador", zoneId: "" })).toMatchObject({ ok: false });
    expect(parseCreateUser({ email: "ana@hub.cl", name: "Ana", role: "administrador", zoneId: "" })).toMatchObject({ ok: true, value: { zoneId: null } });
    expect(parseCreateUser({ email: "ana@hub.cl", name: "Ana", role: "lector", zoneId: "all" })).toMatchObject({ ok: true, value: { zoneId: null } });
  });
  it("alta: correo, nombre, rol y zona inválidos", () => {
    for (const bad of [
      { email: "no", name: "A", role: "lector", zoneId: "" },
      { email: "a@b.cl", name: "   ", role: "lector", zoneId: "" },
      { email: "a@b.cl", name: "x".repeat(121), role: "lector", zoneId: "" },
      { email: "a@b.cl", name: "A", role: "root", zoneId: "" },
      { email: "a@b.cl", name: "A", role: "lector", zoneId: "no-uuid" },
    ]) {
      expect(parseCreateUser(bad)).toMatchObject({ ok: false });
    }
  });
  it("rol adicional y cambio de contraseña", () => {
    expect(parseAddRole({ userId: U, role: "lector", zoneId: "" })).toMatchObject({ ok: true });
    expect(parseAddRole({ userId: "x", role: "lector", zoneId: "" })).toMatchObject({ ok: false });
    expect(parseAddRole({ userId: U, role: "operador", zoneId: "" })).toMatchObject({ ok: false });
    expect(parseChangePassword({ current: "temp", next: "frase larga de prueba", repeat: "frase larga de prueba" }, "a@b.cl")).toMatchObject({ ok: true });
    expect(parseChangePassword({ current: "temp", next: "frase larga de prueba", repeat: "otra" }, "a@b.cl")).toMatchObject({ ok: false, errors: { repeat: expect.any(String) } });
    expect(parseChangePassword({ current: "", next: "frase larga de prueba", repeat: "frase larga de prueba" }, "a@b.cl")).toMatchObject({ ok: false, errors: { current: expect.any(String) } });
    expect(parseChangePassword({ current: "temp", next: "corta", repeat: "corta" }, "a@b.cl")).toMatchObject({ ok: false, errors: { next: expect.any(String) } });
  });
});

describe("clave temporal pendiente de cambio", () => {
  it("bloquea todos los permisos salvo cambiar la propia contraseña", () => {
    const a = actor("administrador", true);
    for (const p of ["weighing:create", "movement:create", "user:manage", "destination:manage", "batch:read", "catalog:read"] as const) {
      expect(can(a, p)).toBe(false);
      expect(() => assertCan(a, p)).toThrowError(expect.objectContaining({ code: "password_change_required", status: 403 }));
    }
    expect(can(a, "account:password")).toBe(true);
    expect(() => assertCan(a, "account:password")).not.toThrow();
  });
  it("sin clave temporal, la matriz normal y todos pueden cambiar su contraseña", () => {
    expect(can(actor("operador"), "weighing:create")).toBe(true);
    expect(can(actor("lector"), "user:manage")).toBe(false);
    expect(can(actor("administrador"), "user:manage")).toBe(true);
    for (const r of ["administrador", "operador", "lector"] as const) expect(can(actor(r), "account:password")).toBe(true);
    expect(can(null, "account:password")).toBe(false);
  });
  it("códigos de error de usuarios: mensaje y estado HTTP", () => {
    const cases: [string, string, number][] = [
      ["user_exists", "HC409", 409], ["user_not_found", "HC404", 404], ["role_exists", "HC409", 409],
      ["role_not_found", "HC404", 404], ["last_admin", "HC422", 422], ["last_role", "HC422", 422],
      ["cannot_deactivate_self", "HC422", 422], ["cannot_reset_self", "HC422", 422], ["email_invalid", "HC422", 422],
    ];
    for (const [message, code, status] of cases) {
      const e = mapDbError({ code, message });
      expect(e).toBeInstanceOf(DomainError);
      expect(e).toMatchObject({ code: message, status });
      expect(e.userMessage.length).toBeGreaterThan(10);
    }
  });
});
