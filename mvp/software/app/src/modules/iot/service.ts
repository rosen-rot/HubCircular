import "server-only";
import { anon } from "@/lib/db";
import { mapDbError } from "@/lib/errors";
import type { NormalizedReading } from "./schema";

export interface IngestResult {
  readingId: string;
  duplicate: boolean;
  receivedAt: Date;
  simulated: boolean;
}

interface Row {
  o_reading_id: string;
  o_duplicate: boolean;
  o_received_at: Date;
  o_simulated: boolean;
}

/**
 * Guarda una lectura de telemetría. No hay actor humano: la identidad es el dispositivo, autenticado en la
 * BD por el hash de su token (hc.iot_ingest_reading, SECURITY DEFINER). Nunca crea pesajes ni lotes.
 */
export async function ingestReading(tokenHash: string, r: NormalizedReading, retried = false): Promise<IngestResult> {
  try {
    const res = await anon.query<Row>(
      "select * from hc.iot_ingest_reading($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [tokenHash, r.deviceCode, r.messageId, r.measuredAt, r.weightG, r.distanceMm, r.fillPercent, r.quality, r.rssiDbm, r.firmwareVersion, r.payloadHash],
    );
    const row = res.rows[0]!;
    return { readingId: row.o_reading_id, duplicate: row.o_duplicate, receivedAt: row.o_received_at, simulated: row.o_simulated };
  } catch (err) {
    // Defensa ante una carrera entre reintentos simultáneos (la función ya bloquea la fila del dispositivo):
    // se reintenta una sola vez; ahora encontrará la fila y responderá duplicate=true o conflicto.
    if (!retried && (err as { code?: string }).code === "23505") return ingestReading(tokenHash, r, true);
    throw mapDbError(err);
  }
}
