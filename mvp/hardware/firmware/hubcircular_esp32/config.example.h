#pragma once
// Plantilla de configuración. Copie este archivo como `config.h` (en esta misma carpeta) y complete los valores.
// `config.h` NO se sube a GitHub (está en .gitignore): contiene la clave del Wi-Fi y el token del dispositivo.

// --- Wi-Fi (solo redes de 2,4 GHz) ---------------------------------------------------------------
#define WIFI_SSID "HubCircular-Demo"
#define WIFI_PASS "cambiar"

// --- Plataforma ----------------------------------------------------------------------------------
// URL base de la plataforma, SIN barra final. En producción debe ser https:// (se valida el certificado).
// Para pruebas en red local se acepta http://<IP-del-notebook>:3000
#define SERVER_BASE_URL "https://hubcircular.vercel.app"

// Código y token del dispositivo. Se obtienen con:
//   npm run iot:device -- create HUB-ESP32-001 <CODIGO-CONTENEDOR> sensor
// El token se muestra una sola vez. No lo imprima por Serial ni lo comparta.
#define DEVICE_ID    "HUB-ESP32-001"
#define DEVICE_TOKEN "hcd_pegar_aqui_el_token"

// --- Sensores (1 = conectado, 0 = no conectado) --------------------------------------------------
#define USAR_BALANZA     1
#define USAR_ULTRASONICO 1

// --- Pines (mvp/hardware/3_conexiones.md) --------------------------------------------------------
#define PIN_HX711_DT  19
#define PIN_HX711_SCK 18
#define PIN_US_TRIG   5
#define PIN_US_ECHO   34   // a través del divisor de voltaje 1 kΩ / 2 kΩ
#define PIN_LED       2

// --- Geometría del contenedor para el % de llenado (medir con el contenedor montado) ------------
#define NIVEL_DIST_VACIO_MM 400  // distancia del sensor al fondo con el contenedor vacío
#define NIVEL_DIST_LLENO_MM 60   // distancia a la que se considera 100 % lleno
