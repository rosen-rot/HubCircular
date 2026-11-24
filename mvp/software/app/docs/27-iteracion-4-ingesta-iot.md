# 27 · Iteración 4 — Ingesta de telemetría IoT simulada (núcleo)

**Estado (2026-11-24):** implementado y verificado en Linux + PostgreSQL 16 **local**; la migración **0011 fue aplicada en Supabase por el usuario el 2026-11-24** (con respaldo previo) y el simulador se ejecutó allí (§8). No se probó con el ESP32, el HX711 ni la celda: esta iteración valida el **software** con mensajes simulados. Contrato: `docs/04` v1.

## 1. Alcance acordado con el usuario
«Núcleo: ingesta + dispositivos + panel + simulador», con el contrato de `docs/04` v0.1 implementado **tal cual como v1** (si el hardware pide cambios, se versiona después). Quedan fuera (siguen aplazados): reglas de oportunidad/alertas (Iteración 5), uso de la telemetría en el tablero o en «Inicio» (relleno/ocupación), consulta `GET /api/devices/:id/latest`, edición de dispositivos y reasignación de contenedor.

## 2. Principio que no cambia
**La telemetría nunca crea captación.** Ninguna función de la migración 0011 escribe en `hc.weighings`, `hc.batches`, `hc.movements` ni en saldos; las lecturas (`hc.sensor_readings`) no entran en KPIs ni en la descarga de datos. Un peso estable repetido (30 × 1,5 kg) queda como 30 lecturas y 0 kg captados; una baja de peso no es un retiro (eso lo registra una persona como movimiento). Está probado a nivel de BD, de API, de simulador y de navegador (§5).

## 3. Qué se construyó
| Pieza | Detalle |
|---|---|
| Migración `0011_iot_ingest.sql` | Tablas `hc.devices` y `hc.sensor_readings`; funciones `admin_create_device`, `admin_rotate_device_token`, `admin_revoke_device` (solo administrador, auditadas) e `iot_ingest_reading` (autentica por token); RLS y privilegios por columna (el hash del token **no** es legible por `hc_app`). |
| Endpoint `POST /api/iot/v1/readings` | Bearer por dispositivo, esquema estricto (zod), tope de 2 KB, `Content-Type` JSON, idempotencia, respuestas del contrato. El proxy lo exime de la cookie de sesión (no es un navegador) pero **sí** le aplica CSP y cabeceras; el resto de `/api/*` sigue exigiendo cookie. |
| `/dispositivos` (menú «Dispositivos») | Todos los roles consultan según su zona; solo el administrador crea, **rota** y **revoca**. Muestra estado (En línea / Dato desactualizado / Sin datos aún / Revocado), último contacto, última lectura («—» si no hay valor, nunca «0»), conteos de 24 h (errores de sensor, relojes dudosos) y las últimas 15 lecturas. Insignia DEMO. |
| Simulador `npm run iot:simulate` | `scripts/iot-simulator.ts` + `scripts/iot-scenarios.ts`: los 10 escenarios de `docs/09`, semilla fija, `--count`, `--interval`, `--list`, interrupción limpia (Ctrl+C), reporte por escenario y código de salida 1 si algo difiere. |
| Glosario | Grupo «Sensores y dispositivos» (dispositivo, lectura de sensor, estado, credencial) con iconos (i). |

