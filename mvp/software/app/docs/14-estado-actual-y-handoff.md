# 14 · Estado real y traspaso entre agentes

**Corte de información:** 18 de noviembre de 2026, Chile. Este documento distingue hechos verificados, pendientes y supuestos. Actualizar fecha cuando cambie el estado.

## Software web
**Corte 2026-11-19 (Iteración 3 — tablero, cobertura y «cero confirmado», solo PostgreSQL local — ver `docs/25`):**
- **Hecho y verificado en Linux + PostgreSQL 16 local:** migración **0010** (calendarios de medición, «cero confirmado», funciones de KPI/inventario/cobertura), `/dashboard` (tarjetas, cierre contable, gráfico semanal SVG propio con tabla, cobertura por contenedor, movimientos de soporte, filtros, aviso DEMO/período incompleto), `/dashboard/export` (CSV de kpis, pesajes, movimientos y cobertura) y `/calendarios` (programar/terminar: administrador; confirmar cero: administrador y operador en su zona). ADR-025 a ADR-027. **Vitest 338/338 (28 archivos), Playwright 53/53** (44 previas + 9 de `dashboard.spec.ts`, con axe-core), tsc/eslint/build limpios; conciliación contra libro conocido y pruebas de mutación (`docs/25` §5).
- **Pendiente / no verificado:** la migración **0010 NO está aplicada en Supabase** (aplicar solo con aprobación del usuario: respaldo previo → dry-run → `CONFIRM_REMOTE_MIGRATION` → `db:check`; `docs/25` §6); no hay pesajes reales, por lo que las cifras probadas son de fixtures y DEMO; Windows nativo; despliegue/HTTPS.
- **Siguen abiertas:** H-01, H-05 y H-07 (con valores provisionales). El tablero informa qué indicadores dependen de ellas (inventario/ubicación ← H-01; valorización ← H-05; captación por material ← H-07). Extras aplazados sin cambios; sin IoT; el PDF oficial es interno.
- **Estado por iteración de `docs/07`:** Iter. 0 ✅ · Iter. 1 ✅ · Iter. 2 ✅ · refuerzo previo a datos reales ✅ (local) · Iter. 3 ✅ (local; 0010 sin aplicar en Supabase) · Iter. 4–6 ⏳.

**Corte 2026-11-19 (seguridad previa a datos reales, solo PostgreSQL local — ver `docs/23`, `docs/24`):**
- **Hecho y verificado en Linux + PostgreSQL 16 local:** cabeceras CSP (nonce) y HSTS condicionado a HTTPS (ADR-022); `/usuarios` y `/cuenta/clave` con clave temporal mostrada una vez y cambio obligatorio (migración 0008, ADR-023); `db:backup` y `db:restore-check` con restauración real comprobada (ADR-024, `docs/24`); Supabase Auth como segundo proveedor, `AUTH_PROVIDER=local|supabase` (migración 0009, ADR-021). Vitest 288/288, Playwright 44/44 (5 en modo Supabase contra un GoTrue **simulado**), tsc/eslint/build limpios.
- **Pendiente / no verificado:** las migraciones **0008 y 0009 ya están aplicadas en Supabase** (ejecutadas por el usuario el 2026-11-19; `db:check` sin errores, 9 migraciones, 0 pendientes; `docs/15`), pero el usuario informó que `/usuarios` (crear y desactivar) **funciona bien en Supabase** (sin detalle por paso), que el plan es gratuito y **sin copias automáticas** (el único respaldo es `db:backup`) y que por ahora prefiere el proveedor **local**; **no consta** respaldo previo a esa migración ni la prueba manual de `/usuarios` allí; el **primer respaldo real** de Supabase se hizo después (2026-11-19, 77 filas, 9 migraciones) y su **restauración real en un PostgreSQL 18 local salió OK** con filas, migraciones, políticas y RLS idénticos (`docs/15`); Supabase Auth **no probado contra el servicio real**; respaldo, restauración y cabeceras sin probar en Supabase/producción ni en Windows nativo; confirmar qué copias incluye el plan de Supabase. Lista de control en `docs/23` §5.
- **Sigue igual:** H-01, H-05 y H-07 abiertas con valores provisionales; extras aplazados; sin IoT; el PDF oficial es interno.
- **Estado por iteración de `docs/07`:** Iter. 0 ✅ · Iter. 1 ✅ · Iter. 2 ✅ · refuerzo previo a datos reales ✅ (local) · Iter. 3–6 ⏳.

