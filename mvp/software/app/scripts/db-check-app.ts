import { TLSSocket } from "node:tls";
import { Client } from "pg";
import { buildClientConfig, describeTarget, parseTarget } from "../src/lib/db-config";
import { loadEnv } from "./env";

/**
 * npm run db:check:app — comprueba la conexión que usa la APLICACIÓN en ejecución (DATABASE_URL), no la de migración.
 * SOLO LECTURA (transacción `read only` que se revierte). No imprime claves.
 * Resultado esperado con el rol dedicado `hc_login`: sin privilegios propios, solo puede bajar a `hc_app`.
 */
let errors = 0;
let warnings = 0;
const line = (lvl: "OK" | "AVISO" | "ERROR", msg: string) => {
  if (lvl === "ERROR") errors++;
  if (lvl === "AVISO") warnings++;
  console.log(`  [${lvl}] ${msg}`);
};

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida en .env.local.");
  const target = parseTarget(url);
  console.log(`Conexión de la APLICACIÓN: ${describeTarget(target)}`);
  const appRole = (process.env.DB_APP_ROLE ?? "hc_app").trim();
  if (!appRole) line("ERROR", "DB_APP_ROLE está vacía: la app no bajaría de rol (sin RLS efectiva). Escriba DB_APP_ROLE=hc_app.");

  const client = new Client(buildClientConfig(url));
  await client.connect();
  try {
    const stream = (client as unknown as { connection?: { stream?: unknown } }).connection?.stream;
    if (stream instanceof TLSSocket && stream.encrypted) line("OK", "Conexión cifrada (TLS) entre este equipo y el servidor.");
    else if (target.local) line("OK", "Conexión local sin TLS (esperado).");
    else line("ERROR", "La conexión NO está cifrada. Revise DB_SSL.");

    await client.query("begin read only");
    const q = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []) => (await client.query<T>(sql, p)).rows;

    const [me] = await q<{ u: string; rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolbypassrls: boolean; usage: boolean }>(
      `select current_user as u, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls,
              coalesce(has_schema_privilege(current_user, 'hc', 'USAGE'), false) as usage
         from pg_roles r where r.rolname = current_user`,
    );
    console.log(`Rol de conexión: «${me!.u}»`);
    const privileged = me!.rolsuper || me!.rolcreaterole || me!.rolcreatedb || me!.rolbypassrls;
    if (privileged) {
      line("AVISO", `El rol «${me!.u}» es privilegiado (superuser=${me!.rolsuper} createrole=${me!.rolcreaterole} createdb=${me!.rolcreatedb} bypassrls=${me!.rolbypassrls}). La app baja a ${appRole}, pero una inyección SQL hipotética podría volver a este rol. Recomendado: rol dedicado hc_login (docs/19).`);
    } else {
      line("OK", `«${me!.u}» no tiene atributos privilegiados (sin superuser, createrole, createdb ni bypassrls).`);
    }
    if (!privileged && me!.usage) line("ERROR", `«${me!.u}» tiene acceso directo al esquema hc sin pasar por ${appRole}.`);
    else if (!privileged) line("OK", `Sin SET ROLE, «${me!.u}» no puede usar el esquema hc.`);

    const reach = await q<{ rolname: string; rolsuper: boolean; rolcreaterole: boolean; rolbypassrls: boolean }>(
      `select rolname, rolsuper, rolcreaterole, rolbypassrls from pg_roles
        where rolname <> current_user and rolname !~ '^pg_' and pg_has_role(current_user, oid, 'MEMBER')`,
    );
    const names = reach.map((r) => r.rolname);
    console.log(`Roles a los que puede cambiar con SET ROLE: ${names.join(", ") || "ninguno"}`);
    const risky = reach.filter((r) => r.rolsuper || r.rolcreaterole || r.rolbypassrls);
    if (!privileged && risky.length) line("ERROR", `Puede cambiar a roles privilegiados: ${risky.map((r) => r.rolname).join(", ")}.`);
    else if (!privileged && names.some((n) => n !== appRole)) line("AVISO", `Puede cambiar a roles distintos de ${appRole}: revise si es intencional.`);
    else if (!privileged) line("OK", `Solo puede cambiar a ${appRole}.`);

    try {
      await client.query("savepoint s1");
      await client.query(`set local role "${appRole.replace(/"/g, "")}"`);
      const [inside] = await q<{ u: string; ins: boolean; upd: boolean; del: boolean; sel: boolean }>(
        `select current_user as u,
                has_table_privilege(current_user, 'hc.weighings', 'INSERT') as ins,
                has_table_privilege(current_user, 'hc.weighings', 'UPDATE') as upd,
                has_table_privilege(current_user, 'hc.weighings', 'DELETE') as del,
                has_table_privilege(current_user, 'hc.weighings', 'SELECT') as sel`,
      );
      line("OK", `SET LOCAL ROLE ${appRole} funciona (current_user dentro = ${inside!.u}).`);
      if (inside!.ins || inside!.upd || inside!.del) line("ERROR", `${appRole} puede escribir directamente en hc.weighings.`);
      else if (!inside!.sel) line("ERROR", `${appRole} no puede leer hc.weighings.`);
      else line("OK", `${appRole}: solo lectura sobre tablas de negocio (la escritura va por funciones controladas).`);
      await client.query("rollback to savepoint s1");
    } catch (e) {
      await client.query("rollback to savepoint s1");
      line("ERROR", `SET LOCAL ROLE ${appRole} falló: ${(e as Error).message}`);
    }
    await client.query("rollback");
  } finally {
    await client.end();
  }
  console.log(errors ? `\nResultado: ${errors} ERROR(ES).` : warnings ? `\nResultado: sin errores, ${warnings} aviso(s).` : "\nResultado: sin errores ni avisos.");
  process.exit(errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
