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

### 2026-11-18 — Iteración 2: Trazabilidad (movimientos, destinos, evidencia, verificación)
- Agente / rama / commit: Claude (Cowork) · `main` · commit «Iteración 2…» (ver `git log`).
- Objetivo: saldo por lote y ubicación con movimientos auditables (traslado, despacho, reutilización, rechazo, ajuste), correcciones sin borrado, destinos y evidencia/verificación sin segunda salida.
- Alcance decidido con el usuario: evidencia = solo referencia de texto; destinos = catálogo con DEMO y administración básica (destino obligatorio en todo despacho); los cinco tipos con un único flujo y formulario común; ajuste y correcciones solo administrador.
- Cambios y archivos:
  - Nuevos: `db/migrations/0007_movements_traceability.sql`; `src/modules/movements/{schema,service,queries}.ts`; `src/app/(app)/retiros/{page,actions,movement-form}`; `src/app/(app)/destinos/{page,actions,destination-form}`; `src/app/(app)/lotes/[id]/{actions,movement-panels}`; `tests/integration/movements.test.ts`, `tests/unit/movement-schema.test.ts`, `tests/e2e/traceability.spec.ts`; `docs/22-validacion-iteracion-2.md`.
  - Modificados: `src/lib/errors.ts`, `src/modules/identity/permissions.ts`, `src/modules/weighing/refs.ts`, `src/components/app-shell.tsx`, `src/app/(app)/lotes/[id]/page.tsx`, `db/seed/demo.ts` (3 destinos DEMO), `scripts/db-check.ts`, `tests/helpers/db.ts`, `tests/integration/hardening.test.ts` (acepta migraciones posteriores a 0006), `docs/{11,14,15,18}`, `README.md`.
- Comandos y pruebas (resultados reales; Linux, PostgreSQL 16.15): `tsc --noEmit` ✅ · `eslint` ✅ · `next build` ✅ · Vitest **18 archivos, 225/225** (40 de integración de movimientos + 14 unitarias nuevas) · Playwright **31/31** (11 nuevas, incluida axe-core) · `db:check` local ✅. **Prueba de mutación:** sin los `FOR UPDATE`, fallan las pruebas de concurrencia. Detalle y casos de aceptación en `docs/22`.
- Decisiones tomadas: ADR-019 (flujo único, bloqueo de lote, correcciones como movimiento inverso, coherencia DEMO/real) y ADR-020 (evidencia por texto; valorización como verificación, valor provisional de H-05).
- Riesgos, bloqueos y cambios no confirmados:
  - **0007 no se aplicó en Supabase** (pendiente de aprobación del usuario). Windows nativo sigue sin verificarse.
  - H-01, H-05 y H-07 siguen abiertas con valores provisionales; sin excepciones de material ni MIXTO real.
  - Un operador solo ve zonas de su ámbito como destino de traslado; la BD permite trasladar a cualquier zona activa si se conoce su identificador (revisar con el Hub).
  - Sin API REST de movimientos ni archivos de evidencia; sin dashboard/CSV.
- Próxima acción (usuario): `docs/22` sección 5 para aplicar 0007 en Supabase (solo con su aprobación) y probar `/retiros` con los datos DEMO. Después: Iteración 3.

### 2026-11-18 — Migración 0007 aplicada en Supabase (ejecutada por el usuario)
- Agente / rama / commit: usuario en PowerShell + Claude (Cowork) · `main`.
- Objetivo: aplicar la migración 0007 (trazabilidad) en el proyecto Supabase de desarrollo con aprobación explícita.
- Comandos y resultados (salida real del usuario): `db:migrate -- --dry-run` ⇒ 1 pendiente (0007); `db:migrate` sin confirmación ⇒ bloqueado por el candado remoto (sin escribir); con `CONFIRM_REMOTE_MIGRATION` ⇒ «Migraciones aplicadas: 0007»; `db:check` posterior sin errores: 7 migraciones, 0 pendientes, RLS en las 18 tablas de `hc`, `SET LOCAL ROLE hc_app` correcto, `anon`/`authenticated` sin privilegios, «Movimientos: 0 reales · 0 DEMO · 0 destinos», «Ningún saldo de lote es negativo».
- Pesajes existentes en Supabase: 0 reales · 6 DEMO · 6 saldos (los pesajes DEMO de la validación manual).
- Pendiente: cargar los 3 destinos DEMO (`db:seed` con `CONFIRM_REMOTE_SEED`; restablece contraseñas DEMO) y probar `/retiros` en Supabase con los tres roles. Sin probar aún en Supabase: movimientos, evidencia y verificación (solo en PostgreSQL local).

