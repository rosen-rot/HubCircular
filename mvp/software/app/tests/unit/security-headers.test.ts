import { describe, expect, it } from "vitest";
import { buildCsp, newNonce, securityHeaders } from "@/lib/security-headers";

const base = { nonce: "abc123==", https: false, dev: false };

describe("security headers", () => {
  it("CSP de producción: script solo con nonce, sin unsafe-inline/unsafe-eval en scripts", () => {
    const csp = buildCsp(base);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toContain("'nonce-abc123=='");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("desarrollo agrega eval y websockets; producción no", () => {
    expect(buildCsp({ ...base, dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ ...base, dev: true })).toContain("ws:");
    expect(buildCsp(base)).not.toContain("ws:");
  });

  it("HSTS y upgrade-insecure-requests solo con HTTPS", () => {
    const http = securityHeaders(base);
    expect(http["Strict-Transport-Security"]).toBeUndefined();
    const https = securityHeaders({ ...base, https: true });
    expect(https["Strict-Transport-Security"]).toMatch(/max-age=31536000; includeSubDomains/);
    expect(https["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
  });

  it("incluye el resto de cabeceras de endurecimiento", () => {
    const h = securityHeaders(base);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("el nonce es base64 aleatorio y distinto en cada llamada", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});
