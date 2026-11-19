import { TLSSocket } from "node:tls";
import { Client } from "pg";
import { buildClientConfig, describeTarget, parseTarget } from "../src/lib/db-config";
import { planMigrations } from "../src/lib/migrator";
import { loadEnv } from "./env";

/**
 * npm run db:check — diagnóstico de SOLO LECTURA (transacción `read only`, siempre se revierte).
 * Sirve para verificar que se apunta al proyecto correcto y que la BD está en el estado esperado ANTES de migrar.
 * No imprime claves ni datos de negocio: solo metadatos y conteos.
 */

type Level = "OK" | "AVISO" | "ERROR";
let errors = 0;
const line = (lvl: Level, msg: string) => {
  if (lvl === "ERROR") errors++;
  console.log(`  [${lvl}] ${msg}`);
};

async function main() {
  loadEnv();
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Defina MIGRATION_DATABASE_URL o DATABASE_URL en .env.local (ver docs/19).");
  const target = parseTarget(url);
  console.log(`Destino: ${describeTarget(target)}`);
  if (target.transactionPooler) line("AVISO", "Puerto 6543 (pooler en modo transacción): válido para la aplicación (usa SET LOCAL ROLE) pero NO para migrar.");
  if (!target.local && !target.supabase) line("AVISO", "El host no es local ni Supabase: confirme que es el destino correcto.");

  const client = new Client(buildClientConfig(url));
  await client.connect();
  try {
    await client.query("begin read only");
    const q = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []) => (await client.query<T>(sql, p)).rows;

    const [info] = await q<{ v: string; u: string; db: string; ssl: boolean | null }>(
      `select version() as v, current_user as u, current_database() as db,
              (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl`,
    );
    console.log(`Servidor: ${info!.v.split(",")[0]} · base «${info!.db}» · rol de conexión «${info!.u}»`);
    // Se mide el tramo de ESTA máquina hacia el servidor/pooler (el que protege la clave). `pg_stat_ssl` solo
    // describe el tramo interno pooler→base cuando hay un pooler, por eso se muestra únicamente como dato.
    const stream = (client as unknown as { connection?: { stream?: unknown } }).connection?.stream;
    const clientTls = stream instanceof TLSSocket && stream.encrypted === true;
    if (clientTls) line("OK", "Conexión cifrada (TLS) entre este equipo y el servidor.");
    else if (target.local) line("OK", "Conexión local sin TLS (esperado).");
    else line("ERROR", "La conexión desde este equipo NO está cifrada. Revise DB_SSL (debe ser require o verify).");
    if (!target.local) console.log(`  [INFO] pg_stat_ssl (tramo interno del servidor/pooler): ${info!.ssl === true ? "cifrado" : "no informado como cifrado"}`);

    const [role] = await q<{ rolsuper: boolean; rolcreaterole: boolean; rolbypassrls: boolean }>(
      "select rolsuper, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user",
    );
    line("OK", `Atributos del rol: superuser=${role!.rolsuper} createrole=${role!.rolcreaterole} bypassrls=${role!.rolbypassrls}`);

    // Esquemas existentes: permite comprobar que no se tocará nada ajeno a HubCircular.
    const schemas = await q<{ s: string; n: number }>(
      `select n.nspname as s, count(c.oid) filter (where c.relkind in ('r','p'))::int as n
         from pg_namespace n left join pg_class c on c.relnamespace = n.oid
        where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        group by n.nspname order by 1`,
    );
    console.log("Esquemas y n.º de tablas (la migración solo crea/modifica el esquema «hc»):");
    for (const s of schemas) console.log(`    ${s.s}: ${s.n} tablas${s.s === "hc" ? "  ← HubCircular" : ""}`);

    const [hcRole] = await q<{ ok: boolean; member: boolean | null }>(
      "select true as ok, pg_has_role(current_user, 'hc_app', 'MEMBER') as member from pg_roles where rolname = 'hc_app'",
    );
    if (!hcRole) line("AVISO", "El rol hc_app aún no existe (lo crea la migración 0001).");
    else if (!hcRole.member && !role!.rolsuper) line("ERROR", "El rol de conexión no es miembro de hc_app: SET ROLE fallará.");
    else {
      try {
        await client.query("savepoint s1");
        await client.query("set local role hc_app");
        const [who] = await q<{ r: string }>("select current_user as r");
        await client.query("rollback to savepoint s1");
        line("OK", `SET LOCAL ROLE hc_app funciona (current_user dentro = ${who!.r}).`);
      } catch (e) {
        await client.query("rollback to savepoint s1");
        line("ERROR", `SET LOCAL ROLE hc_app falló: ${(e as Error).message}`);
      }
    }

    const hc = schemas.find((s) => s.s === "hc");
    if (!hc) {
      line("AVISO", "El esquema hc no existe: la base está sin inicializar para HubCircular.");
    } else {
      const noRls = await q<{ t: string }>(
        `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'hc' and c.relkind in ('r','p') and not c.relrowsecurity and c.relname <> 'schema_migrations'`,
      );
      if (noRls.length) line("ERROR", `Tablas hc SIN RLS: ${noRls.map((r) => r.t).join(", ")}`);
      else line("OK", "Todas las tablas de hc tienen RLS habilitado.");

      const exposed = await q<{ what: string }>(
        `select 'esquema hc: USAGE para ' || r as what from unnest(array['anon','authenticated']) r
          where exists (select 1 from pg_roles where rolname = r) and has_schema_privilege(r, 'hc', 'USAGE')
         union all
         select 'tabla hc.' || c.relname || ': ' || p.priv || ' para ' || r
           from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'hc' and c.relkind in ('r','p')
           cross join unnest(array['anon','authenticated']) r
           cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(priv)
          where exists (select 1 from pg_roles where rolname = r) and has_table_privilege(r, c.oid, p.priv)
         union all
         select 'función hc.' || f.proname || ': EXECUTE para ' || r
           from pg_proc f join pg_namespace n on n.oid = f.pronamespace and n.nspname = 'hc'
           cross join unnest(array['anon','authenticated']) r
          where exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, f.oid, 'EXECUTE')`,
      );
      if (exposed.length) {
        line("ERROR", `anon/authenticated tienen acceso a hc (${exposed.length}):`);
        for (const e of exposed.slice(0, 10)) console.log(`        - ${e.what}`);
      } else line("OK", "anon y authenticated no tienen ningún privilegio sobre el esquema hc.");

      const plan = await planMigrations(client);
      console.log(`Migraciones aplicadas (${plan.applied.length}): ${plan.applied.join(", ") || "ninguna"}`);
      if (plan.pending.length) line("AVISO", `Pendientes (${plan.pending.length}): ${plan.pending.join(", ")}`);
      else line("OK", "No hay migraciones pendientes.");
      if (plan.conflicts.length) line("ERROR", `Conflictos de migración: ${plan.conflicts.join("; ")}`);

      if (plan.applied.length >= 3) {
        const [c] = await q<{ real: number; demo: number; bal: number }>(
          `select count(*) filter (where data_origin = 'real')::int as real,
                  count(*) filter (where data_origin = 'demo')::int as demo,
                  (select count(*) from hc.batch_location_balances)::int as bal
             from hc.weighings`,
        );
        console.log(`Pesajes: ${c!.real} reales · ${c!.demo} DEMO · ${c!.bal} saldos de lote`);
      }
      if (plan.applied.some((f) => f.startsWith("0007_"))) {
        const [m] = await q<{ real: number; demo: number; dest: number; neg: number; ev: number; ver: number }>(
          `select (select count(*) from hc.movements where data_origin = 'real')::int as real,
                  (select count(*) from hc.movements where data_origin = 'demo')::int as demo,
                  (select count(*) from hc.destinations)::int as dest,
                  (select count(*) from hc.batch_location_balances where balance_g < 0)::int as neg,
                  (select count(*) from hc.movement_evidence)::int as ev,
                  (select count(*) from hc.movement_verifications)::int as ver`,
        );
        console.log(`Movimientos: ${m!.real} reales · ${m!.demo} DEMO · ${m!.dest} destinos · ${m!.ev} evidencias · ${m!.ver} verificaciones`);
        if (m!.neg > 0) line("ERROR", `Hay ${m!.neg} saldos negativos (no debería ser posible).`);
        else line("OK", "Ningún saldo de lote es negativo.");
      }
    }
    await client.query("rollback");
  } finally {
    await client.end();
  }
  console.log(errors ? `\nResultado: ${errors} ERROR(ES). No continúe hasta resolverlos.` : "\nResultado: sin errores.");
  process.exit(errors ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
