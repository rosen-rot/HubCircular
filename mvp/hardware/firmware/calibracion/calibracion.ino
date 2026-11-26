// HubCircular · calibración de la balanza (HX711 + celda de carga)
// Programa APARTE del firmware principal. Guarda el cero y el factor en la memoria no volátil del ESP32
// (Preferences "balanza"); el firmware principal los lee al encender. No hay que recalibrar después de un reinicio.
//
// Uso (Monitor serie a 115200 baudios, "Nueva línea"):
//   r            → lecturas crudas (diagnóstico de cableado: deben cambiar al presionar la celda)
//   z            → CERO: con la plataforma VACÍA (sin contenedor). Mide 30 lecturas.
//   c 1000       → FACTOR: con una masa conocida de 1000 g sobre la plataforma (use su valor real en gramos)
//   g            → GUARDAR cero y factor en la memoria del ESP32
//   p            → peso en gramos (para verificar con otras masas; enviar cualquier tecla para detener)
//   b            → borrar la calibración guardada
//
// Procedimiento completo y tabla de verificación: mvp/hardware/6_calibracion.md

#include <HX711.h>
#include <Preferences.h>

#define PIN_HX711_DT  19
#define PIN_HX711_SCK 18

HX711 balanza;
long cero = 0;
float factor = 0.0f;
bool hayCero = false;

void mostrarGuardado() {
  Preferences prefs;
  prefs.begin("balanza", true);
  Serial.printf("Guardado: calibrada=%s cero=%ld factor=%.4f\n", prefs.getBool("calibrada", false) ? "si" : "no",
                prefs.getLong("cero", 0), prefs.getFloat("factor", 0));
  prefs.end();
}

bool esperarListo() {
  if (balanza.wait_ready_timeout(2000)) return true;
  Serial.println("ERROR: el HX711 no responde. Revise VCC, GND, DT (GPIO 19) y SCK (GPIO 18).");
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  balanza.begin(PIN_HX711_DT, PIN_HX711_SCK);
  Serial.println("\n=== Calibración HubCircular ===");
  Serial.println("Comandos: r (crudo) · z (cero) · c <gramos> (factor) · g (guardar) · p (pesar) · b (borrar)");
  mostrarGuardado();
}

void loop() {
  if (!Serial.available()) return;
  String linea = Serial.readStringUntil('\n');
  linea.trim();
  if (linea.length() == 0) return;
  char cmd = linea.charAt(0);

  if (cmd == 'r') {
    if (!esperarListo()) return;
    for (int i = 0; i < 10; i++) {
      Serial.printf("crudo: %ld\n", balanza.read_average(5));
    }
  } else if (cmd == 'z') {
    if (!esperarListo()) return;
    Serial.println("Midiendo cero (plataforma vacía, sin tocar)…");
    cero = balanza.read_average(30);
    hayCero = true;
    Serial.printf("Cero = %ld. Ahora ponga una masa conocida y envíe: c <gramos>\n", cero);
  } else if (cmd == 'c') {
    if (!hayCero) { Serial.println("Primero mida el cero con: z"); return; }
    long gramos = linea.substring(1).toInt();
    if (gramos <= 0) { Serial.println("Indique la masa en gramos, por ejemplo: c 1000"); return; }
    if (!esperarListo()) return;
    Serial.printf("Midiendo con %ld g…\n", gramos);
    long conMasa = balanza.read_average(30);
    factor = (float)(conMasa - cero) / (float)gramos;
    if (fabsf(factor) < 0.5f) {
      Serial.println("La lectura casi no cambió con la masa: revise la celda (A+/A−, E+/E−) o el puente de la celda de 3 cables.");
      factor = 0;
      return;
    }
    // Un factor negativo solo indica que A+ y A− están invertidos; funciona igual.
    Serial.printf("Factor = %.4f cuentas/g. Verifique con 'p' y guarde con 'g'.\n", factor);
  } else if (cmd == 'g') {
    if (!hayCero || factor == 0.0f) { Serial.println("Falta medir cero (z) y factor (c <gramos>)."); return; }
    Preferences prefs;
    prefs.begin("balanza", false);
    prefs.putLong("cero", cero);
    prefs.putFloat("factor", factor);
    prefs.putBool("calibrada", true);
    prefs.end();
    Serial.println("Calibración guardada. Ya puede cargar el firmware principal (hubcircular_esp32).");
    mostrarGuardado();
  } else if (cmd == 'p') {
    if (!hayCero || factor == 0.0f) {
      // Permite verificar una calibración ya guardada.
      Preferences prefs;
      prefs.begin("balanza", true);
      cero = prefs.getLong("cero", 0);
      factor = prefs.getFloat("factor", 0);
      prefs.end();
      if (factor == 0.0f) { Serial.println("No hay calibración. Use z y c <gramos>."); return; }
      hayCero = true;
    }
    Serial.println("Pesando (envíe cualquier tecla para detener)…");
    while (!Serial.available()) {
      if (!esperarListo()) return;
      long g = lroundf((balanza.read_average(10) - cero) / factor);
      Serial.printf("%ld g\n", g);
      delay(400);
    }
    while (Serial.available()) Serial.read();
  } else if (cmd == 'b') {
    Preferences prefs;
    prefs.begin("balanza", false);
    prefs.clear();
    prefs.end();
    hayCero = false;
    factor = 0;
    Serial.println("Calibración borrada.");
  } else {
    Serial.println("Comando desconocido. Use r, z, c <gramos>, g, p o b.");
  }
}
