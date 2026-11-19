import { assertLocalOnly } from "../../src/lib/db-config";

/**
 * Las pruebas de integración y E2E CREAN y ELIMINAN bases de datos. Solo pueden apuntar a un PostgreSQL local.
 * Se rechaza cualquier host remoto (incluido Supabase) sin posibilidad de anularlo por variable de entorno.
 */
export function assertSafeTestUrl(url: string): string {
  assertLocalOnly(url, "pruebas destructivas (TEST_DATABASE_URL)");
  return url;
}
