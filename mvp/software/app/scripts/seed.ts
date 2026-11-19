import { Client } from "pg";
import { DEMO_USERS, generatePassword, seedDemo } from "../db/seed/demo";
import { buildClientConfig, describeTarget, parseTarget } from "../src/lib/db-config";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL o DATABASE_URL (ver .env.example).");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("El seed DEMO no se ejecuta en producción (defina ALLOW_DEMO_SEED=true solo si es deliberado).");
  }
  const target = parseTarget(url);
  console.log(`Destino: ${describeTarget(target)}`);
  if (!target.local && process.env.CONFIRM_REMOTE_SEED !== target.host) {
    throw new Error(
      `Destino remoto: el seed DEMO solo se carga con confirmación explícita (CONFIRM_REMOTE_SEED=${target.host}) y solo en un proyecto de DESARROLLO.`,
    );
  }
  const passwords = {
    admin: process.env.SEED_ADMIN_PASSWORD || generatePassword(),
    operator: process.env.SEED_OPERATOR_PASSWORD || generatePassword(),
    reader: process.env.SEED_READER_PASSWORD || generatePassword(),
  };
  const generated = !process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_OPERATOR_PASSWORD || !process.env.SEED_READER_PASSWORD;
  const client = new Client(buildClientConfig(url));
  await client.connect();
  try {
    await seedDemo(client, { passwords });
  } finally {
    await client.end();
  }
  console.log("Datos DEMO cargados (data_origin = 'demo').");
  console.log("Usuarios DEMO:");
  for (const k of ["admin", "operator", "reader"] as const) {
    console.log(`  ${DEMO_USERS[k].email}  (${DEMO_USERS[k].role})${generated ? `  clave: ${passwords[k]}` : ""}`);
  }
  if (generated) console.log("Las claves aleatorias se muestran solo ahora; anótelas o defina SEED_*_PASSWORD en .env.local.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
