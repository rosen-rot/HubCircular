import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Contrato docs/04 v1: POST /api/iot/v1/readings. Este archivo es la fuente de verdad del formato;
 * el firmware (mvp/hardware/firmware) y el simulador (scripts/iot-simulator.ts) lo siguen.
 */
export const READING_QUALITIES = ["stable", "unstable", "uncalibrated", "sensor_error"] as const;
export type ReadingQuality = (typeof READING_QUALITIES)[number];

export const MAX_READING_BYTES = 2_048;

export const readingSchema = z
  .object({
    schemaVersion: z.literal(1),
    deviceId: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/),
    messageId: z.string().uuid(),
    measuredAt: z.string().datetime({ offset: true }).optional().nullable(),
    // Peso BRUTO sobre la plataforma (contenedor + residuos), en gramos enteros. Null si no hay dato confiable.
    weightGrams: z.number().int().min(0).max(1_000_000).nullable(),
    distanceMm: z.number().int().min(0).max(10_000).optional().nullable(),
    fillPercent: z.number().min(0).max(100).optional().nullable(),
    quality: z.enum(READING_QUALITIES),
    rssiDbm: z.number().int().min(-127).max(0).optional().nullable(),
    firmwareVersion: z.string().trim().max(32).optional().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Una lectura «estable» debe traer peso; con error de sensor no se inventa un cero.
    if (v.quality === "stable" && v.weightGrams === null) {
      ctx.addIssue({ code: "custom", path: ["weightGrams"], message: "quality=stable requiere weightGrams" });
    }
    if (v.quality === "sensor_error" && v.weightGrams !== null) {
      ctx.addIssue({ code: "custom", path: ["weightGrams"], message: "quality=sensor_error requiere weightGrams=null" });
    }
  });

export type ReadingInput = z.infer<typeof readingSchema>;

export interface NormalizedReading {
  deviceCode: string;
  messageId: string;
  measuredAt: Date | null;
  weightG: number | null;
  distanceMm: number | null;
  fillPercent: number | null;
  quality: ReadingQuality;
  rssiDbm: number | null;
  firmwareVersion: string | null;
  payloadHash: string;
}

/** Normaliza y calcula una huella estable del contenido (para distinguir reintento idéntico de conflicto). */
export function normalizeReading(v: ReadingInput): NormalizedReading {
  const n = {
    deviceCode: v.deviceId.trim().toUpperCase(),
    messageId: v.messageId.toLowerCase(),
    measuredAt: v.measuredAt ? new Date(v.measuredAt) : null,
    weightG: v.weightGrams,
    distanceMm: v.distanceMm ?? null,
    fillPercent: v.fillPercent == null ? null : Math.round(v.fillPercent * 10) / 10,
    quality: v.quality,
    rssiDbm: v.rssiDbm ?? null,
    firmwareVersion: v.firmwareVersion?.trim() || null,
  };
  const canonical = JSON.stringify([
    n.deviceCode,
    n.messageId,
    n.measuredAt?.toISOString() ?? null,
    n.weightG,
    n.distanceMm,
    n.fillPercent,
    n.quality,
    n.rssiDbm,
    n.firmwareVersion,
  ]);
  return { ...n, payloadHash: createHash("sha256").update(canonical).digest("hex") };
}

/** Token de dispositivo: prefijo reconocible + 32 bytes aleatorios. Se muestra una sola vez; la BD guarda el hash. */
const TOKEN_RE = /^hcd_[A-Za-z0-9_-]{43}$/;

export function newDeviceToken(): string {
  return `hcd_${randomBytes(32).toString("base64url")}`;
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Extrae el token de `Authorization: Bearer <token>`; null si falta o no tiene el formato esperado. */
export function parseBearer(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  if (!m) return null;
  return TOKEN_RE.test(m[1]!) ? m[1]! : null;
}

/** Segundos sin lecturas a partir de los cuales el panel muestra el dispositivo «sin señal» (latido = 30 s). */
export const OFFLINE_AFTER_S = 90;
