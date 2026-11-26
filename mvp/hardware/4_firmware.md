# 4. Firmware del ESP32

**Código:** [`firmware/`](firmware/) · **Estado (26-11-2026):** escrito y revisado, **todavía no compilado ni probado en el ESP32**.  
**Entorno:** Arduino IDE, placa «ESP32 Dev Module» (núcleo esp32 de Espressif 3.x), C/C++.  
**Bibliotecas:** «HX711 Arduino Library» (Bogdan Necula), que se instala desde el Gestor de bibliotecas. `WiFi`, `WiFiClientSecure`, `HTTPClient` y `Preferences` vienen incluidas en el núcleo ESP32.

## 4.1 Ciclo principal

```
cada 500 ms:
  1. Leer el peso (promedio de 10 lecturas del HX711)
  2. Guardar en una ventana de las últimas 4 lecturas (2 s)
  3. ¿Estable? (máx − mín de la ventana < 20 g)
  4. ¿Cambió ≥ 50 g respecto al último peso enviado (y está estable)
     o pasaron 30 s desde el último envío (latido)?
       └─ sí → leer el ultrasónico (mediana de 5) y enviar
```

| Parámetro | Valor inicial | Relación con el software |
| :-- | :-- | :-- |
| Ventana de estabilidad | 4 lecturas (2 s), variación < 20 g | Evita enviar el movimiento al depositar la bolsa. |
| Cambio mínimo para enviar | 50 g | Umbral de ruido. |
| Latido | 30 s | En **Dispositivos** el sensor pasa a «Dato desactualizado» si no hay contacto en los minutos de tolerancia del dispositivo (15 por defecto). |

Si la distancia del ultrasónico queda fuera del rango del contenedor (por ejemplo, con la tapa abierta), se envía la lectura con `fillPercent: null` en lugar de un valor erróneo. Si el HX711 no responde, se envía `quality: "sensor_error"` sin peso. Si la balanza no está calibrada, se envía `quality: "uncalibrated"`.

Los valores son **provisionales**: se ajustan con la prueba de ruido de la [calibración](6_calibracion.md).

## 4.2 Mensaje enviado

Sigue el contrato de la plataforma ([`docs/04`](../software/app/docs/04-contrato-api-iot.md), v1). Reemplaza al borrador anterior `/api/lecturas`.

```
POST https://<plataforma>/api/iot/v1/readings
Authorization: Bearer <token del dispositivo>

{"schemaVersion":1,"deviceId":"HUB-ESP32-001","messageId":"<UUID>","measuredAt":"2026-11-26T20:30:00Z",
 "weightGrams":7340,"distanceMm":180,"fillPercent":55.0,"quality":"stable","firmwareVersion":"1.0.0"}
```

* `weightGrams` es el **peso total sobre la plataforma** (contenedor + residuos) en gramos.
* `messageId` es un UUID aleatorio por lectura. Si el envío falla por red, por `429` o por `5xx`, **se reintenta con el mismo mensaje** (espera de 2 s a 60 s) y el servidor responde `202` con `duplicate: true` sin guardarlo dos veces. Ante otros errores (`401`, `403`, `400`), el mensaje se descarta y el LED parpadea lento.
* `measuredAt` es **obligatorio**: la hora se obtiene por NTP y el ESP32 no envía hasta tenerla. El servidor también registra su propia hora de recepción.
* El contrato es **estricto** (un campo extra se rechaza con `400`): la señal Wi-Fi (`rssiDbm`) no se envía, solo se muestra en el Monitor serie.
* Con `quality: "sensor_error"` (HX711 sin respuesta) peso, distancia y llenado van en `null`. Con `uncalibrated`, el peso va en `null`.

## 4.3 Datos que deben sobrevivir a un reinicio

| Dato | Dónde | Por qué |
| :-- | :-- | :-- |
| Cero de la plataforma y factor de calibración | `Preferences` (espacio `balanza`), lo escribe el sketch `calibracion` | Si el ESP32 hiciera tara al encender con residuos dentro, el peso quedaría mal. Por eso el cero se mide una sola vez, con la plataforma vacía. |

Ya no hace falta guardar un contador de secuencia: cada lectura usa un UUID aleatorio generado por el hardware del ESP32.

## 4.4 Configuración

Copiar `config.example.h` como `config.h` (que **no se sube a GitHub**) y completar:

```cpp
#define WIFI_SSID       "HubCircular-Demo"
#define WIFI_PASS       "********"
#define SERVER_BASE_URL "https://hub-circular.vercel.app"  // pruebas locales: http://<IP-del-notebook>:3000
#define DEVICE_ID       "HUB-ESP32-001"
#define DEVICE_TOKEN    "hcd_…"                          // Plataforma → Dispositivos → Crear (solo administrador)
```

* El token identifica **solo a este dispositivo** y solo sirve para enviar lecturas. El ESP32 no tiene credenciales de la base de datos. El token no se imprime por Serial.
* Con `https://` el certificado del servidor **se valida** (raíces en `certificados.h`).
* El ESP32 solo se conecta a redes de **2,4 GHz**: el hotspot debe configurarse en esa banda.
* Si se pierde el Wi-Fi, el ESP32 intenta reconectarse cada 5 s sin detener la lectura de los sensores.
* `USAR_BALANZA` y `USAR_ULTRASONICO` permiten probar con un solo sensor conectado.

**LED integrado:** parpadeo rápido = sin Wi-Fi · fijo = conectado · apagado breve = lectura enviada · parpadeo lento = el servidor rechazó la lectura (revisar el Monitor serie).

## 4.5 Organización del código

```
firmware/
  hubcircular_esp32/
    hubcircular_esp32.ino   ← setup() y loop(): estabilidad, latido, reintentos, LED
    peso.h / peso.cpp       ← HX711, promedio, estabilidad y calibración guardada
    nivel.h / nivel.cpp     ← ultrasónico (mediana de 5) y % de llenado
    red.h / red.cpp         ← Wi-Fi, NTP, UUID y envío HTTPS
    certificados.h          ← raíces TLS (Vercel: GTS Root R1 y Let's Encrypt ISRG Root X1)
    config.example.h        ← plantilla de configuración
  calibracion/
    calibracion.ino         ← comandos por Monitor serie: r, z, c <gramos>, g, p, b
```

## 4.6 Primera prueba (orden sugerido)

1. Cargar `calibracion` → `r` (las lecturas crudas deben cambiar al presionar la celda) → `z` → `c <gramos>` → `p` para verificar → `g` para guardar.
2. Crear el dispositivo en la plataforma: **Dispositivos → Crear** (administrador), con código `HUB-ESP32-001` y el contenedor real donde va la balanza. El token se muestra **una sola vez**: cópielo al `config.h`.
3. Completar `config.h` y cargar `hubcircular_esp32`. En el Monitor serie (115200) debe aparecer `[red] conectada` y luego `[envio] OK 202`.
4. Abrir **Dispositivos** en la plataforma: el dispositivo debe estar «En línea» y la última lectura debe cambiar al cargar la plataforma. El estado y el llenado también aparecen en **Inicio** y **Contenedores**.

---

[← Volver al índice del MVP del hardware](README.md)