### 2026-11-18 — Seed de destinos y validación manual de la Iteración 2 en Supabase (ejecutadas por el usuario)
- Agente / rama / commit: usuario en PowerShell y navegador + Claude (Cowork) · `main`.
- Comandos y resultados (salida real del usuario): `db:seed` con `CONFIRM_REMOTE_SEED` ⇒ «Datos DEMO cargados», sin claves impresas (se usaron `SEED_*_PASSWORD`); `db:check` ⇒ `Movimientos: 0 reales · 0 DEMO · 3 destinos`, sin errores.
- Validación manual (`npm run dev` contra Supabase, tres roles, lista de seis pasos de `docs/22` §6): el usuario informó «está bien todo». **No se compartieron capturas, salidas por paso ni un segundo `db:check`**, de modo que el detalle (cifras de saldo, estados mostrados, correcciones) queda como informado por el usuario y no verificado por Claude.
- Pendiente: Iteración 3; decisiones H-01/H-05/H-07 con el Hub; antes de datos reales: CSP/HSTS, gestión de usuarios por UI, copias de seguridad.

### 2026-11-19 — Seguridad previa a datos reales: CSP/HSTS, usuarios por UI, respaldos y Supabase Auth
- Agente / rama / commit: Claude (Cowork) · `main` (commit al entregar).
- Objetivo: lo pendiente antes de usar datos reales, con las cuatro piezas elegidas por el usuario y clave temporal mostrada una vez.
- Cambios y archivos: `src/lib/security-headers.ts`, `src/proxy.ts` (nonce + cabeceras), layout dinámico; migración **0008** (gestión de usuarios, `must_change_password`, `auth_resolve_session` con 5.ª columna) y módulo `src/modules/users`, pantallas `/usuarios` y `/cuenta/clave`; migración **0009** (`profiles.auth_user_id`, `hc.auth_link_supabase`, alta sin clave local), `auth-provider.ts`, `supabase-auth.ts`, `AUTH_PROVIDER`; `scripts/backup.ts`, `restore-check.ts`, `backup-inventory.ts`, `src/lib/backup.ts`; `docs/23`, `docs/24`, ADR-021 a ADR-024, `.env.example`, `docs/19`, README.
- Comandos y pruebas (resultados reales, Linux + PostgreSQL 16 local): `tsc --noEmit`, `eslint .` y `next build` sin errores; **Vitest 288/288** (24 archivos); **Playwright 44/44** (39 modo local + 5 modo Supabase contra GoTrue **simulado**, con axe-core en las pantallas nuevas). Mutaciones: sin control de «último administrador» fallan 6 pruebas; aceptar correo sin confirmar, identidad distinta o perfil inactivo hace fallar 1 prueba cada una (todas restauradas). Respaldo + restauración real en base vacía: 18 tablas, 43 filas, 8 migraciones, 17 políticas, 35 funciones y RLS idénticos; 7 salvaguardas negativas comprobadas (repo, sin `BACKUP_DIR`, puerto 6543, Supabase, base no vacía, archivo alterado, sin variable).
- Decisiones: ADR-021 (Supabase Auth solo verifica; autorización de HubCircular; sin service_role ni SDK), ADR-022 (CSP con nonce; `style-src 'unsafe-inline'` aceptado), ADR-023 (clave temporal una vez; la obligación de cambiarla es de la app, no de RLS), ADR-024 (respaldo fuera del repo con prueba de restauración).
- Riesgos, bloqueos y cambios no confirmados: **0008 y 0009 NO aplicadas en Supabase** (0008 cambia la firma de `auth_resolve_session`: aplicar junto con el código nuevo); **Supabase Auth no probado contra el servicio real** (respuestas simuladas); respaldo y cabeceras sin probar en Supabase/producción ni en Windows nativo; pg_dump 16 probado, el servidor de Supabase es 17 (se necesita cliente ≥ 17). Los respaldos contienen hashes de contraseña.
- Próxima acción: el usuario decide si aplica 0008 (y 0009) con respaldo previo (`docs/23` §3 y §5); primera corrida real de `db:backup`/`db:restore-check`; confirmar copias de Supabase; luego Iteración 3 y decisiones H-01/H-05/H-07.

