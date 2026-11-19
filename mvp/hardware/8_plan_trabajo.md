# 8. Plan de Trabajo y Riesgos

Alineado con el [plan del curso para las últimas semanas](../../bitácora/semana_14/3_anuncios_feria.md#34-plan-para-las-próximas-semanas) y con el [plan del software](../software/8_plan_trabajo.md).

Al 19 de noviembre **todos los componentes llegaron**, pero el hardware todavía no está montado ni probado.

| Fecha | Hito del curso | Entregable del hardware | Estado |
| :-- | :-- | :-- | :-- |
| **12 nov** | Primer avance concreto | Definición del MVP del hardware y compra de componentes. | ✅ Solo documentación y compras |
| **19 nov** | Segundo avance | Componentes recibidos. ESP32 con programa de prueba funcionando por USB. | ✅ Cumplido (sin montaje) |
| **26 nov** | Tercer avance | HX711 soldado, celda de 3 cables identificada y puente completado, balanza calibrada (H-P1, H-P2). ESP32 enviando lecturas por Wi-Fi a la plataforma. Montaje en el contenedor. | ⏳ |
| **1 dic** | Antes de la feria | Ultrasónico (H-P3), reinicios (H-P4) y 20 bolsas (H-P5). Alimentación USB sin notebook. Video fechado de una prueba real. | ⏳ |
| **3 dic** | Ensayo del pitch (mañana) y Feria Capstone (14:00–16:30) | Contenedor terminado y firmware congelado. | ⏳ |
| **7 dic** | Informe final | Tablas de calibración y pruebas, fotos del montaje. | ⏳ |
| **10 dic** | Evaluación ante comisión | Demo del contenedor. | ⏳ |

Mientras la balanza no esté calibrada, los envíos de prueba se hacen con un **dispositivo registrado como `simulador`**, para que esos datos no se confundan con mediciones reales.

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
| El montaje se atrasa | Fecha límite: balanza funcionando el 26 de noviembre. Si no, plan B con el simulador y el ultrasónico real. |
| La celda recibida es de medio puente (3 cables) | Medirla con multímetro y completar el puente con resistencias; si la precisión no alcanza, comprar una segunda celda o una de barra (ver [Componentes](2_componentes_estado.md#22-la-celda-recibida-tiene-3-cables)). |
| Precisión insuficiente | Ajustar la estructura (que el peso pase solo por la celda) y repetir la calibración. |
| El hotspot está en 5 GHz | Configurarlo en 2,4 GHz. |
| Falso contacto en la protoboard durante la feria | Soldar las conexiones o usar una placa perforada para la versión final. |

---

[← Volver al índice del MVP del hardware](README.md)
