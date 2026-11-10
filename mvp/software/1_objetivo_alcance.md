# 1. Objetivo y Alcance

## 1.1 Objetivo

Recibir por Wi-Fi las lecturas del contenedor con balanza, convertirlas en **ingresos y retiros en kg** y mostrarlas en un **dashboard que se actualiza solo**.

## 1.2 Qué incluye el MVP (debe estar listo)

| ID | Función | Descripción |
| :-- | :-- | :-- |
| **S1** | Recibir lecturas | Endpoint `POST /api/lecturas` que recibe el peso estable y el nivel de llenado enviados por el ESP32. |
| **S2** | Guardar los datos | Base de datos SQLite con contenedores, dispositivos, lecturas y eventos. |
| **S3** | Reglas de medición | Calcular ingresos y retiros sin doble conteo y descartar el ruido de la celda. |
| **S4** | Dashboard | Página web con el estado del contenedor, los kg por día, el historial y la conexión del sensor en vivo. |
| **S5** | Simulador | Script que envía lecturas por la misma API, para desarrollar sin hardware, probar las reglas y servir de plan B. |

## 1.3 Qué incluye si queda tiempo

| ID | Función |
| :-- | :-- |
| **S6** | Exportar eventos a CSV, como evidencia para los anexos del informe. |
| **S7** | Aviso visual cuando el contenedor supera el 80 % de llenado. |
| **S8** | Peso promedio por bolsa. |

## 1.4 Qué queda fuera (fase 2)

* Inicio de sesión y roles.
* Varios contenedores, pisos o edificios (el modelo de datos ya lo permite, pero no se muestra).
* Códigos QR, lotes y trazabilidad hacia el gestor.
* Recomendaciones automáticas y tendencias semanales o mensuales.
* Publicación en internet.

> Para el pitch: *"el MVP mide y muestra; la fase 2 gestiona y recomienda"*.

## 1.5 Supuestos

* El ESP32 envía el **peso total sobre la balanza** solo cuando la lectura está estable; el **servidor** calcula ingresos y retiros (ver [Reglas de Medición](4_reglas_medicion.md) y el [firmware del ESP32](../hardware/4_firmware.md)).
* El servidor y el ESP32 están en la **misma red Wi-Fi** (ver [Arquitectura y Red Local](2_arquitectura.md)).

---

[← Volver al índice del MVP del software](README.md)
