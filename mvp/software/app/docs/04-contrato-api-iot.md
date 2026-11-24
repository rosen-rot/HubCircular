# 04 · Contrato provisional de integración IoT (ESP32 ↔ HubCircular)

**ESTADO (2026-11-24): v1 implementada y probada con mensajes SIMULADOS en PostgreSQL local y contra Supabase (simulador 53/53)** (`docs/27`). No se ha probado con el ESP32 real ni con HTTPS. El contenido original (v0.1) se conserva debajo; la tabla siguiente indica lo que se **implementó exactamente** y las precisiones añadidas. Si el firmware necesita cambios, se publica una v2 en otra ruta (`/api/iot/v2/…`) sin romper la v1.

### Implementación v1 (lo que hace el servidor hoy)
| Tema | Comportamiento |
|---|---|
| Autenticación | `Authorization: Bearer hcd_<43 caracteres>` por dispositivo. En BD solo existe el SHA-256. Se crea, rota y revoca en `/dispositivos` (administrador). Sin cookie de sesión. |
| `deviceId` | Debe ser el código del dispositivo dueño del token (si no, `403 device_mismatch`). Sin distinguir mayúsculas. |
| `Idempotency-Key` | **Opcional**; si se envía debe ser igual a `messageId` (si no, 400). La idempotencia real es por `(dispositivo, messageId)`. |
| Cuerpo | JSON estricto, máximo 2 048 bytes; campos desconocidos → 400. `firmwareVersion` opcional (1–32 caracteres). |
| Rangos | `weightGrams` entero 0–1 000 000 (puede ser `null`); `distanceMm` entero 0–10 000 (`null` si falla); `fillPercent` 0–100 con hasta 2 decimales (`null` permitido); valores negativos o fuera de rango → 400. |
| Calidad | `sensor_error` exige peso, distancia y llenado `null`; `uncalibrated` exige peso `null`. Los nulos se guardan como NULL (nunca como cero). |
| Reloj | `measuredAt` con más de 5 min en el futuro o más de 7 días atrás: se guarda lo informado, `clock_ok=false` y se usa la hora del servidor como momento efectivo. `received_at` siempre es del servidor. |
| Respuestas | `202 {accepted, readingId, duplicate}` · `400 reading_invalid` · `401 device_token_invalid` (con `WWW-Authenticate: Bearer`) · `403 device_revoked / device_mismatch / simulation_not_allowed` · `409 message_conflict` · `413` · `415` · `429 rate_limited` (más de 60 lecturas nuevas/min por dispositivo; `Retry-After: 60`) · `503` (BD no disponible; `Retry-After: 30`). Cuerpo de error: `{error:{code,message}}`; nunca incluye el token. |
| Simulador | Firmware `sim-…`: solo aceptado en dispositivos DEMO (`403 simulation_not_allowed` en reales). |
| Efectos | Solo `hc.sensor_readings` y el último contacto del dispositivo. **Nunca** pesajes, lotes, movimientos ni KPIs. |
| No implementado | `GET /api/devices/:id/latest` (la última lectura se ve en `/dispositivos`); `POST /api/weighings` y `/api/movements` siguen siendo los únicos que cambian inventario (movimientos solo por la interfaz). |

## Flujo
ESP32 / simulador → HTTPS → endpoint autenticado Next.js → validación → `sensor_readings` → estado actual en dashboard. **No** escribe directamente `weighings` ni `movements`.

## Endpoint propuesto
`POST /api/iot/v1/readings`

Headers propuestos:
```http
Content-Type: application/json
Authorization: Bearer <token-exclusivo-del-dispositivo>
Idempotency-Key: 019e1e78-....
```

Payload de ejemplo **SIMULADO**:
```json
{
  "schemaVersion": 1,
  "deviceId": "HUB-ESP32-001",
  "messageId": "a8a961b7-ae4d-4b72-a34b-d0a0d8d1ed51",
  "measuredAt": "2026-11-16T20:30:00Z",
  "weightGrams": 4250,
  "distanceMm": 180,
  "fillPercent": 65.0,
  "quality": "stable",
  "firmwareVersion": "0.1.0"
}
```

