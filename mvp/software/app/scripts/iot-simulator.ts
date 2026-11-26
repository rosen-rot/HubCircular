import { loadEnv } from "./env";
import { ALL_SCENARIOS, SCENARIOS, assertAllowedTarget, runSteps, type StepResult } from "./iot-scenarios";

/**
 * Simulador IoT (docs/09). Envía lecturas SIMULADAS (firmware «sim-…») a POST /api/iot/v1/readings.
 *
 *   npm run iot:simulate -- --scenario=duplicado
 *   npm run iot:simulate -- --scenario=todos
 *   npm run iot:simulate -- --scenario=estable_repetido --count=30 --interval=1000
 *   npm run iot:simulate -- --list
 *
 * Variables (en .env.local o el entorno; NUNCA imprima ni suba el token):
 *   IOT_DEVICE_TOKEN  credencial del dispositivo DEMO (se muestra una vez en /dispositivos al crearlo o rotarlo)
 *   IOT_DEVICE_ID     código del dispositivo (por defecto HUB-ESP32-001)
 *   IOT_BASE_URL      por defecto http://localhost:3000 (solo localhost salvo --allow-remote)
 * El servidor rechaza datos de simulador en dispositivos que no sean DEMO. Esto NO prueba el ESP32 ni el HX711.
 */
function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return undefined;
  return a.includes("=") ? a.slice(a.indexOf("=") + 1) : "true";
}

async function main() {
  loadEnv();
  if (arg("list")) {
    for (const [name, s] of Object.entries(SCENARIOS)) console.log(`${name.padEnd(18)} ${s.title} — ${s.outcome}`);
    console.log(`\nTodos (--scenario=todos): ${ALL_SCENARIOS.join(", ")}`);
    return;
  }
  const choice = arg("scenario");
  if (!choice) throw new Error("Indique --scenario=<nombre|todos> (use --list para ver los escenarios).");
  const names = choice === "todos" ? [...ALL_SCENARIOS] : choice.split(",");
  for (const n of names) if (!SCENARIOS[n]) throw new Error(`Escenario desconocido: ${n}. Use --list.`);

  const token = process.env.IOT_DEVICE_TOKEN?.trim();
  if (!token) throw new Error("Defina IOT_DEVICE_TOKEN (credencial de un dispositivo DEMO creado en /dispositivos).");
  const deviceId = (process.env.IOT_DEVICE_ID ?? "HUB-ESP32-001").trim().toUpperCase();
  const baseUrl = process.env.IOT_BASE_URL ?? "http://localhost:3000";
  assertAllowedTarget(baseUrl, arg("allow-remote") === "true");
  const count = arg("count") ? Number(arg("count")) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 500)) throw new Error("--count debe ser un entero entre 1 y 500.");
  const intervalMs = arg("interval") ? Number(arg("interval")) : 0;
  if (!Number.isFinite(intervalMs) || intervalMs < 0) throw new Error("--interval debe ser un número de milisegundos.");

  const signal = { aborted: false };
  process.once("SIGINT", () => {
    signal.aborted = true;
    console.log("\nInterrumpido: se detiene tras el mensaje en curso.");
  });

  console.log(`Simulador IoT → ${baseUrl} · dispositivo ${deviceId} · escenarios: ${names.join(", ")}`);
  console.log("Datos SIMULADOS (firmware sim-…): solo se aceptan en dispositivos DEMO.\n");
  const all: StepResult[] = [];
  for (const name of names) {
    const sc = SCENARIOS[name]!;
    console.log(`▶ ${sc.title}\n  esperado: ${sc.outcome}`);
    const steps = sc.build({ deviceId, now: new Date(), count });
    const res = await runSteps(name, steps, { baseUrl, token, intervalMs, signal });
    const failed = res.filter((r) => !r.ok);
    const dups = res.filter((r) => r.duplicate === true).length;
    console.log(`  ${res.length} envíos · ${res.length - failed.length} como se esperaba${dups ? ` · ${dups} duplicado(s)` : ""}`);
    for (const f of failed) console.log(`  ✗ ${f.label}: HTTP ${f.status} (esperado ${f.expected.join("/")}) ${f.detail}`);
    all.push(...res);
    if (signal.aborted) break;
  }
  const bad = all.filter((r) => !r.ok);
  console.log(`\nResumen: ${all.length} envíos, ${all.length - bad.length} correctos, ${bad.length} con diferencias.`);
  if (bad.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
