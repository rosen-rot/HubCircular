# 04 · Contrato provisional de integración IoT (ESP32 ↔ HubCircular)

**ESTADO: BORRADOR v0.1, para acordar entre chats de hardware y software; no es una API implementada.** Se acordará la versión antes de escribir firmware que dependa de ella.

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

> **Estado operativo (18-11-2026):** el ESP32 ejecuta un sketch de prueba por USB; HX711, celda de tres cables y Wi-Fi no tienen integración validada. La API IoT es un contrato de diseño, no un despliegue verificado. Consulta `docs/14-estado-actual-y-handoff.md`.
