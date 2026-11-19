# 2. Componentes y Estado

**Estado al 19 de noviembre de 2026.**

## 2.1 Componentes del MVP

| Componente | Cantidad | Función | Estado |
| :-- | :-- | :-- | :-- |
| ESP32-WROOM-32D DevKit con shield y cable USB | 1 | Procesa las lecturas y las envía por Wi-Fi. | ✅ Recibido. Programa de prueba cargado: responde por el monitor serie. Wi-Fi sin probar. |
| Sensor ultrasónico (modelo por confirmar, se asume HC-SR04) | 1 | Nivel de llenado. | ✅ Recibido, sin conectar ni probar. |
| Protoboard y cables Dupont | 1 set | Conexiones de prueba. | ✅ Recibido |
| **Celda de carga "50 kg"** | 1 | Mide el peso. | ✅ Recibida. **Tiene 3 cables** (rojo, negro, blanco): probablemente es de medio puente (ver 2.2). Sin medir. |
| **Módulo HX711** | 1 | Digitaliza la señal de la celda. | ✅ Recibido. **Pines por soldar.** Sin prueba eléctrica. |
| Resistencias de 1 kΩ | Varias | Divisor de voltaje para el ECHO del ultrasónico y, posiblemente, completar el puente de la celda. | 🛒 Compradas el 18 de noviembre, por confirmar su retiro y sus valores reales. |
| Contenedor | 1 | Recipiente de residuos. | ✅ Disponible |
| Base y plataforma rígidas, tornillos y separadores | 1 set | Estructura de pesaje. | ✅ Disponible |
| Masas de referencia | 3–4 | Calibración (por ejemplo: 0,5 kg, 1 kg, 2 kg y 5 kg). | ✅ Disponible |
| Cargador USB de 5 V | 1 | Alimentación sin notebook (H7). | ✅ Disponible |

## 2.2 La celda recibida tiene 3 cables

Bajo el nombre "celda de carga de 50 kg" se venden dos productos distintos:

| Tipo | Cables | ¿Sirve sola con el HX711? |
| :-- | :-- | :-- |
| **Celda de barra** (bloque de aluminio rectangular) | 4 (rojo, negro, verde, blanco) | ✅ Sí. |
| **Celda de medio puente** (la de las balanzas de baño, se vende de a 4) | 3 | ❌ No directamente. Hay que completar el puente. |

La celda que llegó tiene **3 cables**, así que lo más probable es que sea de medio puente. Antes de conectarla:

1. **Medir con el multímetro** la resistencia entre cada par de cables, para identificar cuál es el central (la salida de señal).
2. Elegir cómo completar el puente:

| Opción | Ventaja | Desventaja |
| :-- | :-- | :-- |
| Completar con **2 resistencias iguales** (por ejemplo, 1 kΩ) | Se puede hacer con lo que ya se compró. | Menos precisión y más deriva por temperatura. Hay que comprobarlo con la calibración. |
| Comprar una **segunda celda igual** y armar el puente con las dos | Mejor precisión. | Requiere comprar y repartir el peso entre dos celdas. |
| Cambiarla por una **celda de barra de 4 cables** | Conexión directa con el HX711. | Requiere comprar otra celda. |

El objetivo de capacidad del equipo es **50 kg**. La precisión real se conocerá solo con la [calibración](6_calibracion.md) y la prueba [H-P1](7_validacion.md).

## 2.3 Componentes del kit que no se usan

LCD 1602 I2C, DHT11, RTC DS3231, módulo RGB, buzzer, LEDs externos, pulsadores, sensor de inclinación, potenciómetro y batería de 9 V. Quedan reservados para la fase 2.

---

[← Volver al índice del MVP del hardware](README.md)