## 4. Reglas implementadas (resumen; detalle de la API en `docs/04`)
- **Credencial:** 256 bits aleatorios con prefijo `hcd_`; se muestra **una sola vez** al crear o rotar; en BD solo su SHA-256 y un prefijo de 8 caracteres para reconocerla. Rotar invalida la anterior al instante (y reactiva un dispositivo revocado); revocar no borra nada (los dispositivos y lecturas no se eliminan).
- **Autorización por registro del servidor:** el `deviceId` del JSON debe ser el del dueño del token (si no, 403).
- **Códigos:** 202 aceptada (`duplicate:true` en repetición idéntica) · 400 esquema/rango · 401 token ausente/inválido · 403 revocado, `deviceId` ajeno o simulador en dispositivo real · 409 mismo `messageId` con contenido distinto · 413/415 · 429 más de 60 lecturas nuevas por minuto por dispositivo (con `Retry-After`) · 503 si la BD no responde (con `Retry-After`).
- **Sin dato válido no se inventa un cero:** `sensor_error` solo admite valores nulos; `uncalibrated` no admite peso; los nulos se guardan como NULL.
- **Reloj del dispositivo:** si `measuredAt` está más de 5 min en el futuro o más de 7 días atrás se conserva lo informado, `clock_ok=false` y el momento efectivo es la hora del servidor (siempre se guarda `received_at`).
- **DEMO vs real:** el dispositivo hereda el origen de su contenedor. Los mensajes con firmware `sim-…` (los del simulador) **solo** se aceptan en dispositivos DEMO.
- **Estado «desactualizado»:** `ahora − último contacto > minutos de tolerancia` del dispositivo (15 por defecto, configurable al crearlo). El último contacto es el último mensaje **aceptado** (incluye duplicados). Los rechazos no se guardan.
- **Límite de frecuencia:** contado por dispositivo; los duplicados no se cuentan (no insertan). No hay límite para intentos con token inválido (con 256 bits no es adivinable); un límite por IP queda para el despliegue (§6).

## 5. Verificación (resultados reales, Linux + PostgreSQL 16 local)
- `tsc`, `eslint` y `next build` sin errores. **Vitest 415/415 (34 archivos)**: +50 (`tests/unit/iot.test.ts` 20; `tests/integration/iot.test.ts` 30).
- **Playwright 90/90** (+7 de `dispositivos.spec.ts` y `/dispositivos` agregado a las 14 pantallas con axe-core WCAG A/AA a 1280 y 390 px sin desborde horizontal): alta y credencial mostrada una vez (y ausente tras recargar), API sin cookie (202, duplicado, 409, 401, 400, 415, 403, CSP presente, otras APIs siguen con 401), panel en línea y «—» sin ceros inventados, «dato desactualizado» tras 2 h sin contacto y vuelta a «En línea», rotar y revocar, auditoría sin secretos, ámbito (el operador no ve el dispositivo de Laboratorio; operador y lector sin botones de administración).
- **Simulador por HTTP real** (`next start` + `npm run iot:simulate -- --scenario=todos`): 53 envíos, 53 como se esperaba; en la BD quedaron 49 lecturas y 0 pesajes, lotes y movimientos. Rechaza apuntar a un host remoto sin `--allow-remote`, no corre sin token y no imprime el token.
- `next dev` en 1280 y 390 px sobre `/dispositivos` (crear, copiar, abrir ayuda): 0 avisos de consola/hidratación.
- Casos de `docs/09` cubiertos: vacío, depósito, estable repetido, retiro parcial, duplicado, mensaje alterado, sensor inválido, sin conexión, fuera de rango y token revocado/desconocido (§ simulador).
- Pruebas de BD destacadas: privilegios (`hc_app` no lee `token_hash` ni escribe directo), solo anexado (UPDATE/DELETE/TRUNCATE → HC423), RLS por zona, 60/min → 429 y duplicado aún responde, reloj imposible, KPIs en cero tras 49 lecturas.

## 6. Límites y pendientes (no verificado)
- **No** se probó con el ESP32, el HX711, la celda ni Wi-Fi reales; el firmware no se tocó. Los valores/rangos (`distanceMm` ≤ 10 000, peso ≤ 1 000 kg, `fillPercent` 0–100) son provisionales y deben ajustarse con la calibración.
- **HTTPS/TLS** no se probó (solo http local); el ESP32 deberá verificar el certificado (`docs/04`, `docs/23`). Limitar por IP/ráfaga en el borde y definir el tamaño máximo definitivo queda para el despliegue.
- La telemetría **no** aparece aún en «Inicio»/Contenedores (llenado, estado del sensor): se verá en la revisión de diseño con datos simulados y requiere definir capacidad por contenedor.
- Sin retención/archivo de lecturas: a una lectura por minuto serían ~525 000 filas por dispositivo y año; definir política antes del piloto.
- Windows nativo: el simulador y los scripts de BD se ejecutaron en Windows (§8), pero `npm run verify` y las pruebas siguen sin correrse allí. La revisión visual de `/dispositivos` en Supabase no fue informada (ver §8).

