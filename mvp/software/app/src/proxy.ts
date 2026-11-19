import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirección de cortesía: sin cookie de sesión, las rutas privadas llevan a /login.
 * NO es la barrera de seguridad: cada página, acción y endpoint valida la sesión en el servidor y la BD aplica RLS.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = pathname === "/login" || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  if (isPublic || request.cookies.has("hc_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Debe iniciar sesión." } }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
