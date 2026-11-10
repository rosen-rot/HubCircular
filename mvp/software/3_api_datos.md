# 3. API y Modelo de Datos

Este documento es el **contrato entre el hardware y el software**. Si cambia, deben acordarlo ambas partes.

## 3.1 Envío de lecturas: `POST /api/lecturas`

**Cabecera:** `X-API-Key: <clave del dispositivo>`

**Cuerpo (JSON):**

```json
{
  "dispositivo_id": "esp32-01",
  "secuencia": 1532,
  "peso_g": 7340,
  "nivel_pct": 55,
  "rssi_dbm": -61
}
```

| Campo | Tipo | Obligatorio | Descripción |
| :-- | :-- | :-- | :-- |
| `dispositivo_id` | texto | Sí | Identifica al ESP32 o al simulador. |
| `secuencia` | entero | Sí | Contador que el ESP32 aumenta en cada envío y conserva aunque se reinicie. Permite descartar reenvíos duplicados. |
| `peso_g` | entero | Sí | Peso **total y estable** sobre la balanza, en gramos (contenedor + residuos). |
| `nivel_pct` | entero 0–100 | No | Porcentaje de llenado medido por el HC-SR04. |
| `rssi_dbm` | entero | No | Intensidad de la señal Wi-Fi del ESP32, para el panel de conexión. |

* La **fecha y hora** las asigna el servidor al recibir la lectura, para no depender del reloj del ESP32.
* El **contenedor** y el **origen** (`sensor` o `simulador`) se obtienen del dispositivo registrado, no del mensaje. Así el simulador no puede hacerse pasar por el sensor.

**Respuestas:**

| Código | Caso | Cuerpo |
| :-- | :-- | :-- |
| `201` | Lectura guardada | `{"evento": "ingreso", "delta_g": 1400, "acumulado_g": 6800}` (el evento puede ser `ingreso`, `retiro`, `ajuste` o `ninguno`) |
| `200` | Secuencia repetida | `{"evento": "duplicado"}` (no se guarda de nuevo) |
| `401` | Clave inválida | — |
| `422` | Datos inválidos | Detalle del error (por ejemplo, `peso_g` negativo). |

## 3.2 Consultas para el dashboard

| Método y ruta | Devuelve |
| :-- | :-- |
| `GET /api/estado` | Estado actual del contenedor: kg acumulados, % de llenado, última lectura, segundos desde la última lectura, RSSI y origen. |
| `GET /api/lecturas/recientes?limite=20` | Últimas lecturas recibidas, para el panel en vivo. |
| `GET /api/eventos?desde=AAAA-MM-DD` | Historial de ingresos, retiros y ajustes. |
| `GET /api/resumen/diario` | kg ingresados por día. |
| `POST /api/contenedores/{id}/tara` | Registra manualmente la tara del contenedor vacío. |
| `GET /api/eventos.csv` | Exportación a CSV (S6, si queda tiempo). |

## 3.3 Modelo de datos (SQLite)

| Tabla | Campos principales |
| :-- | :-- |
| `materiales` | `id`, `nombre` (ej. PLA) |
| `contenedores` | `id`, `nombre`, `material_id`, `ubicacion`, `tara_g`, `capacidad_l` |
| `dispositivos` | `id`, `contenedor_id`, `clave_hash`, `origen` (`sensor` / `simulador`) |
| `lecturas` | `id`, `dispositivo_id`, `secuencia`, `peso_g`, `nivel_pct`, `rssi_dbm`, `recibido_en` · único (`dispositivo_id`, `secuencia`) |
| `eventos` | `id`, `contenedor_id`, `lectura_id`, `tipo` (`ingreso` / `retiro` / `ajuste`), `delta_g`, `acumulado_g`, `origen`, `creado_en` |

* `lecturas` guarda **todo lo que llega, sin modificar** (respaldo y trazabilidad).
* `eventos` guarda **lo que interpretan las reglas**. Si se cambia un umbral, los eventos se pueden recalcular desde las lecturas.

---

[← Volver al índice del MVP del software](README.md)