**Corte 2026-11-18 (Iteración 2 — Trazabilidad):**
- **Hecho y verificado en PostgreSQL local (ver `docs/22`):** migración 0007 (movimientos, destinos, evidencia por referencia de texto, verificaciones); los cinco movimientos con un único flujo transaccional, bloqueo del lote, saldo nunca negativo, idempotencia, correcciones sin borrado, auditoría y RLS; pantallas `/retiros`, `/destinos` y trazabilidad en el detalle del lote. **225 pruebas Vitest en 18 archivos y 31 E2E pasan** (incl. concurrencia con prueba de mutación y axe-core). Casos de aceptación 3, 4, 6 y 8 de `docs/01` cubiertos.
- **Pendiente / no verificado:** la migración 0007 **ya está aplicada en Supabase** (ejecutada por el usuario; `db:check` sin errores), destinos DEMO cargados y movimientos, evidencia y verificación probados a mano por el usuario en Supabase (informado como correcto, sin detalle por paso); Windows nativo; Supabase Auth; API REST de movimientos (no definida en `docs/04`); carga de archivos de evidencia (descartada por el usuario).
- **Decisiones abiertas con valor provisional:** H-01 (ubicación = zona), H-05 (valorización = verificación sin movimiento), H-07 (sin excepciones de material). Ver ADR-019/020 y `docs/21`.
- **Estado por iteración de `docs/07`:** Iter. 0 ✅ · Iter. 1 ✅ · Iter. 2 ✅ (local) · Iter. 3–6 ⏳.

**Corte 2026-11-18 (Iteración 1.5 — Windows, Supabase, Git, validación):**
- **Hecho y verificado (Linux + PostgreSQL 16, ver `docs/20`):** capa de conexión compatible con el pooler de Supabase (`SET LOCAL ROLE`, TLS configurable), migración 0006 de endurecimiento, `npm run db:check` (solo lectura), candados para destinos remotos, guardas que impiden pruebas destructivas fuera de PostgreSQL local, defensa de origen en la API, checksums de migración robustos ante CRLF, `docker-compose.yml` eliminado. **167 pruebas Vitest y 20 E2E pasan; `npm audit`: 0 vulnerabilidades.** Git local inicializado (sin remoto).
- **Pendiente / no verificado:** validación funcional en Supabase (migraciones 0001–0006 **ya aplicadas** el 2026-11-18 en el proyecto de desarrollo; falta seed DEMO opcional y la lista de `docs/20` §8); `npm run dev`, typecheck, lint y pruebas en Windows (la instalación y los scripts de BD sí corrieron en Windows); Supabase Auth (ADR-014: decidido, no implementado); CSP/HSTS, gestión de usuarios y copias de seguridad antes de datos reales. El rol `hc_login` ya está en uso en Supabase (informado por el usuario).
- **Extras:** incorporado solo en DEMO el contenedor global mixto (ADR-018, a petición del usuario). Siguen aplazados: versión real, alcance del piloto con globales, despachos sin destino y excepción de material (`docs/11`).
- **Decisiones abiertas con análisis** (`docs/21`): H-01 ubicación, H-05 valorización, H-07 excepciones de material. Ninguna está resuelta.

**Corte 2026-11-18 (fin de la sesión de Fase 1):**
- **Implementado y probado (ver `docs/15`):** proyecto Next.js 16 + TypeScript + Tailwind; 5 migraciones SQL (identidad, catálogo, pesajes/lotes/saldos, funciones de autenticación, RLS y privilegios); autenticación local con roles administrador/operador/lector y ámbito por zona; registro manual de pesaje con validación en servidor, lote atómico, idempotencia y auditoría; historial con filtros (fecha, material, zona, usuario, referencia) y paginación; detalle de pesaje y de lote (saldo por ubicación); listado de contenedores; `POST/GET /api/weighings`; datos semilla DEMO etiquetados; 134 pruebas unitarias/integración + 20 E2E (incl. accesibilidad).
- **No existía aún (a esa fecha):** administración de catálogo y usuarios por interfaz, movimientos/retiros/destinos/evidencias (iteración 2), dashboard y CSV (iteración 3), telemetría/IoT y simulador (iteración 4), reglas de oportunidad (iteración 5), calendario/cobertura, imágenes QR.
- **No verificado:** ejecución en Windows, contra Supabase, ni despliegue alguno. Sin proyecto Supabase, hosting ni credenciales (sin cambios).
- **Estado por iteración de `docs/07`:** Iter. 0 ✅ · Iter. 1 ✅ (con las limitaciones anteriores) · Iter. 2–6 ⏳.

