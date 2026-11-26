# 3. API y Modelo de Datos

Este documento es el **contrato entre el hardware y el software**. Si cambia, deben acordarlo ambas partes. El detalle técnico completo está en [`app/docs/04-contrato-api-iot.md`](app/docs/04-contrato-api-iot.md).

## 3.1 Envío de lecturas: `POST /api/iot/v1/readings` *(✅ construido, Iteración 4)*

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
  "measuredAt": "2026-11-26T20:30:00Z",
  "weightGrams": 4250,
  "distanceMm": 180,
  "fillPercent": 65.0,
  "quality": "stable",
  "firmwareVersion": "1.0.0"
}
```

| Campo | Tipo | Obligatorio | Descripción |
| :-- | :-- | :-- | :-- |
| `schemaVersion` | entero | Sí | Versión del contrato (hoy `1`). |
| `deviceId` | texto | Sí | Identifica al ESP32 o al simulador. |
| `messageId` | texto (UUID) | Sí | Único por mensaje. Si el ESP32 reintenta un envío, repite el mismo `messageId` y el servidor no lo guarda dos veces. |
| `measuredAt` | fecha ISO | **Sí** | Hora del ESP32, obtenida por NTP (el firmware no envía hasta sincronizarla). Si es imposible, el servidor usa su propia hora; **siempre** registra la hora de llegada. |
| `weightGrams` | entero o `null` | Sí | Peso estable en gramos. `null` si el sensor falla o no está calibrado. |
| `distanceMm` | entero o `null` | Sí (puede ser `null`) | Distancia del HC-SR04 al contenido, en mm. |
| `fillPercent` | número 0–100 o `null` | Sí (puede ser `null`) | Llenado estimado. Es aproximado: no equivale a kilos. |
| `quality` | texto | Sí | `stable`, `unstable`, `uncalibrated` o `sensor_error`. |
| `firmwareVersion` | texto | No | Versión del firmware. |

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

### Acuerdos entre hardware y software (cerrados el 26-11-2026)

| Tema | Decisión |
| :-- | :-- |
| Qué peso envía el ESP32 | **Peso total** sobre la plataforma (contenedor + residuos). El cero se calibra con la plataforma vacía; la tara del contenedor la conoce la plataforma. |
| Cómo genera el ESP32 el `messageId` | **UUID aleatorio** por mensaje (generador por hardware del ESP32). No hace falta guardar un contador. |
| Campo `rssiDbm` | **No** está en el contrato v1 (estricto: un campo extra da `400`). La señal se ve en el Monitor serie; agregarlo sería una v2. |
| Hora (`measuredAt`) | Obligatoria, por NTP. |

Firmware: [`../hardware/firmware/`](../hardware/firmware/) · guía: [`../hardware/4_firmware.md`](../hardware/4_firmware.md).
## 3.2 Rutas existentes de la plataforma

| Método y ruta | Uso | Estado |
| :-- | :-- | :-- |
| `POST /api/weighings` | Registrar un pesaje confirmado (crea un lote). Requiere sesión. | ✅ Construido |
| `GET /api/weighings` | Listar pesajes. | ✅ Construido |
| `/dashboard/export` | Descargar los datos en Excel o CSV. | ✅ Construido |
| `POST /api/iot/v1/readings` | Lecturas del ESP32 o del simulador (token del dispositivo). | ✅ Construido |
| `/dispositivos` | Alta, rotación y revocación de dispositivos; estado y últimas lecturas. | ✅ Construido |

El resto de las acciones (movimientos, destinos, usuarios) se hacen desde las pantallas de la plataforma.

## 3.3 Modelo de datos (PostgreSQL, esquema `hc`)

| Grupo | Tablas | Estado |
| :-- | :-- | :-- |
| Usuarios | `profiles`, `user_roles`, `local_credentials`, `local_sessions`, `audit_logs` | ✅ |
| Catálogo | `buildings`, `zones`, `stations`, `materials`, `containers` | ✅ |
| Pesajes y lotes | `weighings`, `batches`, `batch_location_balances` | ✅ |
| Trazabilidad | `destinations`, `movements`, `movement_evidence`, `movement_verifications` | ✅ |
| Cobertura | `measurement_schedules`, `measurement_zero_confirmations` | ✅ |
| Sensor | `devices` (clave guardada como hash), `sensor_readings` (todo lo que llega, sin modificar) | ✅ |

* `sensor_readings` guarda **todas las lecturas tal como llegan**, separadas de los pesajes. Si se cambia un umbral, los ingresos se pueden recalcular desde las lecturas.
* Las fechas se guardan en UTC y se muestran en hora de Santiago.
* Los datos de prueba están etiquetados **DEMO** y no se mezclan con mediciones reales.

---

[← Volver al índice del MVP del software](README.md)