### Semántica
- `weightGrams`: peso neto estimado del **contenido actual** si la tara/estructura ya está calibrada; si no está calibrado, `quality="uncalibrated"` y el campo puede ser `null`.
- `distanceMm`: distancia de HC-SR04 al primer obstáculo detectado en mm; puede ser nula en caso de error.
- `fillPercent`: estimación geométrica [0,100], no equivale a kilogramos ni volumen exacto; también puede ser `null`.
- `quality`: `stable | unstable | uncalibrated | sensor_error` (enum provisional).
- `measuredAt`: fecha del dispositivo, si hay reloj confiable; el servidor **siempre** asigna `receivedAt` para auditoría. Rechazar o marcar timestamps imposibles.
- `messageId`: UUID único por evento; evitar colisiones al reiniciar y retransmitir.
- Valores límites según calibración y capacidad; rechazar peso negativo no explicado, porcentaje fuera de rango y payloads excesivos. Distinguir corrección/calibración de lectura.

### Respuestas previstas
- `202 Accepted` con `{ "accepted": true, "readingId": "uuid", "duplicate": false }`.
- Repetición auténtica de `(deviceId,messageId)` con **mismo contenido**: respuesta exitosa sin segunda inserción (`duplicate:true`). Repetición con mismo ID y contenido distinto → `409 Conflict`.
- `400` esquema/unidad inválida; `401` sin autenticación; `403` dispositivo inactivo/no autorizado; `429` límite de frecuencia; `503` servicio temporalmente indisponible (reintento con backoff).

## Endpoints de negocio separados
- `POST /api/weighings` — pesaje **confirmado** de operador o flujo validado autorizado; crea lote.
- `POST /api/movements` — traslados, retiros, reutilizaciones/rechazos, ajustes.
- `GET /api/dashboard/summary?from=&to=&zoneId=&materialId=` — KPI filtrados.
- `GET /api/devices/:id/latest` — última lectura/último contacto, según permisos.
La estructura final puede variar pero debe quedar documentada y versionada.

## Autenticación y seguridad
- Cada dispositivo tendrá una credencial única restringida a **ingesta únicamente**; permitir revocación/rotación. Autorización basada en registro de servidor, no solo `deviceId` del JSON.
- No incluir `SUPABASE_SERVICE_ROLE_KEY` ni secretos de usuarios en ESP32 o navegador. Almacenar el secreto del dispositivo protegido tanto como permita el hardware y no imprimirlo por Serial ni logs.
- TLS con verificación de certificado. No deshabilitar verificación de certificados en firmware definitivo.
- Validación del tamaño, tipos, rango, frecuencia y cuota por dispositivo. Usar reloj del servidor en caso de tiempo del dispositivo no confiable.
- No aceptar mensajes de retiro/captación como una simple lectura de telemetría.

## Reglas de negocio de enlace
El dashboard muestra peso actual y estado de llenado como datos de sensor. **Captación acumulada** cambia solo cuando el operador confirma ingreso/pesaje. El retiro documentado modifica inventario; un descenso de peso puede sugerir revisión pero no confirmar quién retiró, cuánto, ni a qué destino. No inferir reciclaje confirmado a partir de peso o distancia.

## Simulación
Ver `docs/09-simulador-iot.md`. Mantener ejemplos de lecturas simuladas etiquetados y aislados de los reportes del piloto real.

> **Estado operativo (20-11-2026):** el ESP32 ejecuta un sketch de prueba por USB; HX711, celda de tres cables y Wi-Fi no tienen integración validada. La API IoT v1 existe y está probada **solo con el simulador** (`docs/27`); no hay despliegue ni HTTPS verificados. Consulta `docs/14-estado-actual-y-handoff.md`.
