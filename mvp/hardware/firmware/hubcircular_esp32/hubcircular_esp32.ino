// HubCircular · firmware del contenedor (ESP32 + HX711 + HC-SR04)
// Envía lecturas a la plataforma: POST /api/iot/v1/readings (contrato docs/04 v1, ver mvp/hardware/4_firmware.md).
//
// Requisitos (Arduino IDE):
//   · Placa: "ESP32 Dev Module" (núcleo esp32 de Espressif 3.x)
//   · Biblioteca: "HX711 Arduino Library" de Bogdan Necula (Gestor de bibliotecas)
//   · Copiar config.example.h como config.h y completar Wi-Fi, URL, DEVICE_ID y DEVICE_TOKEN
//   · Calibrar antes con el sketch ../calibracion (guarda cero y factor en la memoria del ESP32)
//
// LED integrado: parpadeo rápido = sin Wi-Fi · encendido = conectado · apagado breve = lectura enviada
//                parpadeo lento = el servidor rechazó la lectura (revisar Monitor serie: token, deviceId…)

#include "config.h"
#include "nivel.h"
#include "peso.h"
#include "red.h"

#define FIRMWARE_VERSION "1.0.0"

// (Sin namespace anónimo: el IDE de Arduino genera prototipos fuera de él y provocaría llamadas ambiguas.)
constexpr unsigned long PERIODO_MS = 500;        // lectura de la balanza
constexpr unsigned long LATIDO_MS = 30000;       // envío aunque no haya cambios ("sigo vivo")
constexpr long CAMBIO_MIN_G = 50;                // igual al umbral de ruido de la plataforma
constexpr unsigned long REINTENTO_MAX_MS = 60000;

unsigned long ultimaLectura = 0;
unsigned long ultimoEnvio = 0;
long ultimoPesoEnviado = -1000000;
bool rechazado = false;

// Lectura pendiente de envío: si falla por red o por el servidor, se reintenta con el MISMO messageId,
// así la plataforma descarta el duplicado si en realidad sí había llegado.
struct Pendiente {
  bool hay = false;
  String json;
  char id[37];
  long peso;
  unsigned long proximoIntento = 0;
  unsigned long espera = 2000;
} pendiente;

static const char* calidadTexto(EstadoPeso e) {
  switch (e) {
    case EstadoPeso::Estable: return "stable";
    case EstadoPeso::Moviendose: return "unstable";
    case EstadoPeso::SinCalibrar: return "uncalibrated";
    default: return "sensor_error";
  }
}

static void prepararLectura(const LecturaPeso& p) {
  char id[37];
  redNuevoUuid(id);
  char hora[25];
  // measuredAt es OBLIGATORIO en el contrato: sin hora NTP no se genera la lectura (se reintenta en la próxima vuelta).
  if (!redHoraIso(hora, sizeof hora)) {
    static unsigned long ultimoAviso = 0;
    if (millis() - ultimoAviso > 10000) {
      ultimoAviso = millis();
      Serial.println("[hora] esperando sincronización NTP para poder enviar…");
    }
    return;
  }

  LecturaNivel n = {false, 0, 0};
#if USAR_ULTRASONICO
  // Con error de la balanza el contrato exige que TODOS los valores vayan en null.
  if (p.estado != EstadoPeso::Error) n = nivelLeer();
#endif

  // Solo se envía un peso si es confiable; con error o sin calibrar va null (no se inventa un cero).
  bool conPeso = (p.estado == EstadoPeso::Estable || p.estado == EstadoPeso::Moviendose) && p.gramos >= 0;

  String j;
  j.reserve(320);
  j += "{\"schemaVersion\":1,\"deviceId\":\"" DEVICE_ID "\",\"messageId\":\"";
  j += id;
  j += "\",\"measuredAt\":";
  j += "\"";
  j += hora;
  j += "\"";
  j += ",\"weightGrams\":";
  j += conPeso ? String(p.gramos) : String("null");
  j += ",\"distanceMm\":";
  j += n.ok ? String(n.distanciaMm) : String("null");
  j += ",\"fillPercent\":";
  j += n.ok ? String(n.llenadoPct, 1) : String("null");
  j += ",\"quality\":\"";
  j += (p.estado == EstadoPeso::Moviendose && !conPeso) ? "unstable" : calidadTexto(p.estado);
  // El contrato v1 es estricto (campos extra → 400): la señal Wi-Fi solo se muestra por Serial.
  j += "\",\"firmwareVersion\":\"" FIRMWARE_VERSION "\"}";

  pendiente.hay = true;
  pendiente.json = j;
  memcpy(pendiente.id, id, sizeof id);
  pendiente.peso = conPeso ? p.gramos : ultimoPesoEnviado;
  pendiente.proximoIntento = 0;
  pendiente.espera = 2000;
  ultimoEnvio = millis();  // el latido cuenta desde que se generó la lectura
}

