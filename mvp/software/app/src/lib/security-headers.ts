/**
 * Cabeceras de seguridad HTTP (puras y sin dependencias de Next, para poder probarlas).
 *
 * CSP con nonce por solicitud: los scripts solo se ejecutan si Next les agrega ese nonce (o los carga uno
 * que lo tenga, «strict-dynamic»). Los estilos permiten `unsafe-inline` porque React/Next emiten atributos
 * `style` y etiquetas `<style>`; el riesgo es bajo (sin scripts inline) y evita romper la interfaz.
 * HSTS y «upgrade-insecure-requests» solo se envían tras HTTPS (SESSION_COOKIE_SECURE=true): enviarlos por
 * http local rompería el desarrollo.
 */
export interface SecurityHeaderOptions {
  nonce: string;
  /** Detrás de HTTPS (producción). */
  https: boolean;
  /** `next dev` necesita eval y websockets para el refresco en caliente. */
  dev: boolean;
}

export function buildCsp({ nonce, https, dev }: SecurityHeaderOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (https) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: SecurityHeaderOptions): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Security-Policy": buildCsp(opts),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (opts.https) h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return h;
}

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