### 2026-11-19 — Migraciones 0008 y 0009 aplicadas en Supabase (ejecutadas por el usuario)
- Agente / rama / commit: usuario en PowerShell + Claude (Cowork) · `main`.
- Comandos y resultados (salida real del usuario): `db:migrate -- --dry-run` ⇒ aplicadas 7, pendientes 0008 y 0009; `db:migrate` con `CONFIRM_REMOTE_MIGRATION` ⇒ «Migraciones aplicadas: 0008, 0009»; `db:check` posterior sin errores: PostgreSQL 17.11, TLS cifrado, `SET LOCAL ROLE hc_app` funciona, RLS en las 18 tablas de `hc`, `anon`/`authenticated` sin privilegios, 9 migraciones y 0 pendientes, `Pesajes: 0 reales · 6 DEMO · 6 saldos`, `Movimientos: 0 reales · 1 DEMO · 4 destinos · 1 evidencias · 1 verificaciones`, ningún saldo negativo.
- Observaciones: los conteos de movimientos y destinos (antes 0 y 3) indican datos DEMO creados por el usuario en sus pruebas manuales; no se pidió ni se recibió detalle.
- **No informado / sin verificar:** el usuario no compartió la salida de `db:backup`, por lo que **no consta** que se haya hecho un respaldo antes de migrar ni que `db:backup` o `db:restore-check` hayan corrido en Windows; tampoco consta la prueba manual de `/usuarios` ni de la clave temporal contra Supabase, ni que se haya activado Supabase Auth (el proveedor sigue siendo `local` salvo que el usuario indique lo contrario).
- Próxima acción: primera corrida real de `db:backup` (y `db:restore-check`), prueba manual de `/usuarios` en Supabase, confirmar las copias del plan de Supabase y decidir el proveedor de identidad (`docs/23` §3 y §5).

### 2026-11-19 — Primer respaldo real de Supabase con `db:backup` (ejecutado por el usuario en Windows)
- Agente / rama / commit: usuario en PowerShell + Claude (Cowork) · `main`.
- Comandos y resultados (salida real del usuario): `db:backup` con `pg_dump` 18.2 (`C:\Program Files\PostgreSQL\18`, vía `PG_DUMP_PATH`/`PG_RESTORE_PATH`) y `BACKUP_DIR=D:\Respaldos\HubCircular` (variables solo de la sesión de PowerShell) ⇒ «Respaldo OK»: 141887 bytes, sha256 `6d553cc39fb0e5dc…`, 261 objetos, 18 tablas, 77 filas, 9 migraciones; archivo `hubcircular-hc-remoto-postgres-20261119-040207Z.dump` (UTC) fuera del repositorio. Un primer intento sin `BACKUP_DIR` fue rechazado por el script (comportamiento esperado) y `pg_dump` no estaba en el `PATH`.
- Verificado: `pg_dump` 18.2 puede volcar el servidor PostgreSQL 17.11 de Supabase en Windows con las salvaguardas del script.
- **Sigue sin verificar:** `db:restore-check` con este archivo (requiere una base **local y vacía**); la restauración no se ha probado con un volcado de Supabase, solo con uno local en Linux. El respaldo es anterior a la prueba manual de `/usuarios` en Supabase, que tampoco consta.
- Próxima acción: prueba de restauración local y prueba manual de `/usuarios` (`docs/23` §5).

### 2026-11-19 — Primera prueba de restauración real del respaldo de Supabase (ejecutada por el usuario en Windows)
- Agente / rama / commit: usuario en PowerShell + Claude (Cowork) · `main` · corrección en `61d305d`.
- Preparación (salida real del usuario): PostgreSQL local descartable con `scripts/windows/postgres-local.ps1` usando los binarios 18 instalados (`-PgBin "C:\Program Files\PostgreSQL\18\bin"`, puerto 54329, solo `127.0.0.1`, sin contraseña) y base vacía `hc_restore_test`. La contraseña del PostgreSQL instalado no se necesitó ni se compartió.
- Fallo encontrado y corregido: el primer intento de `db:restore-check` terminó con «The server does not support SSL connections» tras el checksum correcto, porque el `DB_SSL=require` del `.env.local` (para Supabase) se aplicaba también al destino local. Reproducido en Linux con la misma variable, corregido (el destino local de la restauración siempre se conecta sin TLS) y cubierto con una prueba unitaria (`tests/unit/backup.test.ts`, ahora 9 pruebas). Sin otros cambios de comportamiento.
- Resultado (salida real del usuario, tras la corrección): `db:restore-check` sobre `hubcircular-hc-remoto-postgres-20261119-040207Z.dump` ⇒ **«Prueba de restauración OK»**: checksum coincide; `pg_restore` sin errores; 18 tablas; **77 filas idénticas** al origen; 9 migraciones idénticas; 17 políticas RLS; 36 funciones; RLS idéntico al origen (solo `schema_migrations` sin RLS, sin concesiones a roles de la app); concesiones clave restauradas; sin saldos negativos.
- Límites: restaurado en un PostgreSQL **18** local; la restauración en un servidor 17 (la versión de Supabase) o en un proyecto Supabase nuevo no se ha probado. Limpieza informada por el usuario (salida real): `drop database hc_restore_test` ⇒ DROP DATABASE y servidor local detenido (`-Action stop`). El archivo `.dump` y su manifiesto siguen en `D:\\Respaldos\\HubCircular`.
- Pendiente: prueba manual de `/usuarios` contra Supabase; confirmar las copias del plan de Supabase; decidir el proveedor de identidad (`docs/23` §3 y §5).

