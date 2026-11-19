# 4. Firmware del ESP32

**Entorno:** Arduino IDE, C/C++.  
**Bibliotecas:** `HX711` (bogde), `WiFi`, `HTTPClient` y `Preferences` (incluidas en el núcleo ESP32 de Arduino).

## 4.1 Ciclo principal

```
cada 500 ms:
  1. Leer el peso (promedio de 10 lecturas del HX711)
  2. Guardar en una ventana de las últimas 4 lecturas (2 s)
  3. ¿Estable? (máx − mín de la ventana < 20 g)
       └─ no → seguir esperando
  4. ¿Cambió respecto al último peso enviado (≥ 50 g)
     o pasaron 30 s desde el último envío (latido)?
       └─ sí → leer el ultrasónico (mediana de 5) y enviar
```

| Parámetro | Valor inicial | Relación con el software |
| :-- | :-- | :-- |
| Ventana de estabilidad | 4 lecturas (2 s), variación < 20 g | Evita enviar el movimiento al depositar la bolsa. |
| Cambio mínimo para enviar | 50 g | Igual a `UMBRAL_RUIDO_G` del [servidor](../software/4_reglas_medicion.md). |
| Latido | 30 s | El dashboard marca "sin señal" después de 90 s. |

Si la distancia del ultrasónico queda fuera del rango del contenedor (por ejemplo, con la tapa abierta), se envía la lectura con `distanceMm` y `fillPercent` en `null` en lugar de un valor erróneo.

Los valores son **provisionales**: se ajustan con la prueba de ruido de la [calibración](6_calibracion.md).

## 4.2 Mensaje enviado

Sigue el contrato de la [API de lecturas](../software/3_api_datos.md):

```
POST http://<IP del notebook>:3000/api/iot/v1/readings
Authorization: Bearer <clave del dispositivo>
Idempotency-Key: <messageId>

{"schemaVersion": 1, "deviceId": "HUB-ESP32-001", "messageId": "…", "measuredAt": null,
 "weightGrams": 7340, "distanceMm": 180, "fillPercent": 55, "quality": "stable",
 "firmwareVersion": "0.1.0", "rssiDbm": -61}
```

* `weightGrams` es el peso estable en gramos. **Por acordar con Carlos:** si se envía el peso total sobre la plataforma (recomendado) o el neto del contenido.
* `quality` es `stable` en un envío normal, `uncalibrated` si no hay factor de calibración guardado y `sensor_error` si el HX711 no responde (con `weightGrams` en `null`).
* `measuredAt` va en `null`: sin RTC, la hora la asigna el servidor.
* `rssiDbm` se obtiene con `WiFi.RSSI()`.
* Si el envío falla, se **reintenta con el mismo `messageId`**: el servidor descarta los duplicados.

## 4.3 Datos que deben sobrevivir a un reinicio

Se guardan en la memoria no volátil del ESP32 con `Preferences`:

| Dato | Por qué |
| :-- | :-- |
| Factor de calibración y cero de la plataforma | Si el ESP32 hiciera tara al encender con residuos dentro, el peso quedaría mal. Por eso el cero se mide una sola vez, en la calibración. |
| Contador de mensajes (si el `messageId` se arma con `deviceId` + contador) | Si vuelve a 0 después de un reinicio, el servidor tomaría los mensajes nuevos como repetidos. Con un UUID aleatorio por mensaje no hace falta. |

## 4.4 Configuración

Los datos de la red y la clave van en un archivo `config.h` que **no se sube a GitHub** (se agrega a `.gitignore`); en el repositorio queda solo un `config.example.h`.

```cpp
#define WIFI_SSID     "HubCircular-Demo"
#define WIFI_PASS     "********"
#define SERVER_URL    "http://192.168.43.10:3000/api/iot/v1/readings"
#define DEVICE_ID     "HUB-ESP32-001"
#define DEVICE_KEY    "********"
```

* La clave identifica **solo a este dispositivo** y solo sirve para enviar lecturas. El ESP32 no tiene credenciales de la base de datos ni de Supabase.
* El ESP32 solo se conecta a redes de **2,4 GHz**: el hotspot debe configurarse en esa banda.
* Si se pierde el Wi-Fi, el ESP32 intenta reconectarse cada 5 s sin detener la lectura de los sensores.

## 4.5 Organización del código

```
firmware/
  hubcircular_esp32/
    hubcircular_esp32.ino   ← setup() y loop()
    peso.h / peso.cpp       ← HX711, promedio y estabilidad
    nivel.h / nivel.cpp     ← ultrasónico y porcentaje de llenado
    red.h / red.cpp         ← Wi-Fi y envío HTTP
    config.example.h        ← plantilla de configuración
  calibracion/
    calibracion.ino         ← programa aparte para obtener el factor de calibración
```

Cada sensor se puede probar por separado antes de integrarlos.

---

[← Volver al índice del MVP del hardware](README.md)
