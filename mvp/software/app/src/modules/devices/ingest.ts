import "server-only";
import { anon } from "@/lib/db";
import { mapDbError } from "@/lib/errors";
import { hashDeviceToken } from "./token";
import type { ReadingInput } from "./schema";

/**
 * Ingesta de una lectura. Autentica por token (hash) y solo escribe en hc.sensor_readings y el «último contacto»
 * del dispositivo: NO crea pesajes, lotes ni movimientos. Lanza DomainError (401/403/409/422/429).
 */
export async function ingestReading(token: string, r: ReadingInput): Promise<{ readingId: string; duplicate: boolean }> {
  try {
    const { rows } = await anon.query<{ o_reading_id: string; o_duplicate: boolean }>(
      "select * from hc.iot_ingest_reading($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        hashDeviceToken(token),
        r.deviceId.toUpperCase(),
        r.messageId,
        r.schemaVersion,
        r.measuredAt,
        r.weightGrams,
        r.distanceMm,
        r.fillPercent,
        r.quality,
        r.firmwareVersion ?? null,
      ],
    );
    return { readingId: rows[0]!.o_reading_id, duplicate: rows[0]!.o_duplicate };
  } catch (err) {
    // Errores de dominio (SQLSTATE HCxxx) → DomainError. Los de infraestructura (BD caída, pool agotado) se propagan
    // tal cual para que la API responda 503 y el dispositivo reintente con espera creciente.
    const code = (err as { code?: unknown })?.code;
    if (typeof code === "string" && code.startsWith("HC")) throw mapDbError(err);
    throw err;
  }
}
