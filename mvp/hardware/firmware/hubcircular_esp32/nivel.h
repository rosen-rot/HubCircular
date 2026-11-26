#pragma once
#include <Arduino.h>

// Sensor ultrasónico HC-SR04: distancia al contenido y % de llenado estimado.
struct LecturaNivel {
  bool ok;              // false si no hubo eco o la distancia está fuera del contenedor (p. ej. tapa abierta)
  int distanciaMm;
  float llenadoPct;     // 0–100
};

void nivelIniciar(int pinTrig, int pinEcho, int distVacioMm, int distLlenoMm);
// Mediana de 5 mediciones (~300 ms).
LecturaNivel nivelLeer();
