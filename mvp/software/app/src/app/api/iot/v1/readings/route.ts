import { NextResponse, type NextRequest } from "next/server";
import { DomainError, messageForCode } from "@/lib/errors";
import { isJsonContentType } from "@/lib/origin";
import { ingestReading } from "@/modules/devices/ingest";
import { READING_MAX_BODY_BYTES, readingSchema } from "@/modules/devices/schema";
import { parseBearerToken } from "@/modules/devices/token";

/**
 * Contrato docs/04 v1: POST /api/iot/v1/readings (ESP32 o simulador).
 * Autenticación por token de dispositivo (Authorization: Bearer); NO usa cookie de sesión ni comprobación de origen
 * (no es un navegador). Solo guarda telemetría: nunca crea pesajes, lotes ni movimientos.
 * Respuestas: 202 aceptada (duplicate:true si es repetición idéntica), 400 esquema/rango, 401 sin/ inválido token,
 * 403 dispositivo revocado/no autorizado, 409 mismo messageId con contenido distinto, 413/415, 429 frecuencia, 503 BD.
 */
const err = (code: string, status: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  NextResponse.json({ error: { code, message: messageForCode(code), ...extra } }, { status, headers: { "Cache-Control": "no-store", ...headers } });

function dbUnavailable(e: unknown): boolean {
  const c = (e as { code?: string })?.code ?? "";
  const m = (e as { message?: string })?.message ?? "";
  return (
    ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "57P01", "57P03", "53300", "08006", "08001", "08003"].includes(c) ||
    /timeout exceeded when trying to connect|Connection terminated|DATABASE_URL no está definida/i.test(m)
  );
}

export async function POST(req: NextRequest) {
  try {
    const token = parseBearerToken(req.headers.get("authorization"));
    if (!token) return err("device_token_invalid", 401, {}, { "WWW-Authenticate": "Bearer" });

    if (!isJsonContentType(req.headers.get("content-type"))) {
      return err("validation", 415, { message: "Content-Type debe ser application/json." });
    }
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > READING_MAX_BODY_BYTES) return err("validation", 413, { message: "Cuerpo demasiado grande." });
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > READING_MAX_BODY_BYTES) return err("validation", 413, { message: "Cuerpo demasiado grande." });

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return err("reading_invalid", 400, { message: "JSON inválido." });
    }
    const parsed = readingSchema.safeParse(json);
    if (!parsed.success) {
      return err("reading_invalid", 400, {
        issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    // El encabezado Idempotency-Key (docs/04) es opcional; si viene debe coincidir con messageId para no ambiguar.
    const idem = req.headers.get("idempotency-key");
    if (idem && idem.toLowerCase() !== parsed.data.messageId.toLowerCase()) {
      return err("reading_invalid", 400, { message: "Idempotency-Key debe ser igual a messageId." });
    }

    const result = await ingestReading(token, parsed.data);
    return NextResponse.json(
      { accepted: true, readingId: result.readingId, duplicate: result.duplicate },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof DomainError) {
      // La validación de la BD (respaldo) también se informa como 400 según el contrato.
      const status = e.code === "reading_invalid" ? 400 : e.status;
      return err(e.code, status, {}, e.code === "rate_limited" ? { "Retry-After": "60" } : {});
    }
    if (dbUnavailable(e)) return err("unexpected", 503, { message: "Servicio temporalmente no disponible. Reintente con espera creciente." }, { "Retry-After": "30" });
    console.error("[api/iot] error inesperado", (e as Error).message);
    return err("unexpected", 500);
  }
}
