# 2. Componentes y Estado

## 2.1 Componentes del MVP

| Componente | Cantidad | Función | Estado |
| :-- | :-- | :-- | :-- |
| ESP32 DevKit con shield y cable USB | 1 | Procesa las lecturas y las envía por Wi-Fi. | ✅ Recibido |
| Sensor ultrasónico (modelo por confirmar, se asume HC-SR04) | 1 | Nivel de llenado. | ✅ Recibido |
| Protoboard y cables Dupont | 1 set | Conexiones de prueba. | ✅ Recibido |
| **Celda de carga** | 1 | Mide el peso. | ⏳ Solicitada |
| **Módulo HX711** | 1 | Digitaliza la señal de la celda. | ⏳ Solicitado |
| Resistencias de 1 kΩ y 2 kΩ (o tres de 1 kΩ) | 1 + 1 | Divisor de voltaje para el ECHO del ultrasónico. | 🔎 Por conseguir |
| Contenedor | 1 | Recipiente de residuos. | 🔎 Por conseguir |
| Base y plataforma rígidas, tornillos y separadores | 1 set | Estructura de pesaje. | 🔎 Por fabricar |
| Masas de referencia | 3–4 | Calibración (por ejemplo: 0,5 kg, 1 kg, 2 kg y 5 kg). | 🔎 Por conseguir |
| Cargador USB de 5 V | 1 | Alimentación sin notebook (H7). | 🔎 Por conseguir |

## 2.2 Atención con el tipo de celda de carga

Bajo el nombre "celda de carga de 50 kg" se venden dos productos distintos:

| Tipo | Cables | ¿Sirve sola con el HX711? |
| :-- | :-- | :-- |
| **Celda de barra** (bloque de aluminio rectangular) | 4 (rojo, negro, verde, blanco) | ✅ Sí. Es la recomendada. |
| **Celda de medio puente** (la de las balanzas de baño, se vende de a 4) | 3 | ❌ No. Necesita 2 o 4 celdas y una placa combinadora. |

**Recomendación:** pedir una **celda de barra de 4 cables**. Para un contenedor de demostración, una celda de **20 kg** entrega mejor resolución que una de 50 kg. Una de 50 kg también funciona si es la que ya se pidió.

## 2.3 Componentes del kit que no se usan

LCD 1602 I2C, DHT11, RTC DS3231, módulo RGB, buzzer, LEDs externos, pulsadores, sensor de inclinación, potenciómetro y batería de 9 V. Quedan reservados para la fase 2.

---

[← Volver al índice del MVP del hardware](README.md)
