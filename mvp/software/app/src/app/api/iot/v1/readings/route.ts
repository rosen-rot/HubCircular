import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/errors";
import { isJsonContentType } from "@/lib/origin";
import { hashDeviceToken, MAX_READING_BYTES, normalizeReading, parseBearer, readingSchema } from "@/modules/iot/schema";
import { ingestReading } from "@/modules/iot/service";

// Contrato docs/04 v1: POST /api/iot/v1/readings. Lo usan el ESP32 y el simulador (no el navegador).
// Autenticación: `Authorization: Bearer <token del dispositivo>` (sin cookie de sesión: proxy.ts deja pasar /api/iot/).
// La lectura es telemetría: nunca crea pesajes, lotes ni movimientos.

export const dynamic = "force-dynamic";

const err = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: { code, message, ...extra } }, { status });

export async function POST(req: NextRequest) {
  try {
    const token = parseBearer(req.headers.get("authorization"));
    if (!token) return err(401, "device_unauthenticated", new DomainError("device_unauthenticated").userMessage);

    if (!isJsonContentType(req.headers.get("content-type"))) {
      return err(415, "validation", "Content-Type debe ser application/json.");
    }
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_READING_BYTES) return err(413, "validation", "Cuerpo demasiado grande.");
    const raw = await req.text();
    if (raw.length > MAX_READING_BYTES) return err(413, "validation", "Cuerpo demasiado grande.");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return err(400, "validation", "JSON inválido.");
    }
    const parsed = readingSchema.safeParse(json);
    if (!parsed.success) {
      return err(400, "validation", "Datos inválidos.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    // Idempotency-Key es opcional; si viene, debe ser el mismo messageId (evita dos identificadores distintos).
    const key = req.headers.get("idempotency-key");
    if (key && key.toLowerCase() !== parsed.data.messageId.toLowerCase()) {
      return err(400, "validation", "Idempotency-Key debe coincidir con messageId.");
    }

    const result = await ingestReading(hashDeviceToken(token), normalizeReading(parsed.data));
    return NextResponse.json(
      {
        accepted: true,
        readingId: result.readingId,
        duplicate: result.duplicate,
        receivedAt: result.receivedAt.toISOString(),
        simulated: result.simulated,
      },
      { status: result.duplicate ? 200 : 202 },
    );
  } catch (e) {
    if (e instanceof DomainError && e.code !== "unexpected") {
      const res = err(e.status, e.code, e.userMessage);
      if (e.code === "rate_limited") res.headers.set("Retry-After", "30");
      return res;
    }
    console.error("[api/iot/readings] error inesperado", (e as Error).message);
    // 503 para que el dispositivo reintente con backoff (BD caída, pooler saturado, etc.).
    return err(503, "unavailable", "Servicio temporalmente no disponible. Reintente.");
  }
}