### Cómo continuar
1. Leer `docs/17` (auditoría y trazabilidad), `docs/18` (decisiones) y la última entrada de `docs/15`.
2. `README.md` → «Puesta en marcha» y `docs/19`. Requiere Node ≥ 20.9 y PostgreSQL ≥ 14 (la base de Supabase; para pruebas destructivas, un PostgreSQL local; **sin Docker**).
3. Verificar el punto de partida: `npm run verify` (tipos, lint, pruebas, build) y `npm run test:e2e`.
4. Antes de la Iteración 2: conectar y validar Supabase (`docs/19` y lista de `docs/20`, sección 8).
5. Antes de seguir: aplicar 0007 en Supabase con aprobación del usuario (`docs/22`, sección 5) y repasar con el Hub H-01, H-05 y H-07 (`docs/11`, `docs/21`).
6. Si se van a usar datos reales: seguir primero `docs/23` §5 (respaldo, aplicar 0008/0009 con aprobación, decidir proveedor de identidad, HTTPS).
7. Aplicar 0010 en Supabase solo con aprobación del usuario (`docs/25` §6). Próxima tarea recomendada: Iteración 4 (IoT **simulado**; la telemetría nunca crea captaciones) o, antes, las decisiones H-01/H-05/H-07 con el Hub, de las que dependen las definiciones del tablero.

## Hardware
| Componente | Estado conocido | Precaución |
|---|---|---|
| ESP32-WROOM-32D | Recibido. Sketch de prueba cargado por COM3; Monitor serie imprime `HubCircular funcionando correctamente` repetidamente. | No implica Wi-Fi ni sensores funcionales. |
| Driver USB CP2102 / IDE | Windows detecta puerto COM3; Arduino ESP32 3.3.13 reconocible tras ajustar `directories.data` hacia D:. | COM puede variar de PC/puerto. |
| HX711 | Recibido, placa con pines no soldados según fotos. | Requiere conexiones fiables; sin prueba eléctrica hasta ahora. |
| Celda de carga comercial 50 kg | Recibida, 3 cables (rojo, negro, blanco), sin marcación visible. | **No se ha medido su resistencia ni confirmado pinout o capacidad real**; probablemente medio puente, no cuatro cables. |
| Resistencias 1 kΩ | Compradas el 18-11-2026; retiro anunciado para el 19-11-2026. | Tipo, tolerancia, valores reales y compatibilidad pendientes de confirmar. |
| Sensor ultrasónico | Previsto en kit / proyecto. | No conectado ni probado. Cuidar voltaje de ECHO hacia ESP32. |
| Plataforma mecánica 50 kg | No hay montaje validado. | No probar con 50 kg sin verificación estructural y metrológica. |

## Decisiones firmes y supuestos
- **Objetivo de capacidad de pesaje: 50 kg**, definido por el equipo; no reemplazar silenciosamente por una celda de 20 kg.
- El peso IoT requiere **calibración y verificación independiente**. No prometer precisión por la capacidad nominal ni por usar dos resistencias.
- El sensor de tres cables podría requerir completar el puente con resistencias emparejadas u otro medio puente; confirmar topología y pinout antes de proporcionar cableado físico.
- El software del MVP debe poder funcionar con mediciones manuales verificables, aun sin hardware completamente integrado.

## Siguiente trabajo recomendado
1. Abrir el proyecto en Claude Code o Codex y ejecutar la auditoría/plan del prompt maestro.
2. Inicializar repositorio Git **privado** si incluye documentación de uso interno, o separar las referencias restringidas antes de hacerlo público.
3. Crear la vertical manual con validaciones, RLS y pruebas.
4. En otro flujo de trabajo de hardware, comprobar el HX711, caracterizar celda de tres cables y verificar esquema antes de energizar.
5. Completar integración API IoT con simulador; hardware real únicamente después de calibración.

## Handoff al cambiar de agente
Escribir en `docs/15-registro-de-avances.md`: qué se hizo, comandos y tests ejecutados, archivos afectados, bloqueos, cambios no confirmados y tarea siguiente. Verificar `git status` en la nueva sesión.
