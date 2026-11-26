# 8. Plan de Trabajo

Alineado con el [plan del curso para las últimas semanas](../../bitácora/semana_14/3_anuncios_feria.md#34-plan-para-las-próximas-semanas) y con el [plan del hardware](../hardware/8_plan_trabajo.md).

| Fecha | Hito del curso | Entregable del software | Estado |
| :-- | :-- | :-- | :-- |
| **12 nov** | Primer avance concreto | Definición del MVP del software. | ✅ Solo documentación; el código partió el 18 de noviembre |
| **19 nov** | Segundo avance | Plataforma web: sesión y roles, registro de pesajes, lotes, trazabilidad, tablero, descarga de datos y ayuda. Probada con datos ficticios. | ✅ Cumplido |
| **26 nov** | Tercer avance | S7–S10: recepción de lecturas, reglas, panel en vivo y simulador. Conexión con el ESP32 real. Pruebas P1, P2 y P3. | ⏳ |
| **1 dic** | Antes de la feria | Pruebas P4 y P5 en el hotspot de la feria. Ensayo del plan B (simulador y PostgreSQL local). Grabar el video fechado. | ⏳ |
| **3 dic** | Ensayo del pitch (mañana) y Feria Capstone (14:00–16:30) | Versión congelada: sin cambios el día de la feria. | ⏳ |
| **7 dic** | Informe final | Resultados de las pruebas, capturas y datos descargados de la feria. | ⏳ |
| **10 dic** | Evaluación ante comisión | Demo de la plataforma y del contenedor. | ⏳ |

## 8.1 Responsables

**Responsable del software:** Carlos Concha.

| Tarea | Responsable |
| :-- | :-- |
| Plataforma web, API y base de datos | Carlos Concha |
| Reglas de medición y panel en vivo | Carlos Concha |
| Simulador y pruebas | Carlos Concha |
| Integración con el ESP32 | Carlos Concha y Vicente Lizama |

## 8.2 Riesgos

| Riesgo | Mitigación |
| :-- | :-- |
| El hardware se atrasa | El simulador permite probar y demostrar la recepción de lecturas. |
| No hay internet en la feria para llegar a Supabase | PostgreSQL local en el notebook, probado antes del 1 de diciembre. |
| La red del lugar no permite la conexión | Hotspot propio en 2,4 GHz, probado en el campus antes de la feria. |
| El firewall de Windows bloquea al ESP32 | Abrir el puerto 3000 y probarlo antes del 26 de noviembre. |
| Umbrales mal calibrados | Se ajustan en el servidor y los ingresos se recalculan desde las lecturas guardadas. |
| La plataforma solo se probó por completo en Linux | Correr las pruebas de integración en el notebook de la feria con PostgreSQL local. |

---

[← Volver al índice del MVP del software](README.md)
