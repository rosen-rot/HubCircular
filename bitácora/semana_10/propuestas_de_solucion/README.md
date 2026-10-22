# PROPUESTAS DE SOLUCIÓN

**Proyecto:** Gestión y Medición de Residuos Reciclables del Hub Providencia (Desafío 04 | Sostenibilidad)
**Equipo:** HubCircular
**Entidad Contraparte:** Municipalidad de Providencia / Hub Providencia

---

El equipo desarrolló **tres propuestas de solución** para medir y gestionar los residuos reciclables del Hub Providencia. Las tres comparten un mismo destino para los datos: un **dashboard web (página HTML)** al que acceden las personas del Hub para revisar los indicadores de reciclaje.

## Propuestas

| # | Propuesta | Cómo se mide | Estado |
| :-: | :-- | :-- | :-- |
| 1 | [Pesaje manual en el retiro con registro QR](solucion_1/README.md) | La persona encargada pesa los residuos al retirarlos y registra el pesaje escaneando un código QR. | Descartada |
| 2 | [Contenedores con sensor de conteo](solucion_2/README.md) | Un sensor en cada contenedor cuenta cada objeto que ingresa. | Descartada |
| 3 | [Contenedores con pesaje automático](solucion_3/README.md) | Cada contenedor está sobre una balanza que registra el peso de cada bolsa y el volumen ocupado. | ✅ **Seleccionada** |

## Comparación

| Criterio | 1. Pesaje manual + QR | 2. Sensor de conteo | 3. Pesaje automático |
| :-- | :-- | :-- | :-- |
| Dato principal | Peso total por retiro | Cantidad de objetos | Peso por bolsa y volumen |
| Exactitud de la medición | Media (depende de la persona) | Baja (no mide peso) | Alta |
| Frecuencia del dato | Solo en cada retiro | Continua | Continua (diaria y final) |
| Intervención humana | Alta | Baja | Baja |
| Costo y complejidad | Bajo | Medio | Medio |
| Integración con el dashboard | Manual (formulario QR) | Automática | Automática |

## Decisión

El equipo eligió la **solución 3: contenedores con pesaje automático**, porque entrega la medición más exacta (peso y volumen), registra los datos sin depender de que alguien recuerde pesar y permite analizar el ingreso diario y el ingreso final de residuos. El detalle técnico del sistema de pesaje se encuentra en la [semana 11](../../semana_11/8_sistema_pesaje_iot.md).

## Material de presentación

* [Pitch de 1 minuto](pitch/pitch_1_minuto.md)
* [Pitch de 3 minutos](pitch/pitch_3_minutos.md)
* [Guion visual de la presentación](pitch/guion_visual.md)

---

[← Volver al índice de la semana 10](../README.md)
