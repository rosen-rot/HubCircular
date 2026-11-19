# HubCircular · Paquete V2 para Claude Code y Codex

**Proyecto:** Desafío 04, Capstone Intermedio 2026, Universidad Mayor; contraparte indicada en documentación original: Hub Providencia / Municipalidad de Providencia.

**Objetivo:** desarrollar una plataforma web de gestión, trazabilidad y análisis de residuos, preparada para el prototipo físico basado en ESP32.

**Estado del software (2026-11-18):** Fase 1 implementada (autenticación con roles, registro manual de pesajes con lote atómico, historial, lotes y contenedores) y probada; ver «Puesta en marcha» y `docs/14-estado-actual-y-handoff.md`. Iteración 2 (trazabilidad: movimientos, destinos, evidencia por texto y verificación) implementada y probada en PostgreSQL local (`docs/22`). Iteraciones 3–6 de `docs/07` pendientes. El paquete conserva además la documentación y referencias originales.

## Inicio rápido
1. Descomprime en una carpeta permanente de trabajo.
2. Abre **la carpeta raíz del proyecto** (`HubCircular`) en Claude Code (escritorio) o Codex.
3. Usa `PROMPT_MAESTRO_HUBCIRCULAR_V2.md`; Claude Code dispone de `CLAUDE.md` y Codex de `AGENTS.md`. Estos archivos apuntan a una misma guía, no a dos proyectos independientes.
4. Lee primero `docs/14-estado-actual-y-handoff.md` y `docs/15-registro-de-avances.md`; luego los requisitos, modelo de datos, API y plan de implementación.
5. Implementa primero registro **manual** de pesajes, lotes e inventario; telemetría IoT se simula hasta que el hardware esté validado.
6. Antes de publicar GitHub u otro repositorio, protege referencias internas (`referencias/`, especialmente PDF oficial), secretos y datos personales. Un repositorio **privado** es la opción conservadora mientras no haya autorización de publicación.

## Documentación principal
| Ruta | Uso |
|---|---|
| `PROMPT_MAESTRO_HUBCIRCULAR_V2.md` | Instrucciones completas y comunes para Claude Code y Codex |
| `AGENTS.md` | Entrada y reglas para Codex |
| `CLAUDE.md` | Entrada y reglas para Claude Code |
| `PROMPT_INICIAL_CODEX.md` | Prompt V1 original, conservado por compatibilidad |
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
| `docs/16-guia-claude-y-codex.md` | Cómo trabajar con ambas herramientas en el mismo repositorio |
| `docs/17-auditoria-documental.md` | Auditoría de Fase 0: hallazgos, riesgos y matriz de cobertura por requisito |
| `docs/18-decisiones-de-arquitectura.md` | Registro de decisiones (ADR) de la implementación |
| `docs/19-configuracion-windows-supabase.md` | Windows sin Docker y conexión segura a Supabase (sin secretos) |
| `docs/20-validacion-iteracion-1-5.md` | Evidencia y resultados de la Iteración 1.5 |
| `docs/21-analisis-decisiones-pendientes.md` | Análisis de H-01, H-05 y H-07 (decisiones **abiertas**) |
| `diseno/HubCircular_Dashboard_MVP.png` | Maqueta conceptual, no web construida |
| `referencias/HubCircular_Propuesta_Completa_Actualizada_2026.md` | Propuesta histórica conservada sin reescritura |
| `referencias/Fichas_Desafios_Capstone_2026.pdf` | Ficha oficial interna, **no publicar sin permiso** |

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
| `npm run db:reset` | **solo local**: elimina el esquema `hc`; se niega siempre a actuar sobre hosts no locales (incluido Supabase) |

Las pruebas de integración y E2E necesitan un PostgreSQL **local** con permiso para crear bases (`TEST_DATABASE_URL`); se niegan a ejecutarse contra cualquier host remoto, incluido Supabase. En Windows sin Docker: `scripts/windows/postgres-local.ps1` (ver `docs/19`, sección 5).

### Estructura del código
`db/migrations` (SQL versionado) · `db/seed` (datos DEMO) · `src/modules/{identity,catalog,weighing,inventory,movements}` (dominio por módulos, `docs/02`) · `src/lib` (BD, errores, tiempo) · `src/app` (rutas: `/login`, `/registro`, `/historial`, `/pesajes/[id]`, `/lotes/[id]`, `/retiros`, `/destinos`, `/contenedores`, `/api/weighings`) · `tests/{unit,integration,e2e}`.

## Estado real a 18-11-2026
- **Software web:** Fase 1 (Iteraciones 0 y 1 de `docs/07`) implementada y probada en un entorno Linux con PostgreSQL 16 (ver `docs/15`). Iteración 1.5: capa de conexión compatible con el pooler de Supabase, migración 0006, `db:check`, candados para destinos remotos y Git local; ver `docs/20`. Migraciones 0001–0006 aplicadas y validadas por el usuario en el proyecto Supabase de desarrollo (`docs/20`). Iteración 2 (movimientos, destinos, evidencia y verificación) probada en PostgreSQL local (`docs/22`); su migración 0007 **no** está aplicada en Supabase hasta que el usuario la apruebe. **No** probado en Windows nativo completo (solo `npm ci` y scripts de base de datos); **no** desplegado.
- ESP32-WROOM-32D: sketch de prueba subido y mensajes seriales comprobados.
- HX711: recibido; conexión y lectura **pendientes**, pines por soldar según evidencia disponible.
- Celda de carga: vendida como 50 kg, **tres cables**, probablemente medio puente; pinout y capacidad real sin medir, montaje no calibrado.
- Resistencias 1 kΩ: compradas y pendientes de retiro al día siguiente; integración y valores sin comprobar.
- Ultrasonido, Wi-Fi/IoT y API IoT: **sin pruebas funcionales confirmadas** (la API IoT es solo el contrato borrador de `docs/04`).

**Prioridad de interpretación:** ficha oficial → decisiones confirmadas/estado actual → documentación técnica → propuesta histórica → valores de ejemplo. Los datos simulados jamás equivalen a mediciones reales.
