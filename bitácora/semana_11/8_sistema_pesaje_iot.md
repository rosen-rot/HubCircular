# 8. Solución: Sistema de Pesaje IoT

El equipo concluyó que **no es obligatorio comprar una balanza digital**: con una **celda de carga**, un **módulo HX711** y un **ESP32** es posible construir una balanza inteligente propia para HubCircular.

## 8.1 Funcionamiento

```
Residuos sobre plataforma → Celda de carga → HX711 → ESP32 → Wi-Fi → HubCircular
```

* **Celda de carga:** mide la fuerza que ejerce el peso de los residuos.
* **Módulo HX711:** digitaliza la señal de la celda.
* **ESP32:** calcula el peso mediante calibración y envía la medición automáticamente a HubCircular por Wi-Fi.

## 8.2 Comparación de Alternativas

| Característica | Balanza digital | Celda de carga + ESP32 |
| :-- | :-- | :-- |
| Medición de peso | Sí | Sí |
| Envío automático de datos | No necesariamente | Sí |
| Requiere programación | No | Sí |
| Requiere calibración propia | Generalmente no | Sí |
| Integración con HubCircular | Manual, salvo modelo compatible | Automática |
| Facilidad de implementación | Alta | Media |

## 8.3 Decisión del Equipo

* Al ser un proyecto de Ingeniería Informática, la celda de carga con ESP32 permite **integrar hardware, software y comunicación IoT** en una sola solución.
* La balanza comercial **puede eliminarse de la solicitud** si el equipo construye su propio sistema de pesaje y cuenta con tiempo para calibrarlo y validar su precisión.
* Si se necesitan mediciones confiables desde el primer día del piloto, conviene **mantener una balanza comercial como referencia**.

## 8.4 Requisitos Adicionales

* Plataforma rígida de pesaje y estructura de soporte.
* Alimentación eléctrica adecuada.
* Pesos de referencia para la calibración.
* Celda con capacidad y montaje compatibles con el peso de los residuos.

## 8.5 Idea de Evolución: Estación de Reciclaje Inteligente

El contenedor permanecería sobre la plataforma de pesaje y el ESP32 enviaría automáticamente las mediciones a HubCircular. Esto permitiría un prototipo IoT más integrado, aunque requiere controlar **cuándo se registra el peso** para no contabilizar varias veces el mismo residuo.

---

[← Volver al índice de la semana 11](README.md)
