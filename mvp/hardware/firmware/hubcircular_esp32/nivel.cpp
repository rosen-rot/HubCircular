#include "nivel.h"

namespace {
int trig, echo, vacio, lleno;

int medirMm() {
  digitalWrite(trig, LOW);
  delayMicroseconds(4);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  unsigned long us = pulseIn(echo, HIGH, 30000UL);  // máx. ~5 m
  if (us == 0) return -1;
  return (int)(us * 0.343f / 2.0f);  // velocidad del sonido ≈ 0,343 mm/µs (ida y vuelta)
}
}  // namespace

void nivelIniciar(int pinTrig, int pinEcho, int distVacioMm, int distLlenoMm) {
  trig = pinTrig;
  echo = pinEcho;
  vacio = distVacioMm;
  lleno = distLlenoMm;
  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);
  digitalWrite(trig, LOW);
}

LecturaNivel nivelLeer() {
  int m[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    int d = medirMm();
    if (d > 0) m[n++] = d;
    delay(60);  // evita que el eco anterior se lea como el siguiente
  }
  if (n < 3) return {false, 0, 0};
  // Mediana (ordenamiento por inserción, n ≤ 5).
  for (int i = 1; i < n; i++)
    for (int j = i; j > 0 && m[j - 1] > m[j]; j--) {
      int t = m[j]; m[j] = m[j - 1]; m[j - 1] = t;
    }
  int d = m[n / 2];
  // Fuera del rango del contenedor (tapa abierta, mano encima, etc.): no se inventa un porcentaje.
  if (d > vacio + 50 || d < 20) return {false, d, 0};
  float pct = (float)(vacio - d) * 100.0f / (float)(vacio - lleno);
  pct = constrain(pct, 0.0f, 100.0f);
  return {true, d, pct};
}
