#include "peso.h"
#include <HX711.h>        // Biblioteca "HX711 Arduino Library" (Bogdan Necula / bogde)
#include <Preferences.h>

namespace {
HX711 balanza;
bool calibrada = false;
float factor = 1.0f;   // cuentas por gramo
long cero = 0;         // lectura cruda con la plataforma vacía

constexpr int VENTANA = 4;          // 4 lecturas × 500 ms = 2 s
constexpr long ESTABLE_MAX_G = 20;  // variación máxima dentro de la ventana
constexpr long RUIDO_NEGATIVO_G = 50;

long ventana[VENTANA];
int llenas = 0;
int pos = 0;
}  // namespace

void pesoIniciar(int pinDt, int pinSck) {
  balanza.begin(pinDt, pinSck);
  Preferences prefs;
  prefs.begin("balanza", true);
  calibrada = prefs.getBool("calibrada", false);
  factor = prefs.getFloat("factor", 1.0f);
  cero = prefs.getLong("cero", 0);
  prefs.end();
  if (factor == 0.0f) calibrada = false;
  Serial.printf("[peso] calibrada=%s factor=%.4f cero=%ld\n", calibrada ? "si" : "no", factor, cero);
}

bool pesoCalibrada() { return calibrada; }

LecturaPeso pesoLeer() {
  if (!balanza.wait_ready_timeout(1000)) {
    llenas = 0;
    return {EstadoPeso::Error, 0};
  }
  long crudo = balanza.read_average(10);
  if (!calibrada) return {EstadoPeso::SinCalibrar, 0};

  long g = lroundf((crudo - cero) / factor);
  // Pequeños negativos son ruido alrededor de cero; negativos grandes indican un problema (o alguien levantando la plataforma).
  if (g < 0 && g > -RUIDO_NEGATIVO_G) g = 0;

  ventana[pos] = g;
  pos = (pos + 1) % VENTANA;
  if (llenas < VENTANA) llenas++;

  if (g < 0 || llenas < VENTANA) return {EstadoPeso::Moviendose, g};
  long mn = ventana[0], mx = ventana[0];
  for (int i = 1; i < VENTANA; i++) {
    mn = min(mn, ventana[i]);
    mx = max(mx, ventana[i]);
  }
  if (mx - mn >= ESTABLE_MAX_G) return {EstadoPeso::Moviendose, g};
  // Valor estable = promedio de la ventana (más estable que la última muestra sola).
  long suma = 0;
  for (int i = 0; i < VENTANA; i++) suma += ventana[i];
  return {EstadoPeso::Estable, lround((double)suma / VENTANA)};
}
