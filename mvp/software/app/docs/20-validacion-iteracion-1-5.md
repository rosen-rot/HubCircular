# 20 · Validación de la Iteración 1.5

Fecha: 2026-11-18. Este documento separa **lo verificado con evidencia**, **lo que quedó pendiente** y **por qué**. No contiene secretos.

## 1. Entorno de verificación

| Elemento | Valor |
|---|---|
| Dónde se ejecutó | Entorno de trabajo en la nube (Linux), **no** el Windows del usuario |
| Node / npm | 22.23.5 / 10.9.9 |
| Next.js | 16.4.6 |
| PostgreSQL | 16.15 local, puerto 54329, creado para la sesión sin Docker |
| Equipo del usuario | Windows x64 (Electron/Node 24 de la app de escritorio). El shell remoto disponible allí es una **VM Linux**, no PowerShell; no se puede ejecutar Node/Git nativos de Windows desde la sesión |
| Proyecto Supabase | Conectado **después**, por el usuario desde su PowerShell (Windows, Node 24.13, npm 11.6, Git 2.53); `.env.local` creado por él, sin compartir credenciales |

## 2. Resultados de pruebas (cifras exactas)

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores, 0 advertencias |
| `npm test` (Vitest) | ✅ **15 archivos, 167 pruebas: 167 pasan, 0 fallan, 0 omitidas** |
| — unitarias | 85 (units 29, identity 17, db-config 13, time 8, schema 7, origin 6, migrator 3, refs 2) |
| — integración (PostgreSQL real) | 82 (weighing 32, queries 14, database 10, app-role 8, rls 8, auth 7, hardening 3) |
| `npm run test:e2e` (build de producción + Playwright/Chromium + axe) | ✅ **20 pasan, 0 fallan, 0 omitidas** |
| `npm audit` (con y sin dependencias de desarrollo) | ✅ 0 vulnerabilidades |
| Línea base antes de cambiar código (misma sesión) | 134/134 Vitest (10 archivos) |

Pruebas nuevas de esta iteración (33): `db-config` (13: parseo de destino, detección Supabase/pooler, TLS, no filtrar claves, `assertLocalOnly`), `origin` (6), `migrator` (3: checksum estable ante CRLF, orden, numeración sin huecos), `app-role` (8: la app conectada **como `postgres` sin opción de arranque** baja a `hc_app` con `SET LOCAL ROLE`, no se filtra entre transacciones del pool, RLS por rol y zona, registro idempotente, sin escritura directa, autenticación local) y `hardening` (3: 0006 retira privilegios de `anon`/`authenticated` concedidos tras 0005 como lo haría Supabase, es idempotente y falla si el rol no es miembro de `hc_app`).

Observación del E2E: al terminar aparece «terminating connection due to administrator command» en el servidor de prueba; ocurre porque el teardown elimina la base `hc_e2e` con conexiones abiertas, no afecta al resultado.

Comprobaciones de candados ejecutadas a mano (sin conexión: se rechazan antes de conectar): `db:migrate`, `db:seed` y `db:reset` contra un host de Supabase de ejemplo; `db:migrate` por el puerto 6543.

## 3. Verificación de las 15 comprobaciones funcionales en `localhost:3000`

**No se pudo ejecutar sobre Windows ni sobre `localhost:3000` del usuario.** Lo que sí se verificó, en Linux, con la compilación de producción en el puerto 3100 y una base local: login/logout y redirección segura, cookie HttpOnly/SameSite, registro manual con neto en vivo y validaciones, doble envío sin duplicados, QR (`?container=`), contrato `POST /api/weighings`, aislamiento de operador por zona, rol lector sólo lectura, filtros del historial y estados vacíos, y accesibilidad (4 pantallas, 0 violaciones serias o críticas). Equivale a las 20 pruebas E2E. La repetición manual en Windows queda a cargo del usuario (`docs/19`).

## 4. Base de datos: migraciones y estado

| Destino | Estado |
|---|---|
| PostgreSQL local de pruebas (Linux) | Migraciones **0001–0006 aplicadas y comprobadas** con `db:check` (sin errores): `SET LOCAL ROLE hc_app` funciona, RLS en las 13 tablas de negocio de `hc` (más `schema_migrations`, tabla de control), `anon`/`authenticated` sin privilegios, 0 migraciones pendientes. Seed DEMO cargado. |
| **Supabase «HubCircular»** (proyecto de desarrollo, PostgreSQL 17.11, pooler de sesión sa-east-1) | **Migraciones 0001–0006 aplicadas el 2026-11-18** por el usuario, con su aprobación explícita y `CONFIRM_REMOTE_MIGRATION`. `db:check` posterior (salida pegada por el usuario) sin errores: TLS desde el equipo OK, `SET LOCAL ROLE hc_app` OK, RLS en todas las tablas de `hc`, `anon`/`authenticated` sin privilegios, 0 pendientes; esquemas ajenos (`auth`, `storage`, `realtime`, `vault`…) intactos y `public` con 0 tablas. Pesajes: 0 reales, 0 DEMO. **Aún sin validar** en Supabase: seed DEMO, persistencia, roles/ámbitos e idempotencia (lista de la sección 8). |

