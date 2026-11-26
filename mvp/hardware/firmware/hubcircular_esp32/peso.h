#pragma once
#include <Arduino.h>

// Balanza: HX711 + celda de carga. La calibración (cero de la plataforma VACÍA, sin contenedor, y factor)
// la guarda el sketch `calibracion` en la memoria no volátil (Preferences, espacio "balanza").
// Por eso el peso enviado es el BRUTO: contenedor + residuos. La tara del contenedor la conoce la plataforma.

enum class EstadoPeso { Estable, Moviendose, SinCalibrar, Error };

struct LecturaPeso {
  EstadoPeso estado;
  long gramos;  // válido solo si estado es Estable o Moviendose
};

void pesoIniciar(int pinDt, int pinSck);
// Hace una lectura (promedio de 10 muestras, ~100 ms) y actualiza la ventana de estabilidad.
LecturaPeso pesoLeer();
bool pesoCalibrada();
