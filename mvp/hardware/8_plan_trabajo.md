# 8. Plan de Trabajo y Riesgos

Alineado con el [calendario de la Unidad 3](../../bitácora/semana_13/4_calendario_unidad3.md) y con el [plan del software](../software/8_plan_trabajo.md).

La celda de carga y el HX711 **aún no llegan**, por lo que el plan parte con lo que ya está disponible.

| Fecha | Hito del curso | Entregable del hardware | Demostración |
| :-- | :-- | :-- | :-- |
| **12 nov** | Primer avance demostrable | Ultrasónico funcionando + ESP32 enviando por Wi-Fi a la API. | El nivel de llenado real aparece en el servidor. |
| **19 nov** | Integración, pruebas y evidencias | HX711 + celda calibrada (H-P1, H-P2). Montaje en el contenedor. | Una bolsa real aparece en el dashboard. |
| **26 nov** | Ensayo de pitch y demostración | Pruebas H-P3, H-P4 y H-P5. Alimentación USB sin notebook. | Demo completa en la red de la feria. |
| **3 dic** | Feria Capstone | Contenedor terminado y firmware congelado. | Demo en vivo. |

Mientras no llegue la celda, el ESP32 envía `peso_g` fijo con un **dispositivo de prueba** registrado como `simulador`, para que esos datos no se confundan con mediciones reales.

## 8.1 Responsables

**Responsable del hardware:** Vicente Lizama.

| Tarea | Responsable |
| :-- | :-- |
| Circuito y conexiones | Vicente Lizama |
| Firmware | Vicente Lizama |
| Estructura y montaje | Vicente Lizama |
| Calibración y pruebas | Vicente Lizama |
| Integración con la API | Vicente Lizama y Carlos Concha |

## 8.2 Riesgos

| Riesgo | Mitigación |
| :-- | :-- |
| La celda y el HX711 llegan tarde | Avanzar con el ultrasónico y el Wi-Fi; plan B con el simulador del software y un video fechado. Definir una fecha límite para comprarlos por cuenta propia. |
| La celda recibida es de medio puente (3 cables) | Revisarla apenas llegue; si lo es, conseguir una celda de barra o una placa combinadora. |
| Precisión insuficiente | Ajustar la estructura (que el peso pase solo por la celda) y repetir la calibración. |
| El hotspot está en 5 GHz | Configurarlo en 2,4 GHz. |
| Falso contacto en la protoboard durante la feria | Soldar las conexiones o usar una placa perforada para la versión final. |

---

[← Volver al índice del MVP del hardware](README.md)
