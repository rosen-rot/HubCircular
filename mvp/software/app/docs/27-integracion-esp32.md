# 27 · Integración ESP32 ↔ plataforma (Iteración 4)

**Estado (26-11-2026):** software implementado y probado en PostgreSQL local (Vitest 389/389, incluidas 24 pruebas nuevas de IoT). **Sin probar todavía con el ESP32 real**, contra Supabase ni con la plataforma desplegada. El firmware no se ha compilado (no hay Arduino IDE en el equipo donde se escribió): la primera compilación queda pendiente para el equipo de hardware.

## 1. Qué se construyó

| Pieza | Dónde | Qué hace |
|---|---|---|
| Migración `0011` | `db/migrations/0011_iot_devices_readings.sql` | Tablas `hc.devices` (token guardado como hash SHA-256) y `hc.sensor_readings` (inmutables, únicas por dispositivo + `messageId`), función `hc.iot_ingest_reading`, RLS por contenedor visible. |
| Endpoint de ingesta | `POST /api/iot/v1/readings` | Recibe las lecturas del ESP32 o del simulador. Contrato en `docs/04` (v1). |
| Última lectura | `GET /api/iot/v1/containers/{código}/latest` | Con sesión. Lo usa el botón «Leer peso de la balanza». |
| Pantalla **Sensores** | `/sensores` (menú) | Peso bruto, llenado, estado, señal Wi-Fi, «En línea / Sin señal» (90 s) y últimas lecturas. Se actualiza cada 5 s. |
| Botón en **Registro** | `/registro` | «Leer peso de la balanza» precarga el **peso bruto** con la última lectura **estable** (máx. 2 min). El operador revisa y confirma; en Observaciones queda «Peso bruto leído de HUB-ESP32-001». |
| Alta de dispositivos | `npm run iot:device` | `create`, `rotate`, `disable`, `enable`, `list`. Muestra el token una sola vez. |
| Simulador | `npm run iot:simulate` | Modo demo continuo, o `-- --checks` para recorrer los casos del contrato contra cualquier URL. |
| Firmware | `mvp/hardware/firmware/` | `hubcircular_esp32` (HTTPS con certificado validado, balanza, ultrasónico, reintentos) y `calibracion`. |

**Regla que no cambia:** una lectura del sensor **nunca** crea pesajes, lotes ni movimientos. La captación solo cuenta cuando un operador confirma un pesaje.

## 2. Puesta en marcha (orden recomendado)

1. **Aplicar la migración** en Supabase (con respaldo previo, como en las iteraciones anteriores):
   `npm run db:backup` → `npm run db:migrate -- --dry-run` (debe mostrar solo `0011`) → `db:migrate` con `CONFIRM_REMOTE_MIGRATION` → `npm run db:check`.
2. **Registrar los dispositivos** (usa `MIGRATION_DATABASE_URL`):
   ```
   npm run iot:device -- create HUB-SIM-001   <CODIGO-CONTENEDOR> simulator
   npm run iot:device -- create HUB-ESP32-001 <CODIGO-CONTENEDOR> sensor
   ```
   Los códigos de contenedor se ven en `/contenedores`. Guarde cada token: no se vuelve a mostrar (si se pierde, `rotate`).
3. **Probar sin hardware** con el simulador (`.env.local`: `IOT_BASE_URL`, `IOT_DEVICE_ID=HUB-SIM-001`, `IOT_DEVICE_TOKEN=…`):
   `npm run iot:simulate -- --checks` (todos los casos deben responder lo esperado) y luego `npm run iot:simulate` y abrir `/sensores`.
4. **Calibrar la balanza** con `firmware/calibracion` (ver `mvp/hardware/6_calibracion.md`): `z` con la plataforma vacía, `c <gramos>` con una masa conocida, `g` para guardar.
5. **Cargar el firmware** `hubcircular_esp32` con `config.h` completo (Wi-Fi de 2,4 GHz, `SERVER_BASE_URL`, `DEVICE_ID`, `DEVICE_TOKEN`). En el Monitor serie debe aparecer `[envio] OK 202`.
6. En `/sensores` el dispositivo debe pasar a **En línea**. En `/registro`, «Leer peso de la balanza» debe traer el peso.

## 3. Despliegue en internet (pendiente)

El ESP32 envía por **HTTPS validando el certificado**. El firmware trae las raíces de `*.vercel.app` (GTS Root R1) y de dominios con Let's Encrypt (ISRG Root X1), verificadas el 26-11-2026. Si se usa otro proveedor, hay que agregar su raíz en `certificados.h`.

Para Vercel (u otro hosting de Next.js): definir `DATABASE_URL` (pooler de Supabase), `DB_APP_ROLE`, `DB_SSL`, `SESSION_COOKIE_SECURE=true` y un `DB_POOL_MAX` bajo (por ejemplo, 3), porque cada instancia serverless abre su propio pool. Para probar en red local antes del despliegue, `SERVER_BASE_URL` acepta `http://<IP-del-notebook>:3000` (sin cifrado: solo pruebas).

## 4. Seguridad

- Un token por dispositivo, solo para ingesta. La BD guarda el hash. El rol `hc_app` no puede leer los hashes ni escribir lecturas directamente.
- El contenedor y el tipo (`sensor` o `simulator`) los decide el registro del dispositivo, no el mensaje: el simulador no puede hacerse pasar por el sensor.
- El token debe coincidir con el `deviceId` del mensaje (403 si no). Cuota de 60 lecturas por minuto por dispositivo (429).
- `/api/iot/` no exige cookie de sesión en `proxy.ts`. Cada ruta valida su propia credencial: Bearer para la ingesta y sesión para la consulta.

## 5. Pendiente / no verificado

- Compilar y cargar el firmware en el ESP32 real; prueba de punta a punta con la balanza calibrada.
- Aplicar `0011` en Supabase y desplegar la plataforma con HTTPS.
- Administración de dispositivos desde la interfaz (hoy solo por script).
- El pesaje precargado desde el sensor queda con `source = 'manual'` y la nota en Observaciones; usar `iot_confirmed` requiere cambiar `hc.register_weighing`.
- Pruebas E2E (Playwright) de `/sensores` y del botón de registro.
