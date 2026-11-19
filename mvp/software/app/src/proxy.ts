import { NextResponse, type NextRequest } from "next/server";
import { newNonce, securityHeaders } from "@/lib/security-headers";

function withHeaders(res: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

/**
 * 1) Cabeceras de seguridad con CSP por nonce en TODA respuesta (páginas, redirecciones y 401 de la API).
 * 2) Redirección de cortesía: sin cookie de sesión, las rutas privadas llevan a /login.
 *    NO es la barrera de seguridad: cada página, acción y endpoint valida la sesión en el servidor y la BD aplica RLS.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const headers = securityHeaders({
    nonce,
    https: process.env.SESSION_COOKIE_SECURE === "true",
    dev: process.env.NODE_ENV !== "production",
  });

  const { pathname, search } = request.nextUrl;
  const isPublic = pathname === "/login" || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  if (isPublic || request.cookies.has("hc_session")) {
    // Next lee el nonce de la CSP de la solicitud y lo aplica a sus scripts.
    const forwarded = new Headers(request.headers);
    forwarded.set("x-nonce", nonce);
    forwarded.set("Content-Security-Policy", headers["Content-Security-Policy"]!);
    return withHeaders(NextResponse.next({ request: { headers: forwarded } }), headers);
  }
  if (pathname.startsWith("/api/")) {
    return withHeaders(
      NextResponse.json({ error: { code: "unauthenticated", message: "Debe iniciar sesión." } }, { status: 401 }),
      headers,
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return withHeaders(NextResponse.redirect(url), headers);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
