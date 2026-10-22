# 4. Registro y Reglas de Medición

## Datos de cada registro

| Dato | Ejemplo |
| :-- | :-- |
| Contenedor y ubicación | Contenedor PLA, piso 2 |
| Material | PLA |
| Peso de la bolsa | 1,4 kg |
| Peso acumulado | 6,8 kg |
| Volumen ocupado | 55 % |
| Fecha y hora | 22-10-2026 15:20 |

## Reglas para una medición confiable

* **Estabilización:** el peso se registra solo cuando la lectura se mantiene estable durante unos segundos, para no contar el movimiento al depositar la bolsa.
* **Sin doble conteo:** cada registro guarda solo la **diferencia** de peso respecto a la lectura anterior, de modo que un mismo residuo no se cuente varias veces.
* **Umbral mínimo:** variaciones muy pequeñas (ruido de la celda) no se registran como ingreso.
* **Retiro:** una caída grande de peso se interpreta como retiro; se guarda el ingreso final y se toma una nueva tara.
* **Calibración periódica:** la balanza se verifica con pesos de referencia antes del piloto y de forma periódica.

---

[← Volver al índice de la solución 3](README.md)
