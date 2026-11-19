# 1. Objetivo y Alcance

## 1.1 Objetivo

Una **plataforma web** para registrar, dar trazabilidad y analizar los residuos reciclables del Hub, que además **reciba por Wi-Fi las lecturas del contenedor con balanza** y las muestre en vivo.

## 1.2 Qué ya está construido (al 19 de noviembre)

Probado con **datos ficticios** (etiquetados DEMO), no con mediciones reales del Hub.

| ID | Función | Descripción | Estado |
| :-- | :-- | :-- | :-- |
| **S1** | Inicio de sesión y roles | Administrador, operador y lector, cada uno con permisos distintos. Gestión de usuarios desde la interfaz. | ✅ Construido |
| **S2** | Registro de pesajes | Pesaje con bruto, tara y neto (el neto lo calcula el servidor). Cada pesaje crea un **lote**. | ✅ Construido |
| **S3** | Trazabilidad | Movimientos de cada lote (traslado, retiro, reutilización, rechazo, ajuste), destinos y evidencia. El saldo nunca queda negativo. | ✅ Construido |
| **S4** | Tablero de indicadores | Kg captados, despachados y en inventario, con filtros, cobertura de medición y "cero confirmado" (no medir no es lo mismo que cero). | ✅ Construido |
| **S5** | Descarga de datos | Excel con 4 hojas o una tabla en CSV, como evidencia para el informe. | ✅ Construido |
| **S6** | Ayuda | Página de ayuda con glosario e íconos (i) con explicaciones. | ✅ Construido |

## 1.3 Qué falta para la feria (debe estar listo el 26 de noviembre)

| ID | Función | Descripción |
| :-- | :-- | :-- |
| **S7** | Recibir lecturas del ESP32 | Endpoint `POST /api/iot/v1/readings`, autenticado con una clave por dispositivo (ver [API](3_api_datos.md)). |
| **S8** | Detectar ingresos | Convertir las lecturas de peso en ingresos y retiros sin doble conteo (ver [Reglas](4_reglas_medicion.md)). |
| **S9** | Panel en vivo | Estado del contenedor, conexión del sensor y últimas lecturas, actualizándose solo (ver [Dashboard](5_dashboard.md)). |
| **S10** | Simulador | Script que envía lecturas por la misma API, para probar sin hardware y servir de plan B (ver [Simulador](6_simulador_plan_b.md)). |

## 1.4 Qué queda fuera (fase 2)

* Códigos QR.
* Recomendaciones automáticas (reglas de oportunidad) y alertas.
* Varios contenedores con sensor.
* CO₂ evitado y valorización en pesos: requieren factores y precios validados.
* Publicación en internet para uso real del Hub.

> Para el pitch: *"el contenedor mide solo; la plataforma ordena, da trazabilidad y muestra los indicadores"*.

## 1.5 Supuestos

* El ESP32 envía el **peso estable**; el **servidor** decide si hubo un ingreso o un retiro (ver [Reglas de Medición](4_reglas_medicion.md) y el [firmware del ESP32](../hardware/4_firmware.md)).
* Las lecturas del sensor se guardan **separadas** de los pesajes confirmados, para que un dato del sensor nunca se cuente dos veces en los indicadores.

---

[← Volver al índice del MVP del software](README.md)
