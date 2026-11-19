# 15 · Registro de avances y bitácora colaborativa

> Única bitácora de cambios de software entre Codex y Claude Code. No escribir credenciales ni tokens.

## 2026-11-18 — Paquete V2 inicial
- **Responsable:** preparación documental (sin ejecución del software web).
- **Realizado:** conservado paquete original; agregado prompt maestro portable, `AGENTS.md`, `CLAUDE.md`, estado real del hardware y guía colaborativa; corregidas referencias obsoletas a compras pendientes en documentación técnica.
- **Pruebas:** verificación estática de archivos incluidos en ZIP. No se ejecutaron builds web, tests de aplicación, migraciones ni despliegues.
- **Pendiente:** crear proyecto web; implementar registro manual; revisar esquema y contrato IoT contra requisitos; conectar Supabase cuando se autorice; probar HX711/celda de tres cables.
- **Siguiente paso:** iniciar prompt maestro en Claude Code o Codex, auditar documentación e implementar primer incremento verificable.

## 2026-11-18 — Fase 0 (auditoría) + Fase 1 (Iteraciones 0 y 1 de `docs/07`)
- **Agente / rama / commit:** Claude (escritorio) · sin Git (la carpeta no era un repositorio y no hubo shell local; ver riesgos) · sin commit.
- **Objetivo:** auditar la documentación y construir la primera vertical: autenticación mínima + catálogo semilla + registro manual validado + consulta persistida + pruebas.
- **Cambios y archivos:**
  - Documentación nueva: `docs/17-auditoria-documental.md`, `docs/18-decisiones-de-arquitectura.md`. Actualizados: `docs/11`, `docs/14`, `docs/15`, `README.md`, `CLAUDE.md`, `AGENTS.md`.
  - Base: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.mts`, `playwright.config.ts`, `.gitignore`, `.env.example`, `docker-compose.yml`.
  - BD: `db/migrations/0001…0005_*.sql`, `db/seed/demo.ts`; scripts `scripts/{migrate,seed,reset-dev-db,env}.ts`; `src/lib/migrator.ts`.
  - Dominio/servidor: `src/lib/{db,errors,time,utils}.ts`; `src/modules/identity/*`, `catalog/queries.ts`, `weighing/{units,schema,service,queries,refs}.ts`, `inventory/queries.ts`; `src/proxy.ts`; `src/app/api/weighings/route.ts`.
  - UI: `src/app/(auth)/login/*`, `src/app/(app)/{registro,historial,pesajes/[id],lotes/[id],contenedores}/*`, `src/components/*`.
  - Pruebas: `tests/unit/*` (5 archivos), `tests/integration/*` (5), `tests/e2e/*` (1 + preparación de BD), `tests/helpers/*`.
- **Comandos y pruebas (resultados reales, Linux, Node 22.23, PostgreSQL 16.15, Next 16.4.6):**
  - `npm run typecheck` ✅ · `npm run lint` ✅ (0 errores, 0 advertencias) · `npm run build` ✅.
  - `npm test` (Vitest): **10 archivos, 134 pruebas ✅** — 63 unitarias + integración contra PostgreSQL real: migraciones idempotentes y checksum, privilegios de `hc_app`, RLS por rol/zona, atomicidad (fallo simulado en el saldo ⇒ 0 filas), idempotencia (incl. **10 envíos simultáneos ⇒ 1 pesaje**), inmutabilidad, autenticación (bloqueo, sesiones, hashes), consultas y filtros.
  - `npm run test:e2e` (Playwright, Chromium, build de producción, BD dedicada): **20 pruebas ✅** — login/logout, redirección abierta bloqueada, cookie HttpOnly/SameSite, registro con neto en vivo, validaciones, doble clic, QR, API, roles y ámbito, historial, **axe-core WCAG 2 A/AA sin violaciones serias/críticas** en 4 pantallas.
  - Prueba de mutación manual: sin la restricción única de idempotencia, el test de concurrencia falla (7 duplicados) ⇒ el test es efectivo.
  - Inspección visual de capturas (escritorio y móvil) del registro, historial y confirmación.
- **Casos de aceptación de `docs/01` cubiertos:** 1 (4.250−350 ⇒ 3.900, un lote de 3.900 g), 2 (inválidos sin efecto persistido). Quedan para iteraciones siguientes: 3, 4, 6 (movimientos/concurrencia), 5 (IoT), 7 (telemetría), 8 (evidencia), 9 (cobertura).
- **Decisiones tomadas:** ADR-001…013 en `docs/18` (PostgreSQL estándar sin Supabase aún; auth local sustituible; saldo en tabla con `CHECK ≥ 0`; ubicación = zona; idempotencia por usuario; `data_origin` demo/real; masa en gramos y tope de 1.000 kg; RLS + rol mínimo + funciones `SECURITY DEFINER`; inmutabilidad; PDF/ZIP fuera de Git).
- **Riesgos, bloqueos y cambios no confirmados:**
  - El shell de la computadora del usuario no arrancó (poco espacio libre en disco), por lo que **todo se construyó y probó en la nube** y se copió a la carpeta por la pasarela de archivos. **No se instaló `node_modules` ni se inicializó Git en el equipo del usuario**; no se ejecutó nada en Windows.
  - Nada se probó contra Supabase, ni hay despliegue. La opción de conexión `role=hc_app` podría no funcionar tras un *pooler* de transacciones (ADR-010).
  - Sin gestión de usuarios/contraseñas por UI; sin CSP/HSTS; límite de intentos solo por cuenta.
  - Datos semilla = **DEMO**; ningún dato real del Hub. Hardware/firmware: sin cambios ni afirmaciones nuevas.
- **Próxima acción:** en el equipo del usuario: instalar dependencias, aplicar migraciones y repetir `npm run verify` + `npm run test:e2e` (README). Luego, **Iteración 2 — Trazabilidad** (ver `docs/14`).

### 2026-11-18 — Iteración 1.5: Windows + Supabase + Git + validación integral
- Agente / rama / commit: Claude (Cowork) · `main` · commit «Iteración 1.5…» (ver `git log`).
- Objetivo: dejar el proyecto listo para operar en Windows sin Docker y conectarse de forma segura al proyecto Supabase «HubCircular», sin iniciar la Iteración 2.
- Cambios y archivos:
  - Nuevos: `db/migrations/0006_managed_postgres_hardening.sql`, `src/lib/{db-config,origin}.ts`, `scripts/db-check.ts`, `scripts/windows/{verificar-entorno,postgres-local}.ps1`, `.gitattributes`, `tests/helpers/guard.ts`, `tests/unit/{db-config,origin,migrator}.test.ts`, `tests/integration/{app-role,hardening}.test.ts`, `docs/{19,20,21}-*.md`.
  - Modificados: `src/lib/{db,migrator}.ts`, `scripts/{migrate,seed,reset-dev-db}.ts`, `src/app/api/weighings/route.ts`, `tests/helpers/db.ts`, `tests/e2e/{prepare-db,global-teardown}.ts`, `playwright.config.ts`, `package.json` (`db:check`), `.env.example`, `.gitignore`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/{14,15,18}`.
  - Eliminado: `docker-compose.yml`.
- Comandos y pruebas (resultados reales; Linux, Node 22.23.5, PostgreSQL 16.15): línea base 134/134 · `typecheck` ✅ · `lint` ✅ · Vitest **15 archivos, 167/167** (85 unitarias, 82 integración; 0 omitidas) · E2E **20/20** · `npm audit` 0 vulnerabilidades · `db:check`/`db:migrate`/`db:seed` sobre PostgreSQL local ✅ · candados remotos comprobados sin conexión. Detalle en `docs/20`.
- Decisiones tomadas: ADR-014 (auth: transición controlada, local activa), ADR-015 (`SET LOCAL ROLE` + 0006 + `db:check`), ADR-016 (sin Docker; pruebas destructivas solo locales; candados remotos), ADR-017 (CRLF en migraciones). H-01, H-05 y H-07: análisis en `docs/21`, **sin resolver**.
- Riesgos, bloqueos y cambios no confirmados:
  - **Supabase no conectado**: no existe `.env.local`; no se piden credenciales por chat. Ninguna migración se ejecutó allí; su estado es desconocido.
  - **Windows nativo no verificado**: el shell disponible es una VM Linux; los `.ps1` no se ejecutaron ni se analizaron sintácticamente.
  - Las 15 comprobaciones manuales en `localhost:3000` no se hicieron en Windows; sus equivalentes automatizados (20 E2E) sí pasan en Linux.
  - Riesgo residual: conexión como `postgres` + `SET LOCAL ROLE` (mitigación `hc_login`, `docs/19`). Sin CSP/HSTS, sin UI de usuarios.
  - El historial de Git se armó fuera de la carpeta y se trasladó; la autoría local es «Claude (Cowork)».
- Próxima acción (usuario): seguir `docs/19` secciones 1–4 (verificar entorno, crear `.env.local`, `db:check`, `--dry-run`) y **aprobar** la migración; luego la lista de `docs/20` sección 8. Después, decidir H-01/H-05/H-07 con el Hub y comenzar la Iteración 2.

### 2026-11-18 — Conexión y migración en Supabase (ejecutadas por el usuario)
- Agente / rama / commit: usuario en PowerShell + Claude (Cowork) · `main`.
- Objetivo: conectar con el proyecto Supabase de desarrollo y aplicar las migraciones con aprobación explícita.
- Cambios: `npm ci` en Windows (414 paquetes, 0 vulnerabilidades); corrección de `scripts/db-check.ts` (mide el TLS del tramo equipo→servidor; con pooler `pg_stat_ssl` daba un falso «sin TLS»); migraciones 0001–0006 aplicadas en Supabase (esquema `hc` y rol `hc_app` creados; ningún otro esquema tocado).
- Comandos y resultados (salida real del usuario): `db:check` previo sin errores; `db:migrate -- --dry-run` ⇒ 6 pendientes; `db:migrate` ⇒ 6 aplicadas; `db:check` posterior sin errores (TLS, `SET LOCAL ROLE hc_app`, RLS, sin privilegios de anon/authenticated, 0 pendientes, 0 pesajes). Primera ejecución nativa en Windows de Node 24.13/npm 11.6 con las dependencias del proyecto: instalación y scripts de BD funcionan; `npm run dev`, typecheck, lint y pruebas **aún no ejecutados en Windows**.
- Decisiones: sin cambios. Pendiente decidir si se carga el seed DEMO en Supabase (opcional, con `CONFIRM_REMOTE_SEED`).
- Riesgos: `DATABASE_URL` aún usa el usuario `postgres` (ver `hc_login` en `docs/19`); validación funcional en Supabase pendiente (`docs/20`, sección 8).
- Próxima acción: seed DEMO opcional, `npm run dev` y la lista de validación.

### 2026-11-18 — Validación funcional en Supabase (ejecutada por el usuario)
- Cambios: carga del seed DEMO en Supabase y pruebas manuales con los tres roles; ver `docs/20` §9.
- Resultados: persistencia, neto 3,900 kg, 1 lote y 1 saldo por pesaje (`db:check`: 3 DEMO · 3 saldos · 0 reales), lector sin acceso a registro, alcance por zona correcto. **Sin probar en Supabase:** doble envío (probado solo en PostgreSQL local).
- Próxima acción: probar doble envío, revisar *Exposed schemas* en el panel, y crear el rol `hc_login` antes de datos reales.

### 2026-11-18 — Rol `hc_login` en Supabase (ejecutado por el usuario)
- Cambios: nuevo `scripts/db-check-app.ts` (`npm run db:check:app`, solo lectura; probado en PostgreSQL local en 4 escenarios); guía en `docs/19`; el usuario creó `hc_login` y cambió `DATABASE_URL`.
- Resultado: informado por el usuario como correcto (la salida no se compartió). `docs/20` §10.
- Pendiente antes de datos reales: CSP/HSTS, gestión de usuarios por UI, copias de seguridad, doble envío probado en Supabase, y decisiones H-01/H-05/H-07 con el Hub.

### 2026-11-18 — Información del equipo sobre la operación del Hub
- Cambios: `docs/21` (actualización) y `docs/11` registran que el Hub no pesa ni gestiona reciclables, que probablemente llegan materiales mezclados y que existen contenedores globales mezclados. Información verbal del equipo, **no confirmada por el Hub**. H-01, H-05 y H-07 siguen **abiertas**.
- Próxima acción: enviar al Hub el correo revisado (quién retira hoy los residuos, uso de contenedores globales, lugar de acopio) y decidir el alcance del piloto.

### 2026-11-18 — Contenedor global mixto (DEMO)
- Cambios: `db/seed/demo.ts` (material `DEMO-MIXTO`, estación `DEMO-Z01-GLOBAL`, contenedor `DEMO-Z01-GLOBAL-MIXTO` sin tara nominal); `tests/integration/mixed-container.test.ts` (4 pruebas nuevas); ajustados los recuentos esperados en `queries.test.ts` y `rls.test.ts`; ADR-018.
- Pruebas (Linux, PostgreSQL 16): typecheck y lint limpios; Vitest **16 archivos, 171/171**; E2E **20/20**. Sin cambios de migraciones ni de código de aplicación.
- Supabase: el usuario volvió a ejecutar `db:seed` y informó que el contenedor global mixto funciona ; salida de `db:seed` compartida después (sin errores, sin claves impresas ⇒ se usaron `SEED_*_PASSWORD` de `.env.local`).

## Plantilla para nuevos avances
### AAAA-MM-DD — [Título]
- Agente / rama / commit:
- Objetivo:
- Cambios y archivos:
- Comandos y pruebas (resultados reales):
- Decisiones tomadas:
- Riesgos, bloqueos y cambios no confirmados:
- Próxima acción:
