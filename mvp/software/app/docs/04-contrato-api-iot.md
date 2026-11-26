# 04 · Contrato de integración IoT (ESP32 ↔ HubCircular)

**ESTADO: v1 IMPLEMENTADA (26-11-2026).** Código: `src/app/api/iot/v1/readings/route.ts`, `src/modules/iot/`, migración `0011`. Firmware: `mvp/hardware/firmware/`. Guía de puesta en marcha: `docs/27`. **Sin prueba aún con el ESP32 real ni en producción.**

Este contrato reemplaza al borrador `POST /api/lecturas` con `X-API-Key` y `secuencia` (`mvp/software/3_api_datos.md`, versión del 10-nov).

## Flujo
ESP32 / simulador → HTTPS → `POST /api/iot/v1/readings` → validación → `hc.sensor_readings` → pantalla **Sensores** y botón «Leer peso de la balanza» en Registro. **No** escribe `weighings` ni `movements`.

## Petición

```http
POST /api/iot/v1/readings
Content-Type: application/json
Authorization: Bearer hcd_<token-del-dispositivo>
Idempotency-Key: <igual a messageId>        (opcional)
```

```json
{
  "schemaVersion": 1,
  "deviceId": "HUB-ESP32-001",
  "messageId": "a8a961b7-ae4d-4b72-a34b-d0a0d8d1ed51",
  "measuredAt": "2026-11-26T20:30:00Z",
  "weightGrams": 7340,
  "distanceMm": 180,
  "fillPercent": 55.0,
  "quality": "stable",
  "rssiDbm": -61,
  "firmwareVersion": "1.0.0"
}
```

| Campo | Tipo | Oblig. | Semántica |
|---|---|---|---|
| `schemaVersion` | `1` | Sí | Versión del contrato. |
| `deviceId` | texto `[A-Za-z0-9_-]`, 3–64 | Sí | Debe corresponder al token (si no, 403). |
| `messageId` | UUID | Sí | Único por lectura. Un reintento usa **el mismo** `messageId`. |
| `measuredAt` | ISO-8601 o `null` | No | Reloj del dispositivo (NTP). Si es imposible (más de 5 min en el futuro o más de 7 días atrás), se guarda `null`. El servidor siempre registra `received_at`. |
| `weightGrams` | entero 0–1.000.000 o `null` | Sí | **Peso BRUTO sobre la plataforma** (contenedor + residuos). El cero de la balanza se calibra con la plataforma vacía. La tara del contenedor la conoce la plataforma. |
| `distanceMm` | entero 0–10.000 o `null` | No | Distancia del HC-SR04 al contenido. |
| `fillPercent` | 0–100 (1 decimal) o `null` | No | Estimación geométrica. No equivale a kilos. |
| `quality` | `stable` · `unstable` · `uncalibrated` · `sensor_error` | Sí | `stable` exige peso. `sensor_error` exige `weightGrams: null` (no se inventa un cero). |
| `rssiDbm` | entero −127–0 o `null` | No | Señal Wi-Fi. |
| `firmwareVersion` | texto ≤ 32 | No | |

Se rechaza cualquier campo extra. Tamaño máximo: 2 KB.

## Respuestas

| Código | Caso | Cuerpo |
|---|---|---|
| `202` | Lectura guardada | `{"accepted":true,"readingId":"…","duplicate":false,"receivedAt":"…","simulated":false}` |
| `200` | Mismo `messageId` y mismo contenido (reintento) | Igual, con `duplicate: true`. No se inserta de nuevo. |
| `400` | JSON o datos inválidos | `{"error":{"code":"validation","issues":[…]}}` |
| `401` | Sin token, token inválido o revocado | `device_unauthenticated` |
| `403` | Dispositivo desactivado, o token de otro `deviceId` | `device_inactive` · `device_mismatch` |
| `409` | Mismo `messageId` con contenido distinto | `reading_conflict` |
| `413` / `415` | Cuerpo muy grande / Content-Type incorrecto | |
| `429` | Más de 60 lecturas por minuto | `rate_limited`, con `Retry-After: 30` |
| `503` | Falla temporal (BD) | Reintentar con backoff |

**Política del firmware:** reintenta el mismo mensaje ante `429`, `5xx` o falla de red (backoff de 2 s a 60 s). Ante cualquier otro `4xx` descarta el mensaje y lo avisa con el LED.

## Autenticación y seguridad
- Un token por dispositivo (`hcd_` + 32 bytes aleatorios), creado con `npm run iot:device`. La BD guarda solo el hash SHA-256 y el rol de aplicación no puede leerlo. Se puede rotar o desactivar.
- El contenedor y el tipo (`sensor` o `simulator`) salen del registro del dispositivo, nunca del mensaje.
- HTTPS validando el certificado (raíces en `firmware/hubcircular_esp32/certificados.h`). Nunca `setInsecure()`. Se acepta `http://` solo para pruebas en red local.
- Sin `SUPABASE_SERVICE_ROLE_KEY` ni credenciales de BD en el ESP32. El token no se imprime por Serial.

## Reglas de negocio de enlace
El sensor muestra el peso actual y el llenado. **Captación acumulada** cambia solo cuando el operador confirma un pesaje (el formulario puede precargar el bruto desde la última lectura estable). Una baja de peso no confirma un retiro, ni quién lo hizo, ni el destino. No se infiere reciclaje a partir del peso o la distancia.

## Otros endpoints
- `GET /api/iot/v1/containers/{código}/latest`: con sesión. Dispositivos del contenedor y su última lectura.
- `POST /api/weighings`: pesaje confirmado (sesión de usuario). Sin cambios.

## Simulación
`npm run iot:simulate` (ver `docs/09` y `docs/27`). Las lecturas de un dispositivo `simulator` quedan marcadas como simuladas y la interfaz las etiqueta como SIMULADOR.
