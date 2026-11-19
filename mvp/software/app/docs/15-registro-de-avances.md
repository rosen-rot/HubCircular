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

## Plantilla para nuevos avances
### AAAA-MM-DD — [Título]
- Agente / rama / commit:
- Objetivo:
- Cambios y archivos:
- Comandos y pruebas (resultados reales):
- Decisiones tomadas:
- Riesgos, bloqueos y cambios no confirmados:
- Próxima acción:
