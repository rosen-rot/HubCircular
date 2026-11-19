/**
 * Defensa en profundidad contra CSRF para endpoints con cookie de sesión (SameSite=Lax ya bloquea la mayoría).
 * Si el navegador envía `Origin`, su host debe coincidir con el `Host` de la petición. Sin `Origin`
 * (clientes no navegador como curl o un ESP32) se permite: no hay cookie ambiente que explotar.
 */
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function isJsonContentType(value: string | null): boolean {
  return /^application\/json\s*(;|$)/i.test(value ?? "");
}
