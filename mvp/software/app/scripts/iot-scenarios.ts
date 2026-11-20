import { randomUUID } from "node:crypto";

/**
 * Escenarios del simulador IoT (docs/09). Módulo puro: construye los mensajes y declara qué respuesta se espera;
 * no abre conexiones. El script `iot-simulator.ts` los envía con `fetch` y los tests los ejecutan contra el endpoint.
 * Todo lo que envía lleva firmware «sim-…», por lo que el servidor solo lo acepta en dispositivos DEMO.
 */
export const SIM_FIRMWARE = "sim-0.1.0";

export interface SimPayload {
  schemaVersion: number;
  deviceId: string;
  messageId: string;
  measuredAt: string;
  weightGrams: number | null;
  distanceMm: number | null;
  fillPercent: number | null;
  quality: string;
  firmwareVersion: string | null;
}

export interface SimStep {
  label: string;
  payload: SimPayload;
  /** Estados HTTP aceptables. */
  expect: number[];
  /** Si se indica, la respuesta 202 debe traer este valor de `duplicate`. */
  expectDuplicate?: boolean;
  /** Usa este token en vez del configurado (p. ej. uno desconocido). */
  token?: string;
}

export interface ScenarioCtx {
  deviceId: string;
  /** Hora de referencia (inyectable para pruebas). */
  now: Date;
  /** Cantidad de mensajes en escenarios repetitivos. */
  count?: number;
  newId?: () => string;
  /** Token que parezca válido pero no exista, para el escenario de token inválido. */
  unknownToken?: () => string;
  seed?: number;
}

export interface Scenario {
  title: string;
  /** Qué debe ocurrir en HubCircular (columna «Resultado esperado» de docs/09). */
  outcome: string;
  build(ctx: ScenarioCtx): SimStep[];
}

// PRNG determinista (mulberry32): mismas lecturas en cada ejecución con la misma semilla.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONTAINER_DEPTH_MM = 400; // altura ficticia del contenedor simulado

function base(ctx: ScenarioCtx, over: Partial<SimPayload> & { secondsAgo?: number }): SimPayload {
  const { secondsAgo = 0, ...rest } = over;
  return {
    schemaVersion: 1,
    deviceId: ctx.deviceId,
    messageId: (ctx.newId ?? randomUUID)(),
    measuredAt: new Date(ctx.now.getTime() - secondsAgo * 1000).toISOString(),
    weightGrams: 4250,
    distanceMm: 180,
    fillPercent: 65,
    quality: "stable",
    firmwareVersion: SIM_FIRMWARE,
    ...rest,
  };
}

const fillFromWeight = (g: number) => Math.round(Math.min(100, (g / 5000) * 100) * 10) / 10;
const distanceFromWeight = (g: number) => Math.round(CONTAINER_DEPTH_MM - (Math.min(g, 5000) / 5000) * (CONTAINER_DEPTH_MM - 60));

function reading(ctx: ScenarioCtx, g: number, secondsAgo: number, quality = "stable"): SimStep {
  return {
    label: `peso ${g} g`,
    payload: base(ctx, { weightGrams: g, distanceMm: distanceFromWeight(g), fillPercent: fillFromWeight(g), quality, secondsAgo }),
    expect: [202],
    expectDuplicate: false,
  };
}

