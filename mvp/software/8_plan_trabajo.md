# 8. Plan de Trabajo

Alineado con el [calendario de la Unidad 3](../../bitácora/semana_13/4_calendario_unidad3.md).

| Fecha | Hito del curso | Entregable del software | Demostración |
| :-- | :-- | :-- | :-- |
| **12 nov** | Primer avance demostrable | S1 + S2 + S5: API, base de datos y simulador. | El simulador envía lecturas y aparecen en una tabla web. |
| **19 nov** | Integración, pruebas y evidencias | S3 + S4 + conexión con el ESP32 real. Pruebas P1, P2 y P3. | Una bolsa real aparece en el dashboard. |
| **26 nov** | Ensayo de pitch y demostración | Pruebas P4 y P5 en la red de la feria. S6–S8 si hay tiempo. Guion de la demo. | Demo completa y ensayo del plan B. |
| **3 dic** | Feria Capstone | Versión final congelada (sin cambios el día de la feria). | Demo en vivo con el contenedor. |

## 8.1 Responsables

**Responsable del software:** Carlos Concha.

| Tarea | Responsable |
| :-- | :-- |
| API, reglas y base de datos | Carlos Concha |
| Dashboard | Carlos Concha |
| Simulador y pruebas | Carlos Concha |
| Integración con el ESP32 | Carlos Concha y Vicente Lizama |

## 8.2 Riesgos

| Riesgo | Mitigación |
| :-- | :-- |
| El hardware se atrasa | El simulador permite avanzar y demostrar el software. |
| La red del lugar no permite la conexión | Red propia (hotspot o router) y prueba en el lugar el 26 de noviembre. |
| El firewall de Windows bloquea al ESP32 | Abrir el puerto 8000 y probarlo antes del 19 de noviembre. |
| Umbrales mal calibrados | Se ajustan en el servidor y los eventos se recalculan desde las lecturas. |

---

[← Volver al índice del MVP del software](README.md)