## 7. Cómo aplicarla y probarla
**Local** (pruebas): se aplica sola en las pruebas; para la BD de desarrollo local use `npm run db:migrate`.

**Supabase (solo con aprobación del usuario; aplicado el 2026-11-24, ver §8):** respaldo previo (`npm run db:backup`; el plan gratuito no tiene copias), `npm run db:migrate -- --dry-run` (debe listar solo `0011_iot_ingest.sql`) y luego, en PowerShell, `CONFIRM_REMOTE_MIGRATION=<host>` + `npm run db:migrate`. Después `npm run db:check` y `npm run db:check:app`.

**Probar el simulador a mano:**
1. `npm run dev`, ingrese como administrador y abra **Dispositivos**.
2. Cree un dispositivo sobre un contenedor **DEMO** (ej. `HUB-ESP32-001`) y copie la credencial (se muestra una vez).
3. En `.env.local` agregue `IOT_DEVICE_TOKEN=<credencial>` (y opcional `IOT_DEVICE_ID`, `IOT_BASE_URL`; **no** suba ese archivo ni pegue la credencial en el chat).
4. `npm run iot:simulate -- --list`, luego `npm run iot:simulate -- --scenario=todos` y recargue **Dispositivos**.
5. Para «sin conexión»: espere los minutos de tolerancia y recargue (aparece «Dato desactualizado»). Para «token revocado»: revoque o rote el dispositivo y ejecute `--scenario=token_revocado`.

## 8. Aplicación y prueba en Supabase (2026-11-24, ejecutadas por el usuario en Windows; salidas informadas por el usuario)
- **Respaldo previo** (`npm run db:backup`, `pg_dump` 18.2 contra un servidor PostgreSQL 17.11): 177 388 bytes, 310 objetos, 20 tablas, 99 filas, 10 migraciones; guardado fuera del repositorio. Incidencias de entorno resueltas: faltaban `BACKUP_DIR`, `PG_DUMP_PATH` y `PG_RESTORE_PATH` (el script no encontraba `pg_dump` ni `pg_restore`; no es un defecto del código), y un intento falló con «tenant/user not found» del pooler (proyecto gratuito probablemente pausado; luego conectó sin cambios de configuración). **No** se ejecutó `db:restore-check` con este respaldo.
- **Ensayo** (`db:migrate -- --dry-run`): 10 aplicadas, 1 pendiente (`0011_iot_ingest.sql`), sin conflictos. **Aplicación** (`CONFIRM_REMOTE_MIGRATION` con el host del pooler): «Migraciones aplicadas: 0011_iot_ingest.sql».
- **`db:check`:** sin errores; 11 migraciones y ninguna pendiente; esquema `hc` con **22 tablas**, todas con RLS; `anon`/`authenticated` sin privilegios; `SET LOCAL ROLE hc_app` funciona; saldos no negativos; datos sin cambios (6 pesajes DEMO, 1 movimiento DEMO, 0 reales). **`db:check:app`** (rol `hc_login`): sin errores ni avisos; solo puede cambiar a `hc_app`, que solo lee tablas de negocio.
- **Simulador contra la aplicación local conectada a Supabase** (`npm run dev` + `iot:simulate -- --scenario=todos`): **53 envíos, 53 correctos, 0 diferencias** (vacío, depósito, estable repetido, retiro parcial, duplicado con `duplicate:true`, alterado 409, sensor inválido, fuera de rango 400, token desconocido 401, sin conexión). `--scenario=token_revocado`: 1 envío, 1 como se esperaba (el escenario acepta 401 o 403, por lo que **no distingue** si el dispositivo estaba revocado o rotado; el usuario no informó qué hizo).
- **No informado / no verificado:** la inspección visual de `/dispositivos` (estado «En línea», conteo de lecturas, «—» en el error de sensor), que Inicio y Tablero no cambiaron, y el estado «Dato desactualizado» tras la tolerancia. Aunque sí se verificaron en local (§5), no consta en Supabase. Sigue sin haber pruebas con el ESP32/HX711, HTTPS ni retención de lecturas.