static void intentarEnvio() {
  if (!pendiente.hay || millis() < pendiente.proximoIntento || !redConectada()) return;
  int code = redEnviarLectura(pendiente.json, pendiente.id);
  if (code >= 200 && code < 300) {
    Serial.printf("[envio] OK %d · Wi-Fi %d dBm · %s\n", code, redRssi(), pendiente.json.c_str());
    ultimoPesoEnviado = pendiente.peso;
    pendiente.hay = false;
    rechazado = false;
    digitalWrite(PIN_LED, LOW);  // destello de confirmación
    delay(80);
  } else if (code == 429 || code >= 500 || code <= 0) {
    pendiente.proximoIntento = millis() + pendiente.espera;
    Serial.printf("[envio] reintento en %lu s (código %d)\n", pendiente.espera / 1000, code);
    pendiente.espera = min(pendiente.espera * 2, REINTENTO_MAX_MS);
  } else {
    // 400/401/403/409: reintentar no lo arregla. Se descarta y se avisa con el LED.
    Serial.printf("[envio] RECHAZADA (%d). Revise DEVICE_ID/DEVICE_TOKEN en config.h o el formato.\n", code);
    pendiente.hay = false;
    rechazado = true;
  }
}

static void actualizarLed() {
  unsigned long t = millis();
  if (!redConectada()) digitalWrite(PIN_LED, (t / 150) % 2);       // rápido: sin Wi-Fi
  else if (rechazado) digitalWrite(PIN_LED, (t / 1000) % 2);       // lento: rechazo del servidor
  else digitalWrite(PIN_LED, HIGH);                                // fijo: todo bien
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\nHubCircular firmware %s · dispositivo %s\n", FIRMWARE_VERSION, DEVICE_ID);
  pinMode(PIN_LED, OUTPUT);
#if USAR_BALANZA
  pesoIniciar(PIN_HX711_DT, PIN_HX711_SCK);
  if (!pesoCalibrada()) Serial.println("[peso] AVISO: balanza sin calibrar. Cargue el sketch 'calibracion' primero.");
#endif
#if USAR_ULTRASONICO
  nivelIniciar(PIN_US_TRIG, PIN_US_ECHO, NIVEL_DIST_VACIO_MM, NIVEL_DIST_LLENO_MM);
#endif
  redIniciar();
}

void loop() {
  redMantener();
  actualizarLed();

  if (millis() - ultimaLectura >= PERIODO_MS) {
    ultimaLectura = millis();
#if USAR_BALANZA
    LecturaPeso p = pesoLeer();
#else
    LecturaPeso p = {EstadoPeso::SinCalibrar, 0};
#endif
    bool latido = millis() - ultimoEnvio >= LATIDO_MS;
    bool cambio = p.estado == EstadoPeso::Estable && labs(p.gramos - ultimoPesoEnviado) >= CAMBIO_MIN_G;
    // Mientras haya una lectura pendiente no se genera otra (se reintenta la misma).
    if (!pendiente.hay && (cambio || latido)) prepararLectura(p);
  }

  intentarEnvio();
}