Cambios a la base introducidos por la iteración: **solo** la migración nueva `0006_managed_postgres_hardening.sql` (no se editó ninguna ya existente; los checksums de 0001–0005 no cambian).

## 5. Auditoría de seguridad

| Hallazgo | Acción |
|---|---|
| La app dependía de la opción de arranque `-c role=` (el pooler de Supabase en modo transacción no la respeta ⇒ habría conectado con el rol privilegiado) | **Corregido**: `SET LOCAL ROLE` por transacción (ADR-015), con prueba |
| Sin TLS configurable hacia hosts remotos | **Corregido**: `DB_SSL` (remoto = `require` por defecto) |
| `db:reset` permitía `FORCE_RESET=true` sobre hosts remotos | **Corregido**: se niega siempre fuera de local |
| Migrar/sembrar un host remoto no exigía confirmación | **Corregido**: `CONFIRM_REMOTE_MIGRATION` / `CONFIRM_REMOTE_SEED` con el host exacto; `--dry-run` |
| Migrar por el pooler de transacción (6543) habría usado un advisory lock de sesión poco fiable | **Corregido**: rechazo explícito |
| Pruebas destructivas podían apuntar a cualquier `TEST_DATABASE_URL` | **Corregido**: guardas en integración, E2E, `playwright.config.ts` y teardown |
| `anon`/`authenticated`/PUBLIC podrían heredar privilegios por defecto de Supabase sobre `hc` | **Corregido** en 0006 y detectable con `db:check` |
| `Content-Type` del API aceptaba `text/plain; x=application/json`; sin comprobación de `Origin` | **Corregido** (`src/lib/origin.ts`); SameSite=Lax y la cabecera `Idempotency-Key` ya mitigaban |
| Checksums de migración sensibles a CRLF en Windows | **Corregido** (ADR-017) |
| Búsqueda de secretos en el código y los documentos (`service_role`, `NEXT_PUBLIC_*`, JWT, cadenas con clave) | Sin hallazgos (solo datos ficticios en pruebas) |
| `.gitignore` | Excluye `.env*` (con excepción de `.env.example`), claves/certificados, dependencias, builds, `*.zip` y `referencias/*.pdf`; verificado con `git status --ignored` |
| Conexión como `postgres` + `SET LOCAL ROLE` permite `RESET ROLE` ante una inyección SQL hipotética | **Riesgo residual documentado**; mitigación: rol `hc_login` (`docs/19`), verificado en PostgreSQL local, no en Supabase |
| Sin CSP/HSTS; bloqueo de intentos solo por cuenta; sin UI de gestión de usuarios | **Pendiente** (sin cambios respecto de Fase 1) |

## 6. Git

Repositorio local inicializado en la carpeta del proyecto, rama `main`, **sin remoto** (no se publicó nada ni se conectó GitHub). Dos commits: «Iteración 1» y «Iteración 1.5». La autoría local se fijó como «Claude (Cowork)» `<noreply@anthropic.com>`; puede cambiarse con `git config user.name` / `user.email` y, si se desea, reescribir con `git commit --amend --reset-author` antes de compartir el repositorio.

## 7. Pendiente y bloqueos

| Pendiente | Bloqueo / quién |
|---|---|
| ~~Conexión y migración en Supabase~~ | **Hecho** (ver sección 4) |
| Validación en Supabase de persistencia, roles y ámbitos, idempotencia, saldos y separación DEMO/real | Después de migrar; lista en la sección 8 |
| Ejecución en Windows nativo (`npm ci`, `dev`, `localhost:3000`, scripts `.ps1`) | Solo el usuario; el asistente no tiene PowerShell |
| Pruebas de integración/E2E en Windows | Requiere PostgreSQL local portable (`docs/19`, sección 5) |
| Supabase Auth | Decisión tomada (ADR-014), implementación no iniciada |
| Rol `hc_login` en Supabase, CSP/HSTS, UI de usuarios | Antes de datos reales |

## 8. Lista de validación a ejecutar tras migrar en Supabase (no destructiva)

1. `npm run db:check`: sin errores; referencia del proyecto correcta; 0 migraciones pendientes; RLS en todas las tablas; sin privilegios de `anon`/`authenticated`.
2. (Opcional, proyecto de desarrollo) `db:seed` con `CONFIRM_REMOTE_SEED`; iniciar sesión con los tres usuarios DEMO.
3. Como operador (Cowork DEMO): registrar 4,250 kg bruto y 0,350 kg de tara ⇒ neto 3,900 kg, un lote; recargar la página: el registro persiste.
4. Reintentar el mismo envío (doble clic o recarga): sigue habiendo **un** pesaje y **un** lote.
5. Operador no ve Laboratorio DEMO; lector no puede registrar; administrador ve ambas zonas.
6. `db:check` posterior: pesajes DEMO = 1 (más los previos), reales = 0.
7. Panel de Supabase → API → Exposed schemas: `hc` ausente.