### 2026-11-19 — Prueba manual de /usuarios, copias de Supabase y proveedor de identidad (informado por el usuario)
- Agente / rama / commit: usuario + Claude (Cowork) · `main`.
- Prueba manual de `/usuarios` contra Supabase (informada por el usuario): «funciona bien tanto el crear como desactivar usuario». **Sin capturas ni detalle por paso**; no se informó explícitamente la clave temporal con cambio obligatorio ni el bloqueo posterior al desactivar, de modo que queda como informada en términos generales.
- Copias de Supabase (informado por el usuario): **el proyecto no tiene copias automáticas porque está en el plan gratuito**. Por tanto el único respaldo es el lógico de `db:backup` (`docs/24`); ver la rutina propuesta allí.
- Proveedor de identidad: el usuario se inclina por mantener **`AUTH_PROVIDER=local`** por ahora (decisión del usuario, no se cambió nada). Supabase Auth queda implementado pero **inactivo y sin probar contra el servicio real**.
- Próxima acción: Iteración 3 o decisiones con el Hub (H-01/H-05/H-07); antes de datos reales: HTTPS y rol `hc_login` al desplegar.

### 2026-11-19 — Iteración 3: tablero de indicadores, cobertura y «cero confirmado»
- Agente / rama / commit: Claude (Cowork) · `main` (commit al entregar).
- Objetivo: dashboard con KPI conciliados, filtros, tendencia semanal, CSV, calendarios de medición, cobertura y «cero confirmado». Alcance elegido por el usuario: todo junto; visible solo con sesión según ámbito (sin vista pública); valorización por fecha de despacho; gráficos SVG propios; días fijos de la semana; mismo día calendario programado; programa el administrador, cero lo confirman operador y administrador.
- Cambios y archivos: migración `0010_dashboard_coverage.sql`; `src/modules/indicators/*` (filtros, cobertura, CSV, semanas, consultas, servicio, exportaciones, esquema de calendarios); `src/components/indicators/weekly-chart.tsx`; pantallas `/dashboard`, `/dashboard/export` y `/calendarios`; permisos `indicators:read`, `schedule:manage`, `measurement:zero`; menú «Tablero» y «Calendarios» (el menú ahora envuelve en varias líneas); 8 códigos de error nuevos; `docs/25`, ADR-025 a ADR-027, `docs/03`, `docs/06`, `docs/07`, `docs/14`, README.
- Comandos y pruebas (resultados reales, Linux + PostgreSQL 16 local): `tsc --noEmit`, `eslint .` y `next build` sin errores; **Vitest 338/338** (28 archivos; 49 pruebas nuevas: 14 de conciliación SQL, 11 de calendarios/cobertura/cero, 8 de capa de aplicación, 16 unitarias); **Playwright 53/53** (9 nuevas, con axe-core). Mutaciones comprobadas y restauradas: sin excluir corregidos (5 pruebas fallan), sin ámbito en captación (2), sin filtro de origen en inventario (1), borde de día en UTC (1), cero sobre pesaje (1), sin guarda de pesaje del día (1), día local en UTC en cobertura (2). Camino 0009→0010 aplicado sobre una base local con datos; `db:check` y `db:check:app` sin errores. Revisión visual con capturas reales de `/dashboard` y `/calendarios`.
- Decisiones tomadas: ADR-025 (definiciones, cifras «como se conoce hoy», origen real por defecto), ADR-026 (calendarios versionados, cobertura derivada, cero confirmado; cierra H-04 y reemplaza `measurement_occurrences`), ADR-027 (SVG propio sin Recharts). H-06 resuelta: valorización por fecha de despacho.
- Riesgos, bloqueos y cambios no confirmados: **0010 NO aplicada en Supabase** (aplicar solo con aprobación: respaldo → dry-run → `CONFIRM_REMOTE_MIGRATION` → `db:check`; `docs/25` §6); sin pesajes reales (cifras probadas con fixtures/DEMO); sin probar en Supabase, Windows nativo ni desplegado; H-01/H-05/H-07 siguen abiertas y condicionan las definiciones; una corrección posterior cambia períodos ya consultados.
- Próxima acción: el usuario decide si aplica 0010 (con respaldo previo) y prueba `/dashboard` y `/calendarios`; decisiones H-01/H-05/H-07 con el Hub; luego Iteración 4 (IoT simulado).

## Plantilla para nuevos avances
### AAAA-MM-DD — [Título]
- Agente / rama / commit:
- Objetivo:
- Cambios y archivos:
- Comandos y pruebas (resultados reales):
- Decisiones tomadas:
- Riesgos, bloqueos y cambios no confirmados:
- Próxima acción:
