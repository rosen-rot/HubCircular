# 14 · Estado real y traspaso entre agentes

**Corte de información:** 18 de noviembre de 2026, Chile. Este documento distingue hechos verificados, pendientes y supuestos. Actualizar fecha cuando cambie el estado.

## Software web
**Corte 2026-11-18 (Iteración 1.5 — Windows, Supabase, Git, validación):**
- **Hecho y verificado (Linux + PostgreSQL 16, ver `docs/20`):** capa de conexión compatible con el pooler de Supabase (`SET LOCAL ROLE`, TLS configurable), migración 0006 de endurecimiento, `npm run db:check` (solo lectura), candados para destinos remotos, guardas que impiden pruebas destructivas fuera de PostgreSQL local, defensa de origen en la API, checksums de migración robustos ante CRLF, `docker-compose.yml` eliminado. **167 pruebas Vitest y 20 E2E pasan; `npm audit`: 0 vulnerabilidades.** Git local inicializado (sin remoto).
- **Pendiente / no verificado:** validación funcional en Supabase (migraciones 0001–0006 **ya aplicadas** el 2026-11-18 en el proyecto de desarrollo; falta seed DEMO opcional y la lista de `docs/20` §8); `npm run dev`, typecheck, lint y pruebas en Windows (la instalación y los scripts de BD sí corrieron en Windows); Supabase Auth (ADR-014: decidido, no implementado); rol `hc_login`, CSP/HSTS y gestión de usuarios antes de datos reales.
- **Decisiones abiertas con análisis** (`docs/21`): H-01 ubicación, H-05 valorización, H-07 excepciones de material. Ninguna está resuelta.

**Corte 2026-11-18 (fin de la sesión de Fase 1):**
- **Implementado y probado (ver `docs/15`):** proyecto Next.js 16 + TypeScript + Tailwind; 5 migraciones SQL (identidad, catálogo, pesajes/lotes/saldos, funciones de autenticación, RLS y privilegios); autenticación local con roles administrador/operador/lector y ámbito por zona; registro manual de pesaje con validación en servidor, lote atómico, idempotencia y auditoría; historial con filtros (fecha, material, zona, usuario, referencia) y paginación; detalle de pesaje y de lote (saldo por ubicación); listado de contenedores; `POST/GET /api/weighings`; datos semilla DEMO etiquetados; 134 pruebas unitarias/integración + 20 E2E (incl. accesibilidad).
- **No existe aún:** administración de catálogo y usuarios por interfaz, movimientos/retiros/destinos/evidencias (iteración 2), dashboard y CSV (iteración 3), telemetría/IoT y simulador (iteración 4), reglas de oportunidad (iteración 5), calendario/cobertura, imágenes QR.
- **No verificado:** ejecución en Windows, contra Supabase, ni despliegue alguno. Sin proyecto Supabase, hosting ni credenciales (sin cambios).
- **Estado por iteración de `docs/07`:** Iter. 0 ✅ · Iter. 1 ✅ (con las limitaciones anteriores) · Iter. 2–6 ⏳.

### Cómo continuar
1. Leer `docs/17` (auditoría y trazabilidad), `docs/18` (decisiones) y la última entrada de `docs/15`.
2. `README.md` → «Puesta en marcha» y `docs/19`. Requiere Node ≥ 20.9 y PostgreSQL ≥ 14 (la base de Supabase; para pruebas destructivas, un PostgreSQL local; **sin Docker**).
3. Verificar el punto de partida: `npm run verify` (tipos, lint, pruebas, build) y `npm run test:e2e`.
4. Antes de la Iteración 2: conectar y validar Supabase (`docs/19` y lista de `docs/20`, sección 8).
5. Próxima tarea recomendada: **Iteración 2 — Trazabilidad** (`docs/07`): tabla `movements`, función transaccional de traslado/despacho/rechazo/reutilización/ajuste con `FOR UPDATE` sobre `batch_location_balances`, destinos, evidencias, correcciones auditadas, y la **prueba de concurrencia de dos retiros simultáneos**. Antes, resolver con el Hub las decisiones H-01, H-05 y H-07 (`docs/11`).

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
