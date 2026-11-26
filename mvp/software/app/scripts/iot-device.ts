import { Client } from "pg";
import { buildClientConfig, describeTarget, parseTarget } from "../src/lib/db-config";
import { hashDeviceToken, newDeviceToken } from "../src/modules/iot/schema";
import { loadEnv } from "./env";

/**
 * Administración de dispositivos IoT (docs/27). Usa la conexión de MIGRACIÓN (dueño del esquema), igual que el seed.
 *
 *   npm run iot:device -- list
 *   npm run iot:device -- create  <CODIGO> <CONTENEDOR> [sensor|simulator]
 *   npm run iot:device -- rotate  <CODIGO>        (nuevo token; el anterior deja de servir al instante)
 *   npm run iot:device -- disable <CODIGO>
 *   npm run iot:device -- enable  <CODIGO>
 *
 * El token se muestra UNA sola vez. Cópielo al config.h del ESP32 (o a IOT_DEVICE_TOKEN para el simulador).
 * La BD guarda solo su hash SHA-256.
 */
const USAGE = `Uso:
  npm run iot:device -- list
  npm run iot:device -- create  <CODIGO> <CONTENEDOR> [sensor|simulator]
  npm run iot:device -- rotate  <CODIGO>
  npm run iot:device -- disable <CODIGO>
  npm run iot:device -- enable  <CODIGO>`;

function printToken(code: string, token: string) {
  console.log("");
  console.log(`Token del dispositivo ${code} (se muestra SOLO ahora; guárdelo en un lugar seguro):`);
  console.log("");
  console.log(`  ${token}`);
  console.log("");
  console.log("ESP32 → config.h:   #define DEVICE_TOKEN \"<token>\"");
  console.log("Simulador → .env.local:   IOT_DEVICE_TOKEN=<token>");
}

async function main() {
  loadEnv();
  const [cmd, codeArg, containerArg, kindArg] = process.argv.slice(2);
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL o DATABASE_URL (ver .env.example).");
  if (!cmd) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  console.log(`Destino: ${describeTarget(parseTarget(url))}`);
  const code = (codeArg ?? "").trim().toUpperCase();
  const client = new Client(buildClientConfig(url));
  await client.connect();
  try {
    switch (cmd) {
      case "list": {
        const r = await client.query(
          `select d.code, d.kind, d.active, c.code as container, d.last_seen_at, d.token_set_at,
                  (select count(*)::int from hc.sensor_readings x where x.device_id = d.id) as readings
             from hc.devices d join hc.containers c on c.id = d.container_id order by d.code`,
        );
        if (r.rows.length === 0) console.log("No hay dispositivos registrados.");
        else console.table(r.rows);
        break;
      }
      case "create": {
        const container = (containerArg ?? "").trim().toUpperCase();
        const kind = (kindArg ?? "sensor").trim().toLowerCase();
        if (!code || !container) throw new Error(USAGE);
        if (kind !== "sensor" && kind !== "simulator") throw new Error("El tipo debe ser sensor o simulator.");
        const c = await client.query("select id, data_origin from hc.containers where code = $1", [container]);
        if (!c.rows[0]) throw new Error(`No existe el contenedor ${container}. Vea los códigos en /contenedores.`);
        if (kind === "sensor" && c.rows[0].data_origin === "demo") {
          console.warn("AVISO: el contenedor es DEMO. Para mediciones reales asocie el sensor a un contenedor real.");
        }
        const token = newDeviceToken();
        await client.query("begin");
        await client.query(
          "insert into hc.devices (code, container_id, kind, token_hash) values ($1, $2, $3, $4)",
          [code, c.rows[0].id, kind, hashDeviceToken(token)],
        );
        await client.query(
          "insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary) values (null, 'device', $1, 'device_created', $2)",
          [code, JSON.stringify({ container, kind })],
        );
        await client.query("commit");
        console.log(`Dispositivo ${code} (${kind}) creado y asociado a ${container}.`);
        printToken(code, token);
        break;
      }
      case "rotate": {
        if (!code) throw new Error(USAGE);
        const token = newDeviceToken();
        const r = await client.query("update hc.devices set token_hash = $2, token_set_at = now() where code = $1", [code, hashDeviceToken(token)]);
        if (r.rowCount !== 1) throw new Error(`No existe el dispositivo ${code}.`);
        await client.query("insert into hc.audit_logs (actor_id, entity, entity_id, action) values (null, 'device', $1, 'device_token_rotated')", [code]);
        console.log(`Token de ${code} reemplazado. El token anterior ya no sirve.`);
        printToken(code, token);
        break;
      }
      case "disable":
      case "enable": {
        if (!code) throw new Error(USAGE);
        const active = cmd === "enable";
        const r = await client.query("update hc.devices set active = $2 where code = $1", [code, active]);
        if (r.rowCount !== 1) throw new Error(`No existe el dispositivo ${code}.`);
        await client.query("insert into hc.audit_logs (actor_id, entity, entity_id, action) values (null, 'device', $1, $2)", [code, active ? "device_enabled" : "device_disabled"]);
        console.log(`Dispositivo ${code} ${active ? "activado" : "desactivado"}.`);
        break;
      }
      default:
        throw new Error(USAGE);
    }
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    if ((e as { code?: string }).code === "23505") throw new Error(`Ya existe un dispositivo con el código ${code}.`);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
