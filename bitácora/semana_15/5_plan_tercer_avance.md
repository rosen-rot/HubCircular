# 5. Plan para el Tercer Avance (26 de noviembre)

**Meta:** dejar el prototipo operativo. Una bolsa depositada en el contenedor debe aparecer en la plataforma como un ingreso en kg, enviado por Wi-Fi, con las primeras pruebas registradas.

## 5.1 Mejoras técnicas de esta semana

| # | Tarea | Responsable | Listo cuando… |
| :-- | :-- | :-- | :-- |
| 1 | Soldar los pines del HX711. | Vicente Lizama | El HX711 entrega lecturas estables al ESP32. |
| 2 | Identificar los cables de la celda y completar el puente. | Vicente Lizama | La lectura sube al cargar la celda y vuelve a cero al descargarla. |
| 3 | Calibrar la balanza con masas conocidas. | Vicente Lizama | Pruebas H-P1 y H-P2 registradas. |
| 4 | Montar la celda bajo el contenedor. | Vicente Lizama | El peso pasa solo por la celda. |
| 5 | Acordar los detalles del contrato (peso total o neto, identificador de cada mensaje y señal Wi-Fi). | Vicente Lizama y Carlos Concha | Contrato actualizado en la [API](../../mvp/software/3_api_datos.md). |
| 6 | Construir la recepción de lecturas (`POST /api/iot/v1/readings`) y las reglas de ingreso y retiro. | Carlos Concha | Pruebas P1, P2 y P3 aprobadas con el simulador. |
| 7 | Construir el panel en vivo y el simulador. | Carlos Concha | El simulador envía lecturas y aparecen en el panel con la etiqueta SIMULADO. |
| 8 | Conectar el ESP32 por Wi-Fi a la plataforma. | Vicente Lizama y Carlos Concha | Una bolsa real aparece en el panel. |
| 9 | Decidir si los ingresos del sensor se confirman con un clic o automáticamente. | Todo el equipo | Decisión registrada en las [reglas de medición](../../mvp/software/4_reglas_medicion.md). |
| 10 | Actualizar el pitch con la arquitectura real y los tiempos oficiales del curso. | Fernanda López y Vicente Lizama | Guion ajustado a los bloques 0:40 / 1:40 / 3:20 / 4:20 / 5:00. |
| 11 | Registrar la evidencia de cada prueba (tablas, fotos y video). | Débora Cáceres | Evidencia guardada en `assets/` de la semana 16. |

## 5.2 Después del tercer avance (antes de la feria)

* Pruebas P4 y P5 en el hotspot que se usará en la feria, y pruebas H-P3, H-P4 y H-P5.
* Ensayo del plan B: simulador y base de datos local en el notebook, sin internet.
* Grabar un **video fechado** de una prueba real.

---

[← Volver al índice de la semana 15](README.md)
