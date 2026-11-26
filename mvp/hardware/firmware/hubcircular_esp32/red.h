#pragma once
#include <Arduino.h>

// Wi-Fi, hora (NTP) y envío HTTPS de lecturas a POST /api/iot/v1/readings (contrato docs/04 v1).

void redIniciar();
// Llamar en cada vuelta del loop: reconecta el Wi-Fi cada 5 s si se perdió (sin bloquear los sensores).
void redMantener();
bool redConectada();
int redRssi();

// Fecha/hora UTC en ISO-8601 ("2026-11-26T20:30:00Z"); false si el reloj aún no se sincronizó por NTP.
bool redHoraIso(char* out, size_t len);

// UUID v4 aleatorio (identificador único de cada lectura).
void redNuevoUuid(char out[37]);

// Resultado de un envío:
//   >= 200 y < 300 → aceptado (202) o duplicado ya guardado (200)
//   429 / >= 500 / <= 0 (sin red, DNS, TLS, tiempo agotado) → conviene REINTENTAR con el mismo mensaje
//   otros 4xx → el servidor lo rechazó; reintentar no sirve (revisar token, deviceId o datos)
int redEnviarLectura(const String& json, const char* messageId);
