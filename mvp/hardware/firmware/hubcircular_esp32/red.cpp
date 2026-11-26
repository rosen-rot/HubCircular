#include "red.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_random.h>
#include <time.h>
#include "certificados.h"
#include "config.h"

namespace {
unsigned long ultimoIntento = 0;
const char* RUTA = "/api/iot/v1/readings";
}  // namespace

// Diagnóstico al encender: ¿el ESP32 ve la red? (solo detecta redes de 2,4 GHz; si no aparece, suele estar en 5 GHz)
static void diagnosticarRed() {
  int n = WiFi.scanNetworks();
  bool vista = false;
  Serial.printf("[red] redes visibles (2,4 GHz): %d\n", n);
  for (int i = 0; i < n; i++) {
    bool esta = WiFi.SSID(i) == WIFI_SSID;
    vista |= esta;
    Serial.printf("[red]   %s\"%s\" canal %d, %d dBm, seguridad %d\n", esta ? "-> " : "   ", WiFi.SSID(i).c_str(),
                  WiFi.channel(i), WiFi.RSSI(i), (int)WiFi.encryptionType(i));
  }
  if (!vista) Serial.println("[red] AVISO: no veo la red configurada. ¿Está encendida y en 2,4 GHz? ¿El nombre es exacto?");
  WiFi.scanDelete();
}

void redIniciar() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  diagnosticarRed();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  ultimoIntento = millis();
  // Hora UTC por NTP: sirve para measuredAt. El servidor de todos modos registra su propia hora de recepción.
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.printf("[red] conectando a \"%s\"…\n", WIFI_SSID);
}

void redMantener() {
  static bool estabaConectada = false;
  bool ahora = WiFi.status() == WL_CONNECTED;
  if (ahora && !estabaConectada) {
    Serial.printf("[red] conectada. IP %s, señal %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else if (!ahora && estabaConectada) {
    Serial.println("[red] se perdió la conexión Wi-Fi");
  }
  estabaConectada = ahora;
  // 15 s entre intentos: una conexión puede tardar varios segundos y reintentar antes la interrumpe.
  if (!ahora && millis() - ultimoIntento >= 15000) {
    ultimoIntento = millis();
    // Estado: 1 = red no encontrada · 4 = falló (clave incorrecta) · 6 = desconectado/aún intentando
    Serial.printf("[red] sin conexión (estado %d). Reintentando…\n", (int)WiFi.status());
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }
}

bool redConectada() { return WiFi.status() == WL_CONNECTED; }

int redRssi() { return redConectada() ? WiFi.RSSI() : 0; }

bool redHoraIso(char* out, size_t len) {
  time_t t = time(nullptr);
  if (t < 1700000000) return false;  // antes de nov-2023 ⇒ el reloj no está sincronizado
  struct tm utc;
  gmtime_r(&t, &utc);
  strftime(out, len, "%Y-%m-%dT%H:%M:%SZ", &utc);
  return true;
}

void redNuevoUuid(char out[37]) {
  uint8_t b[16];
  esp_fill_random(b, sizeof b);  // RNG por hardware (aleatorio real con el Wi-Fi encendido)
  b[6] = (b[6] & 0x0F) | 0x40;    // versión 4
  b[8] = (b[8] & 0x3F) | 0x80;    // variante RFC 4122
  snprintf(out, 37, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
}

int redEnviarLectura(const String& json, const char* messageId) {
  if (!redConectada()) return -1;
  String url = String(SERVER_BASE_URL) + RUTA;
  bool https = url.startsWith("https://");

  WiFiClientSecure seguro;
  WiFiClient plano;
  HTTPClient http;
  http.setTimeout(10000);
  http.setConnectTimeout(8000);
  bool ok;
  if (https) {
    seguro.setCACert(ROOT_CA_PEM);  // se VALIDA el certificado del servidor (no usar setInsecure)
    ok = http.begin(seguro, url);
  } else {
    ok = http.begin(plano, url);    // solo para pruebas en red local
  }
  if (!ok) return -2;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.addHeader("Idempotency-Key", messageId);
  int code = http.POST(json);
  if (code >= 400) {
    // El cuerpo de error trae un código legible (p. ej. device_unauthenticated); no contiene secretos.
    Serial.printf("[red] HTTP %d: %s\n", code, http.getString().c_str());
  } else if (code <= 0) {
    Serial.printf("[red] error de conexión: %s\n", http.errorToString(code).c_str());
  }
  http.end();
  return code;
}
