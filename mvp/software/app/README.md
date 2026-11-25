# HubCircular · Plataforma web (MVP de software)

**Proyecto:** Desafío 04, Capstone Intermedio 2026, Universidad Mayor; contraparte indicada en documentación original: Hub Providencia / Municipalidad de Providencia.

**Objetivo:** desarrollar una plataforma web de gestión, trazabilidad y análisis de residuos, preparada para el prototipo físico basado en ESP32.

> **Ubicación en el repositorio.** Esta carpeta (`mvp/software/app/`) contiene el código fuente de la plataforma. La descripción de diseño del MVP de software está en los documentos de `mvp/software/` (carpeta superior). El historial de commits del desarrollo se conserva completo en Git.

> **Autoría.** Software desarrollado por **Carlos Concha** ([@Krl-oz](https://github.com/Krl-oz)), con asistencia de Claude Code.

**Estado del software (2026-11-18):** Fase 1 implementada (autenticación con roles, registro manual de pesajes con lote atómico, historial, lotes y contenedores) y probada; ver «Puesta en marcha» y `docs/14-estado-actual-y-handoff.md`. Iteración 2 (trazabilidad: movimientos, destinos, evidencia por texto y verificación) implementada y probada en PostgreSQL local (`docs/22`). Antes de datos reales (2026-11-19; probado en PostgreSQL local, migraciones 0008/0009 ya aplicadas en Supabase): cabeceras CSP/HSTS, gestión de usuarios por interfaz con clave temporal, respaldo y restauración, y Supabase Auth como segundo proveedor (`docs/23`, `docs/24`). Iteración 3 (tablero de indicadores, cobertura de medición y «cero confirmado»; `docs/25`) implementada y probada en PostgreSQL local, con su migración 0010 ya aplicada en Supabase por el usuario (19-11-2026) y probadas a mano por el usuario allí; luego se agregaron nombres más claros, iconos (i) y la página `/ayuda` con glosario (`docs/25` §8). Después se agregó «Descargar datos» (Excel con 4 hojas o una tabla en CSV; `docs/25` §9). Luego se rediseñó la interfaz según las imágenes del Hub (menú lateral, Inicio, Lotes y Movimientos con panel de detalle; `docs/26`). Después se implementó el núcleo de la Iteración 4 (ingesta IoT **simulada**: `POST /api/iot/v1/readings`, `/dispositivos` y `npm run iot:simulate`; `docs/27`), probado solo en PostgreSQL local con su migración 0011 ya aplicada por el usuario en Supabase (24-11-2026) y el simulador ejecutado allí (53/53), pero sin pruebas con el ESP32 real. Iteraciones 5–6 de `docs/07` pendientes. El paquete conserva además la documentación y referencias originales.

## Inicio rápido
1. Lee primero `docs/14-estado-actual-y-handoff.md` y `docs/15-registro-de-avances.md`; luego los requisitos, modelo de datos, API y plan de implementación.
2. Para ejecutar la aplicación, sigue «Puesta en marcha (desarrollo local)» más abajo. Todos los comandos se ejecutan **dentro de esta carpeta** (`mvp/software/app/`).
3. El registro de pesajes es **manual**; la telemetría IoT se simula hasta que el hardware esté validado.
4. No subas secretos (`.env.local`), respaldos de base de datos ni material de uso interno del curso.

## Documentación principal
| Ruta | Uso |
|---|---|
| `docs/00-vision-y-alcance.md` | Visión, requisitos del MVP y fuera de alcance |
| `docs/01-requisitos-y-aceptacion.md` | Funciones, condiciones y aceptación |
| `docs/02-arquitectura.md` | Arquitectura propuesta |
| `docs/03-modelo-datos.md` | Modelo relacional e invariantes |
| `docs/04-contrato-api-iot.md` | API propuesta ESP32/backend |
| `docs/05-flujos-ui.md` | Flujos y permisos UX |
| `docs/06-indicadores.md` | Definición y fuentes de KPIs |
| `docs/07-plan-de-implementacion.md` | Fases, dependencias y Definition of Done |
| `docs/08-pruebas-y-seguridad.md` | Matriz QA y seguridad |
| `docs/09-simulador-iot.md` | Escenarios IoT simulados |
| `docs/10-protocolo-piloto.md` | Metodología de medición |
| `docs/11-decisiones-pendientes.md` | Cuestiones abiertas |
| `docs/12-glosario.md` | Terminología |
| `docs/13-historias-de-usuario.md` | Historias y prioridades |
| `docs/14-estado-actual-y-handoff.md` | **Estado verificado** y contexto para cambio de herramienta |
| `docs/15-registro-de-avances.md` | Bitácora única entre herramientas |
| `docs/17-auditoria-documental.md` | Auditoría de Fase 0: hallazgos, riesgos y matriz de cobertura por requisito |
| `docs/18-decisiones-de-arquitectura.md` | Registro de decisiones (ADR) de la implementación |
| `docs/19-configuracion-windows-supabase.md` | Windows sin Docker y conexión segura a Supabase (sin secretos) |
| `docs/20-validacion-iteracion-1-5.md` | Evidencia y resultados de la Iteración 1.5 |
| `docs/21-analisis-decisiones-pendientes.md` | Análisis de H-01, H-05 y H-07 (decisiones **abiertas**) |
| `docs/22-validacion-iteracion-2.md` | Evidencia y validación de la Iteración 2 (trazabilidad) |
| `docs/25-dashboard-y-cobertura-iteracion-3.md` | Iteración 3: tablero, definiciones de indicadores, calendarios, «cero confirmado», CSV y cómo aplicar 0010 |
| `docs/26-rediseno-de-la-plataforma.md` | Rediseño de la interfaz (imágenes del Hub): qué se construyó, qué no y por qué, y verificación |
| `docs/27-iteracion-4-ingesta-iot.md` | Iteración 4 (núcleo): ingesta IoT simulada, dispositivos, simulador, verificación, límites y cómo aplicarla/probarla |
| `docs/28-estado-del-sensor-y-llenado.md` | Estado del sensor y llenado (solo con capacidad) en Inicio y Contenedores; migración 0012 |
| `docs/29-iteracion-5-oportunidades-y-usabilidad.md` | Iteración 5: reglas de oportunidad de mejora, guía del operador y pauta de prueba con usuarios |
| `docs/23-seguridad-previa-a-datos-reales.md` | Cabeceras, usuarios, Supabase Auth y lista de control antes de datos reales |
| `docs/24-respaldos-y-restauracion.md` | Plan de respaldos, restauración y prueba de restauración |
| `diseno/HubCircular_Dashboard_MVP.png` | Maqueta conceptual, no web construida |

## Puesta en marcha (desarrollo local)

Requisitos: **Node.js ≥ 20.9** y un **PostgreSQL ≥ 14** (la base del proyecto Supabase «HubCircular» o una instalación local; **sin Docker**; la aplicación solo necesita `DATABASE_URL`). Guía completa para Windows y Supabase, sin secretos en el chat: `docs/19-configuracion-windows-supabase.md`.

```bash
npm ci
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local
# edite .env.local: DATABASE_URL (y MIGRATION_DATABASE_URL si el rol de la app no es el dueño del esquema)
npm run db:check                  # diagnóstico de SOLO LECTURA: destino, TLS, roles, RLS, migraciones
npm run db:migrate -- --dry-run   # qué migraciones faltan (no escribe)
npm run db:migrate                # aplica db/migrations (idempotente, con checksum); en un host remoto exige CONFIRM_REMOTE_MIGRATION=<host>
npm run db:seed                   # datos DEMO y 3 usuarios DEMO; si no define SEED_*_PASSWORD imprime claves aleatorias UNA vez
npm run dev                       # http://localhost:3000
```

Usuarios DEMO (rol, ámbito): `admin@demo.hubcircular.test` (administrador, todas las zonas), `operador@demo.hubcircular.test` (operador, solo «Cowork DEMO»), `lector@demo.hubcircular.test` (lector). **Todo dato sembrado está etiquetado DEMO y no representa al Hub ni mediciones reales.**

| Comando | Qué hace |
|---|---|
| `npm run verify` | typecheck + lint + pruebas unitarias/integración + build |
| `npm test` | Vitest (unitarias + integración contra PostgreSQL real; usa `TEST_DATABASE_URL`, por defecto `postgres://postgres@127.0.0.1:54329/postgres`; crea y borra bases efímeras `hc_test_*`) |
| `npm run test:e2e` | build + Playwright (Chromium) sobre la compilación de producción y la BD `hc_e2e`; requiere `npx playwright install chromium` la primera vez |
| `npm run db:check` | diagnóstico de solo lectura de la base destino (no imprime claves) |
| `npm run db:check:app` | comprueba la conexión que usa la app (`DATABASE_URL`): privilegios del rol y bajada a `hc_app` (solo lectura) |
| `npm run db:backup` | respaldo lógico del esquema `hc` hacia `BACKUP_DIR` (fuera del repo, sensible; `docs/24`) |
| `npm run db:restore-check -- <archivo.dump>` | prueba de restauración en una base **local vacía** y comparación con el manifiesto |
| `npm run iot:simulate -- --scenario=todos` | simulador IoT (docs/09, `docs/27` §7): envía lecturas **simuladas** a `/api/iot/v1/readings` con `IOT_DEVICE_TOKEN` de un dispositivo DEMO; `--list` muestra los escenarios |
| `npm run db:reset` | **solo local**: elimina el esquema `hc`; se niega siempre a actuar sobre hosts no locales (incluido Supabase) |

Las pruebas de integración y E2E necesitan un PostgreSQL **local** con permiso para crear bases (`TEST_DATABASE_URL`); se niegan a ejecutarse contra cualquier host remoto, incluido Supabase. En Windows sin Docker: `scripts/windows/postgres-local.ps1` (ver `docs/19`, sección 5).

### Estructura del código
`db/migrations` (SQL versionado) · `db/seed` (datos DEMO) · `src/modules/{identity,catalog,weighing,inventory,movements}` (dominio por módulos, `docs/02`) · `src/lib` (BD, errores, tiempo) · `src/app` (rutas: `/login`, `/registro`, `/historial`, `/pesajes/[id]`, `/lotes/[id]`, `/retiros`, `/destinos`, `/contenedores`, `/dispositivos`, `/api/weighings`, `/api/iot/v1/readings`) · `scripts` (migración, respaldo, simulador IoT) · `tests/{unit,integration,e2e}`.

## Estado real a 18-11-2026
- **Software web:** Fase 1 (Iteraciones 0 y 1 de `docs/07`) implementada y probada en un entorno Linux con PostgreSQL 16 (ver `docs/15`). Iteración 1.5: capa de conexión compatible con el pooler de Supabase, migración 0006, `db:check`, candados para destinos remotos y Git local; ver `docs/20`. Migraciones 0001–0006 aplicadas y validadas por el usuario en el proyecto Supabase de desarrollo (`docs/20`). Iteración 2 (movimientos, destinos, evidencia y verificación) probada en PostgreSQL local (`docs/22`); su migración 0007 ya fue aplicada por el usuario en Supabase (sin probar aún movimientos allí). **No** probado en Windows nativo completo (solo `npm ci` y scripts de base de datos); **no** desplegado. Antes de datos reales (`docs/23`): CSP/HSTS, `/usuarios`, respaldos y Supabase Auth implementados y probados solo en PostgreSQL local (Vitest 288/288, Playwright 44/44); las migraciones 0008 y 0009 ya fueron aplicadas en Supabase por el usuario (19-11-2026, `db:check` sin errores); Supabase Auth **no** se probó contra el servicio real.
- ESP32-WROOM-32D: sketch de prueba subido y mensajes seriales comprobados.
- HX711: recibido; conexión y lectura **pendientes**, pines por soldar según evidencia disponible.
- Celda de carga: vendida como 50 kg, **tres cables**, probablemente medio puente; pinout y capacidad real sin medir, montaje no calibrado.
- Resistencias 1 kΩ: compradas y pendientes de retiro al día siguiente; integración y valores sin comprobar.
- Ultrasonido y Wi-Fi: **sin pruebas funcionales confirmadas**. API IoT v1 (`docs/04`, `docs/27`): implementada y probada **solo con el simulador** (PostgreSQL local: 415 pruebas Vitest, 90 E2E; Supabase: migración 0011 aplicada el 24-11-2026 y simulador 53/53); sin pruebas con el ESP32 ni HTTPS.

**Prioridad de interpretación:** ficha oficial → decisiones confirmadas/estado actual → documentación técnica → propuesta histórica → valores de ejemplo. Los datos simulados jamás equivalen a mediciones reales.