export const SCENARIOS: Record<string, Scenario> = {
  vacio: {
    title: "Contenedor vacío",
    outcome: "Lecturas visibles; ninguna captación creada.",
    build: (ctx) => {
      const r = rng(ctx.seed ?? 1);
      const n = ctx.count ?? 10;
      return Array.from({ length: n }, (_, i) => {
        const g = Math.floor(r() * 31); // 0–30 g fluctuante
        return {
          label: `vacío ${g} g`,
          payload: base(ctx, { weightGrams: g, distanceMm: CONTAINER_DEPTH_MM - Math.floor(r() * 5), fillPercent: 0, secondsAgo: (n - i) * 10 }),
          expect: [202],
          expectDuplicate: false,
        };
      });
    },
  },
  deposito: {
    title: "Depósito de material",
    outcome: "Lecturas 0 → 1500 → 1498 g visibles; no suma captación (requiere pesaje confirmado).",
    build: (ctx) => [reading(ctx, 0, 30), reading(ctx, 1500, 20), reading(ctx, 1498, 10)],
  },
  estable_repetido: {
    title: "Peso estable repetido",
    outcome: "Se guardan las lecturas, pero no se suma captura: 30 × 1,5 kg no son 45 kg captados.",
    build: (ctx) => {
      const n = ctx.count ?? 30;
      return Array.from({ length: n }, (_, i) => reading(ctx, 1500, (n - i) * 10));
    },
  },
  retiro_parcial: {
    title: "Retiro parcial",
    outcome: "Dato de cambio visible (1500 → 500 g); el retiro requiere que un operador lo confirme como movimiento.",
    build: (ctx) => [reading(ctx, 1500, 20), reading(ctx, 500, 10)],
  },
  duplicado: {
    title: "Duplicado HTTP",
    outcome: "Se persiste una sola lectura; el reintento responde duplicate:true.",
    build: (ctx) => {
      const payload = base(ctx, {});
      return [
        { label: "primer envío", payload, expect: [202], expectDuplicate: false },
        { label: "reintento idéntico", payload: { ...payload }, expect: [202], expectDuplicate: true },
      ];
    },
  },
  alterado: {
    title: "Mensaje alterado",
    outcome: "Conflicto explícito (409): mismo messageId con contenido distinto.",
    build: (ctx) => {
      const payload = base(ctx, {});
      return [
        { label: "mensaje original", payload, expect: [202], expectDuplicate: false },
        { label: "mismo messageId, peso distinto", payload: { ...payload, weightGrams: (payload.weightGrams ?? 0) + 1 }, expect: [409] },
      ];
    },
  },
  sensor_invalido: {
    title: "Sensor inválido",
    outcome: "Se registra el estado sensor_error con valores vacíos; no se inventa un cero.",
    build: (ctx) => [
      {
        label: "sensor_error con valores nulos",
        payload: base(ctx, { weightGrams: null, distanceMm: null, fillPercent: null, quality: "sensor_error" }),
        expect: [202],
        expectDuplicate: false,
      },
    ],
  },
  sin_conexion: {
    title: "Sin conexión",
    outcome:
      "Envía una lectura y se detiene. Tras los minutos de tolerancia del dispositivo, /dispositivos lo muestra como «dato desactualizado».",
    build: (ctx) => [reading(ctx, 1500, 0)],
  },
  fuera_de_rango: {
    title: "Dato fuera de rango",
    outcome: "Rechazo 400 (fillPercent 130); no se guarda nada.",
    build: (ctx) => [{ label: "fillPercent 130", payload: base(ctx, { fillPercent: 130 }), expect: [400] }],
  },
  token_invalido: {
    title: "Token desconocido",
    outcome: "Rechazo 401: la credencial no corresponde a ningún dispositivo.",
    build: (ctx) => [
      { label: "token inventado", payload: base(ctx, {}), expect: [401], token: (ctx.unknownToken ?? defaultUnknownToken)() },
    ],
  },
  token_revocado: {
    title: "Token revocado",
    outcome:
      "Rechazo 403 (o 401 si la credencial fue rotada). Revoque o rote el dispositivo en /dispositivos y luego ejecute este escenario.",
    build: (ctx) => [{ label: "envío con la credencial configurada", payload: base(ctx, {}), expect: [401, 403] }],
  },
};

function defaultUnknownToken(): string {
  return "hcd_" + randomUUID().replace(/-/g, "").padEnd(43, "x").slice(0, 43);
}

/** Escenarios que se ejecutan con `--scenario=todos`: los que no dependen de revocar la credencial a mano. */
export const ALL_SCENARIOS = [
  "vacio",
  "deposito",
  "estable_repetido",
  "retiro_parcial",
  "duplicado",
  "alterado",
  "sensor_invalido",
  "fuera_de_rango",
  "token_invalido",
  "sin_conexion",
] as const;

export interface StepResult {
  scenario: string;
  label: string;
  status: number;
  expected: number[];
  duplicate: boolean | null;
  ok: boolean;
  detail: string;
}

export interface RunOptions {
  baseUrl: string;
  token: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  /** Pausa entre mensajes (ms). 0 = sin pausa. */
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  signal?: { aborted: boolean };
}

/** Envía los pasos y compara cada respuesta con lo esperado. Nunca incluye el token en el resultado. */
export async function runSteps(scenario: string, steps: SimStep[], opts: RunOptions): Promise<StepResult[]> {
  const f = opts.fetchFn ?? ((url, init) => fetch(url, init));
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = opts.baseUrl.replace(/\/+$/, "") + "/api/iot/v1/readings";
  const out: StepResult[] = [];
  for (const step of steps) {
    if (opts.signal?.aborted) break;
    let status = 0;
    let duplicate: boolean | null = null;
    let detail = "";
    try {
      const res = await f(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${step.token ?? opts.token}` },
        body: JSON.stringify(step.payload),
      });
      status = res.status;
      const body = (await res.json().catch(() => null)) as { duplicate?: boolean; error?: { code?: string } } | null;
      if (typeof body?.duplicate === "boolean") duplicate = body.duplicate;
      if (body?.error?.code) detail = body.error.code;
    } catch (e) {
      detail = `sin conexión: ${(e as Error).message.replace(opts.token, "***")}`;
    }
    let ok = step.expect.includes(status);
    if (ok && step.expectDuplicate !== undefined && status === 202 && duplicate !== step.expectDuplicate) {
      ok = false;
      detail = `duplicate=${duplicate}, se esperaba ${step.expectDuplicate}`;
    }
    out.push({ scenario, label: step.label, status, expected: step.expect, duplicate, ok, detail });
    if (opts.intervalMs && opts.intervalMs > 0) await sleep(opts.intervalMs);
  }
  return out;
}

/** El simulador solo apunta a equipos locales salvo autorización explícita (evita ensuciar un entorno real). */
export function assertAllowedTarget(baseUrl: string, allowRemote: boolean): void {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new Error("IOT_BASE_URL no es una URL válida (ej. http://localhost:3000).");
  }
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (!local && !allowRemote) {
    throw new Error(
      `El simulador solo envía a localhost por defecto. «${host}» es remoto: use --allow-remote solo contra un entorno de pruebas con dispositivos DEMO.`,
    );
  }
}
