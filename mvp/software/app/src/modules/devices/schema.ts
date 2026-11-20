import { z } from "zod";

/** Contrato docs/04 v1 de la lectura de un dispositivo. Estricto: campos desconocidos se rechazan. */
export const READING_QUALITIES = ["stable", "unstable", "uncalibrated", "sensor_error"] as const;
export type ReadingQuality = (typeof READING_QUALITIES)[number];

export const READING_MAX_BODY_BYTES = 2_048;
export const DEVICE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;

export const readingSchema = z
  .object({
    schemaVersion: z.literal(1),
    deviceId: z.string().trim().min(3).max(64),
    messageId: z.string().uuid(),
    measuredAt: z.string().datetime({ offset: true }),
    weightGrams: z.number().int().min(0).max(1_000_000).nullable(),
    distanceMm: z.number().int().min(0).max(10_000).nullable(),
    fillPercent: z.number().min(0).max(100).nullable(),
    quality: z.enum(READING_QUALITIES),
    firmwareVersion: z.string().min(1).max(32).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Sin dato válido no se inventa un cero.
    if (v.quality === "sensor_error" && (v.weightGrams !== null || v.distanceMm !== null || v.fillPercent !== null)) {
      ctx.addIssue({ code: "custom", path: ["quality"], message: "sensor_error no puede traer valores de peso, distancia ni llenado." });
    }
    if (v.quality === "uncalibrated" && v.weightGrams !== null) {
      ctx.addIssue({ code: "custom", path: ["weightGrams"], message: "Sin calibrar, el peso debe ser null." });
    }
  });

export type ReadingInput = z.infer<typeof readingSchema>;

export interface DeviceFormInput {
  code: string;
  name: string;
  containerId: string;
  staleAfterMinutes: number;
}

type Raw = Record<string, FormDataEntryValue | null | undefined>;
const str = (raw: Raw, k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");

export function parseCreateDevice(raw: Raw):
  | { ok: true; value: DeviceFormInput }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const code = str(raw, "code").trim().toUpperCase();
  if (!DEVICE_CODE_PATTERN.test(code)) errors.code = "Use 3 a 64 caracteres: letras, números, guion y guion bajo (ej. HUB-ESP32-001).";
  const name = str(raw, "name").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 1) errors.name = "Ingrese un nombre.";
  else if (name.length > 120) errors.name = "Máximo 120 caracteres.";
  const containerId = str(raw, "containerId");
  if (!z.string().uuid().safeParse(containerId).success) errors.containerId = "Seleccione un contenedor.";
  const minutesRaw = str(raw, "staleAfterMinutes").trim() || "15";
  const minutes = Number(minutesRaw);
  if (!/^\d+$/.test(minutesRaw) || minutes < 1 || minutes > 1440) errors.staleAfterMinutes = "Ingrese un número entero de minutos entre 1 y 1440.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { code, name, containerId, staleAfterMinutes: minutes } };
}

export function parseDeviceId(raw: Raw, key = "deviceId"): string | null {
  const v = str(raw, key);
  return z.string().uuid().safeParse(v).success ? v : null;
}

// ---------------------------------------------------------------------------------------------------
// Estado de un dispositivo (puro y comprobable; la hora actual se inyecta)
// ---------------------------------------------------------------------------------------------------
export type DeviceState = "en_linea" | "desactualizado" | "sin_datos" | "revocado";

export const DEVICE_STATE_LABEL: Record<DeviceState, string> = {
  en_linea: "En línea",
  desactualizado: "Dato desactualizado",
  sin_datos: "Sin datos aún",
  revocado: "Revocado",
};

export function deviceState(
  d: { revokedAt: Date | null; lastSeenAt: Date | null; staleAfterMinutes: number },
  now: Date,
): DeviceState {
  if (d.revokedAt) return "revocado";
  if (!d.lastSeenAt) return "sin_datos";
  const ageMs = now.getTime() - d.lastSeenAt.getTime();
  return ageMs > d.staleAfterMinutes * 60_000 ? "desactualizado" : "en_linea";
}

/** «hace 3 min», «hace 2 h», «hace 4 d». Sin fecha: «nunca». */
export function relativeAge(date: Date | null, now: Date): string {
  if (!date) return "nunca";
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "hace menos de 1 min";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
