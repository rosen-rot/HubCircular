# 3. API y Modelo de Datos

Este documento es el **contrato entre el hardware y el software**. Si cambia, deben acordarlo ambas partes. El detalle técnico completo está en [`app/docs/04-contrato-api-iot.md`](app/docs/04-contrato-api-iot.md).

## 3.1 Envío de lecturas: `POST /api/iot/v1/readings` *(por construir, S7)*

**Cabeceras:**

```http
Content-Type: application/json
Authorization: Bearer <clave exclusiva del dispositivo>
Idempotency-Key: <mismo valor que messageId>
```

**Cuerpo (JSON):**

```json
{
  "schemaVersion": 1,
  "deviceId": "HUB-ESP32-001",
  "messageId": "a8a961b7-ae4d-4b72-a34b-d0a0d8d1ed51",
  "measuredAt": null,
  "weightGrams": 4250,
  "distanceMm": 180,
  "fillPercent": 65.0,
  "quality": "stable",
  "firmwareVersion": "0.1.0",
  "rssiDbm": -61
}
```

| Campo | Tipo | Obligatorio | Descripción |
| :-- | :-- | :-- | :-- |
| `schemaVersion` | entero | Sí | Versión del contrato (hoy `1`). |
| `deviceId` | texto | Sí | Identifica al ESP32 o al simulador. |
| `messageId` | texto (UUID) | Sí | Único por mensaje. Si el ESP32 reintenta un envío, repite el mismo `messageId` y el servidor no lo guarda dos veces. |
| `measuredAt` | fecha ISO o `null` | No | Hora del ESP32. Como no usamos reloj RTC, se envía `null`: el servidor **siempre** registra la hora de llegada. |
| `weightGrams` | entero o `null` | Sí | Peso estable en gramos. `null` si el sensor falla o no está calibrado. |
| `distanceMm` | entero o `null` | No | Distancia del HC-SR04 al contenido, en mm. |
| `fillPercent` | número 0–100 o `null` | No | Llenado estimado. Es aproximado: no equivale a kilos. |
| `quality` | texto | Sí | `stable`, `unstable`, `uncalibrated` o `sensor_error`. |
| `firmwareVersion` | texto | No | Versión del firmware. |
| `rssiDbm` | entero | No | Señal Wi-Fi del ESP32 (`WiFi.RSSI()`), para el panel de conexión. *Propuesto: falta agregarlo al contrato de `app/docs/04`.* |

* El **contenedor** y el **origen** (`sensor` o `simulador`) se obtienen del dispositivo registrado en el servidor, no del mensaje. Así el simulador no puede hacerse pasar por el sensor.
* El ESP32 **nunca** recibe credenciales de la base de datos ni de Supabase.

**Respuestas:**

| Código | Caso |
| :-- | :-- |
| `202` | Lectura aceptada: `{"accepted": true, "readingId": "…", "duplicate": false}` |
| `202` | Reenvío del mismo mensaje: `{"accepted": true, "duplicate": true}` (no se guarda de nuevo) |
| `409` | Mismo `messageId` con contenido distinto |
| `400` | Datos inválidos (por ejemplo, `fillPercent` = 130) |
| `401` / `403` | Clave inválida o dispositivo desactivado |
| `429` | Demasiados envíos seguidos |

### Acuerdos pendientes entre hardware y software

| Tema | Opciones | Responsables |
| :-- | :-- | :-- |
| Qué peso envía el ESP32 | **Peso total** sobre la plataforma (la tara la resta el servidor) o **peso neto** del contenido. Se recomienda el peso total, para que la tara se corrija sin reprogramar el ESP32. | Vicente y Carlos |
| Cómo genera el ESP32 el `messageId` | UUID aleatorio por mensaje, o `deviceId` + contador guardado en memoria. | Vicente y Carlos |
| Campo `rssiDbm` | Agregarlo al contrato. | Carlos |

## 3.2 Rutas existentes de la plataforma

| Método y ruta | Uso | Estado |
| :-- | :-- | :-- |
| `POST /api/weighings` | Registrar un pesaje confirmado (crea un lote). Requiere sesión. | ✅ Construido |
| `GET /api/weighings` | Listar pesajes. | ✅ Construido |
| `/dashboard/export` | Descargar los datos en Excel o CSV. | ✅ Construido |
| `GET /api/devices/{id}/latest` | Última lectura y último contacto del sensor, para el panel en vivo. | ⏳ Por construir |

El resto de las acciones (movimientos, destinos, usuarios) se hacen desde las pantallas de la plataforma.

## 3.3 Modelo de datos (PostgreSQL, esquema `hc`)

| Grupo | Tablas | Estado |
| :-- | :-- | :-- |
| Usuarios | `profiles`, `user_roles`, `local_credentials`, `local_sessions`, `audit_logs` | ✅ |
| Catálogo | `buildings`, `zones`, `stations`, `materials`, `containers` | ✅ |
| Pesajes y lotes | `weighings`, `batches`, `batch_location_balances` | ✅ |
| Trazabilidad | `destinations`, `movements`, `movement_evidence`, `movement_verifications` | ✅ |
| Cobertura | `measurement_schedules`, `measurement_zero_confirmations` | ✅ |
| Sensor | `devices` (clave guardada como hash), `sensor_readings` (todo lo que llega, sin modificar) | ⏳ Por construir |

* `sensor_readings` guarda **todas las lecturas tal como llegan**, separadas de los pesajes. Si se cambia un umbral, los ingresos se pueden recalcular desde las lecturas.
* Las fechas se guardan en UTC y se muestran en hora de Santiago.
* Los datos de prueba están etiquetados **DEMO** y no se mezclan con mediciones reales.

---

[← Volver al índice del MVP del software](README.md)
