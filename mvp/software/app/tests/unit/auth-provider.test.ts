import { describe, expect, it } from "vitest";
import { authProviderName, looksLikeSecretKey, supabaseAuthConfig } from "@/modules/identity/auth-provider";
import { verifyWithSupabase } from "@/modules/identity/supabase-auth";

const jwt = (role: string) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.firma`;
const CFG = { url: "https://abc.supabase.co", publishableKey: "sb_publishable_x" };
const UID = "0b9f2d3e-5c1a-4f6e-8a77-1d2c3b4a5e6f";

describe("AUTH_PROVIDER", () => {
  it("por defecto es local; acepta supabase; rechaza otros valores", () => {
    expect(authProviderName({})).toBe("local");
    expect(authProviderName({ AUTH_PROVIDER: " Local " })).toBe("local");
    expect(authProviderName({ AUTH_PROVIDER: "SUPABASE" })).toBe("supabase");
    expect(() => authProviderName({ AUTH_PROVIDER: "firebase" })).toThrow(/local.*supabase/);
  });
});

describe("configuración de Supabase Auth", () => {
  it("exige URL y clave", () => {
    expect(() => supabaseAuthConfig({})).toThrow(/SUPABASE_URL/);
    expect(() => supabaseAuthConfig({ SUPABASE_URL: "https://a.supabase.co" })).toThrow(/SUPABASE_PUBLISHABLE_KEY/);
  });
  it("normaliza a origen (sin ruta ni barra final) y acepta la clave publicable", () => {
    expect(supabaseAuthConfig({ SUPABASE_URL: "https://abc.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" })).toEqual({
      url: "https://abc.supabase.co",
      publishableKey: "sb_publishable_x",
    });
    expect(supabaseAuthConfig({ SUPABASE_URL: "https://abc.supabase.co/auth/v1", SUPABASE_PUBLISHABLE_KEY: jwt("anon") }).url).toBe("https://abc.supabase.co");
  });
  it("http solo para localhost; rechaza credenciales en la URL", () => {
    expect(supabaseAuthConfig({ SUPABASE_URL: "http://127.0.0.1:9999", SUPABASE_PUBLISHABLE_KEY: "k" }).url).toBe("http://127.0.0.1:9999");
    expect(() => supabaseAuthConfig({ SUPABASE_URL: "http://abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" })).toThrow(/https/);
    expect(() => supabaseAuthConfig({ SUPABASE_URL: "https://u:p@abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: "k" })).toThrow(/credenciales/);
    expect(() => supabaseAuthConfig({ SUPABASE_URL: "no-es-url", SUPABASE_PUBLISHABLE_KEY: "k" })).toThrow(/válida/);
  });
  it("rechaza claves secretas / service_role y no las repite en el mensaje", () => {
    for (const key of ["sb_secret_ABC123", jwt("service_role")]) {
      expect(looksLikeSecretKey(key)).toBe(true);
      try {
        supabaseAuthConfig({ SUPABASE_URL: "https://abc.supabase.co", SUPABASE_PUBLISHABLE_KEY: key });
        throw new Error("debió fallar");
      } catch (e) {
        expect((e as Error).message).toMatch(/secreta|service_role/);
        expect((e as Error).message).not.toContain(key);
      }
    }
    expect(looksLikeSecretKey(jwt("anon"))).toBe(false);
    expect(looksLikeSecretKey("sb_publishable_ok")).toBe(false);
  });
});

function fakeFetch(status: number, body: unknown, calls: { url: string; init: RequestInit }[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/logout")) return new Response(null, { status: 204 });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}
const okBody = (over: Record<string, unknown> = {}) => ({ access_token: "tok", user: { id: UID, email: "a@x.cl", email_confirmed_at: "2026-01-01", ...over } });

describe("verifyWithSupabase", () => {
  it("éxito: identidad verificada, correo normalizado, clave publicable en la cabecera y sesión de Supabase revocada", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const r = await verifyWithSupabase(CFG, "  A@X.cl ", "pw", fakeFetch(200, okBody(), calls));
    expect(r).toEqual({ ok: true, authUserId: UID, email: "a@x.cl" });
    expect(calls[0]!.url).toBe("https://abc.supabase.co/auth/v1/token?grant_type=password");
    expect((calls[0]!.init.headers as Record<string, string>).apikey).toBe("sb_publishable_x");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ email: "a@x.cl", password: "pw" });
    await new Promise((r2) => setTimeout(r2, 5));
    expect(calls.some((c) => c.url.endsWith("/auth/v1/logout"))).toBe(true);
  });
  it("credenciales inválidas (400/401/422) → invalid", async () => {
    for (const s of [400, 401, 422]) expect(await verifyWithSupabase(CFG, "a@x.cl", "x", fakeFetch(s, { error: "invalid_grant" }))).toEqual({ ok: false, reason: "invalid" });
  });
  it("429, 5xx, red caída o cuerpo ilegible → unavailable", async () => {
    for (const s of [429, 500, 503]) expect(await verifyWithSupabase(CFG, "a@x.cl", "x", fakeFetch(s, {}))).toEqual({ ok: false, reason: "unavailable" });
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await verifyWithSupabase(CFG, "a@x.cl", "x", boom)).toEqual({ ok: false, reason: "unavailable" });
    expect(await verifyWithSupabase(CFG, "a@x.cl", "x", fakeFetch(200, "<html>"))).toEqual({ ok: false, reason: "unavailable" });
  });
  it("correo sin confirmar, correo distinto o id inválido → invalid aunque Supabase responda 200", async () => {
    expect(await verifyWithSupabase(CFG, "a@x.cl", "x", fakeFetch(200, okBody({ email_confirmed_at: null })))).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyWithSupabase(CFG, "a@x.cl", "x", fakeFetch(200, okBody({ email: "otro@x.cl" })))).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyWithSupabase(CFG, "a@x.cl", "x", fakeFetch(200, okBody({ id: "no-uuid" })))).toEqual({ ok: false, reason: "invalid" });
  });
});
