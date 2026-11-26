import { randomUUID } from "node:crypto";
import { loadEnv } from "./env";

/**
 * Simulador del ESP32 (docs/09, docs/27). Envía lecturas al MISMO endpoint que el firmware.
 * Use un dispositivo registrado como `simulator`: sus lecturas quedan marcadas y nunca se confunden con mediciones reales.
 *
 *   npm run iot:simulate                      → modo «demo»: depósitos de material cada pocos segundos, latido de 30 s
 *   npm run iot:simulate -- --checks          → recorre los casos del contrato (duplicado, conflicto, inválido…) y reporta
 *
 * Variables (en .env.local o en el entorno):
 *   IOT_BASE_URL       URL de la plataforma (por defecto http://localhost:3000)
 *   IOT_DEVICE_ID      código del dispositivo (por defecto HUB-SIM-001)
 *   IOT_DEVICE_TOKEN   token entregado por `npm run iot:device -- create … simulator`
 */
loadEnv();
const BASE = (process.env.IOT_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DEVICE = process.env.IOT_DEVICE_ID ?? "HUB-SIM-001";
const TOKEN = process.env.IOT_DEVICE_TOKEN ?? "";
const ENDPOINT = `${BASE}/api/iot/v1/readings`;
const TARE_G = 1200; // recipiente vacío sobre la plataforma
const DEPTH_MM = 400; // distancia sensor–fondo del contenedor vacío

interface Reading {
  schemaVersion: 1;
  deviceId: string;
  messageId: string;
  measuredAt?: string | null;
  weightGrams: number | null;
  distanceMm?: number | null;
  fillPercent?: number | null;
  quality: "stable" | "unstable" | "uncalibrated" | "sensor_error";
  rssiDbm?: number | null;
  firmwareVersion?: string | null;
}

async function send(body: unknown, token = TOKEN): Promise<{ status: number; json: unknown }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo */
  }
  return { status: res.status, json };
}

function reading(weightG: number | null, quality: Reading["quality"] = "stable"): Reading {
  const fill = weightG == null ? null : Math.min(100, Math.max(0, Math.round(((weightG - TARE_G) / 8000) * 1000) / 10));
  return {
    schemaVersion: 1,
    deviceId: DEVICE,
    messageId: randomUUID(),
    measuredAt: new Date().toISOString(),
    weightGrams: weightG,
    distanceMm: fill == null ? null : Math.round(DEPTH_MM * (1 - fill / 100)),
    fillPercent: fill,
    quality,
    rssiDbm: -55 - Math.round(Math.random() * 15),
    firmwareVersion: "sim-1.0.0",
  };
}

async function checks() {
  const results: { caso: string; esperado: string; obtenido: number; ok: boolean }[] = [];
  const expect = async (caso: string, esperado: number[], p: Promise<{ status: number }>) => {
    const { status } = await p;
    results.push({ caso, esperado: esperado.join("/"), obtenido: status, ok: esperado.includes(status) });
  };
  const base = reading(TARE_G + 1500);
  await expect("Lectura válida", [202], send(base));
  await expect("Duplicado HTTP (mismo messageId y contenido)", [200], send(base));
  await expect("Mensaje alterado (mismo messageId, otro peso)", [409], send({ ...base, weightGrams: base.weightGrams! + 100 }));
  await expect("Sensor inválido (sensor_error, peso nulo)", [202], send(reading(null, "sensor_error")));
  await expect("Fuera de rango (fillPercent 130)", [400], send({ ...reading(2000), fillPercent: 130 }));
  await expect("Peso negativo", [400], send({ ...reading(2000), weightGrams: -50 }));
  await expect("Campo desconocido", [400], send({ ...reading(2000), extra: 1 }));
  await expect("JSON inválido", [400], send("{no es json"));
  await expect("Sin token", [401], send(reading(2000), ""));
  await expect("Token inválido", [401], send(reading(2000), `hcd_${"x".repeat(43)}`));
  await expect("deviceId que no corresponde al token", [403], send({ ...reading(2000), deviceId: "OTRO-DISPOSITIVO" }));
  console.table(results);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? "Todos los casos respondieron lo esperado." : `${failed} caso(s) con respuesta distinta a la esperada.`);
  if (failed) process.exitCode = 1;
}

async function demo() {
  let weight = TARE_G;
  let lastSent = 0;
  let lastWeight = -1;
  let stop = false;
  process.on("SIGINT", () => {
    stop = true;
    console.log("\nDeteniendo simulador…");
  });
  console.log(`Simulando ${DEVICE} → ${ENDPOINT}  (Ctrl+C para detener)`);
  while (!stop) {
    // Cada ~15 s alguien deposita entre 100 g y 900 g; al pasar 8 kg se «retira» el contenido.
    if (Math.random() < 0.15) {
      const delta = 100 + Math.round(Math.random() * 800);
      weight = weight + delta > TARE_G + 8000 ? TARE_G : weight + delta;
      const r = await send(reading(weight + Math.round((Math.random() - 0.5) * 400), "unstable"));
      console.log(`${new Date().toLocaleTimeString("es-CL")}  moviéndose…            → ${r.status}`);
      await new Promise((res) => setTimeout(res, 2000));
    }
    const now = Date.now();
    const noisy = weight + Math.round((Math.random() - 0.5) * 10);
    if (Math.abs(noisy - lastWeight) >= 50 || now - lastSent >= 30_000) {
      const r = await send(reading(noisy));
      console.log(`${new Date().toLocaleTimeString("es-CL")}  ${(noisy / 1000).toFixed(2)} kg estable  → ${r.status}${r.status >= 400 ? ` ${JSON.stringify(r.json)}` : ""}`);
      lastSent = now;
      lastWeight = noisy;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
}

if (!TOKEN) {
  console.error("Falta IOT_DEVICE_TOKEN. Cree el dispositivo con: npm run iot:device -- create HUB-SIM-001 <CONTENEDOR> simulator");
  process.exitCode = 1;
} else {
  (process.argv.includes("--checks") ? checks() : demo()).catch((e) => {
    console.error(`No se pudo conectar con ${ENDPOINT}: ${(e as Error).message}`);
    process.exitCode = 1;
  });
}
