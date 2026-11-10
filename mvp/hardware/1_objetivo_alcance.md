# 1. Objetivo y Alcance

## 1.1 Objetivo

Construir un **contenedor inteligente** que mida el peso de los residuos, estime su nivel de llenado y envíe ambas mediciones por **Wi-Fi** al [software de HubCircular](../software/README.md).

## 1.2 Qué incluye el MVP (debe estar listo)

| ID | Función | Descripción |
| :-- | :-- | :-- |
| **H1** | Medir el peso | Celda de carga + HX711, calibrada con masas conocidas. |
| **H2** | Estabilizar la lectura | El ESP32 solo informa el peso cuando la lectura se mantiene estable. |
| **H3** | Estimar el llenado | Sensor ultrasónico en la tapa del contenedor, convertido a porcentaje. |
| **H4** | Enviar por Wi-Fi | `POST` a la [API de lecturas](../software/3_api_datos.md) cada vez que cambia el peso, más un latido cada 30 s. |
| **H5** | Contenedor físico | Contenedor sobre una plataforma rígida que transmite el peso a la celda. |

## 1.3 Qué incluye si queda tiempo

| ID | Función |
| :-- | :-- |
| **H6** | LED de estado (el LED integrado del ESP32 basta): conectado, enviando o sin Wi-Fi. |
| **H7** | Alimentación con un cargador USB de 5 V, sin depender del notebook. |

## 1.4 Qué queda fuera (fase 2)

* Pantalla LCD 1602, DHT11, RTC DS3231, módulo RGB, buzzer, sensor de inclinación y potenciómetro.
* Batería de 9 V (dura poco con el ESP32 conectado a Wi-Fi; se usa USB).
* HTTPS y varios contenedores.

## 1.5 Decisiones compartidas con el software

| Tema | Decisión |
| :-- | :-- |
| **Plataforma web** | Python + FastAPI + SQLite en un servidor local (reemplaza la propuesta anterior con Next.js y Supabase). |
| **Ingresos y retiros** | El ESP32 envía el **peso total estable**; el **servidor** decide si hubo un ingreso o un retiro (ver [Reglas de Medición](../software/4_reglas_medicion.md)). El retiro se detecta automáticamente cuando el contenedor queda vacío. |
| **Fecha y hora** | Las asigna el servidor, por lo que el RTC no es necesario. |
| **Tara del contenedor** | La guarda el servidor. El ESP32 **no hace tara al encender** (ver [Firmware](4_firmware.md)). |

---

[← Volver al índice del MVP del hardware](README.md)
