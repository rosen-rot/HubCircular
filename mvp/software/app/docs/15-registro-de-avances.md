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

## Plantilla para nuevos avances
### AAAA-MM-DD — [Título]
- Agente / rama / commit:
- Objetivo:
- Cambios y archivos:
- Comandos y pruebas (resultados reales):
- Decisiones tomadas:
- Riesgos, bloqueos y cambios no confirmados:
- Próxima acción:
