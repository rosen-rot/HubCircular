# 4. Reglas de Medición

Estas reglas implementan en el servidor las [reglas definidas para la solución 3](../../bitácora/semana_10/propuestas_de_solucion/solucion_3/4_registro_reglas.md). **Estado:** diseñadas, por construir junto con la recepción de lecturas (S7–S8).

## 4.1 Reparto de responsabilidades

| Hardware (ESP32) | Software (servidor) |
| :-- | :-- |
| Leer la celda de carga y esperar a que la lectura se **estabilice**. | Calcular la diferencia con la lectura anterior. |
| Enviar el peso solo si cambió, más un latido cada 30 s. | Decidir si es ingreso, retiro, ajuste o ruido. |
| Medir el nivel de llenado. | Mantener la tara y el acumulado. |

Así, si un umbral queda mal calibrado, se corrige en el servidor sin reprogramar el ESP32.

## 4.2 Dos niveles de dato

La plataforma distingue entre lo que **mide el sensor** y lo que **cuenta en los indicadores**:

| Nivel | Qué es | Dónde se ve |
| :-- | :-- | :-- |
| **Ingreso detectado** | Lo calcula el servidor desde las lecturas, en segundos y sin que nadie escriba nada. | Panel en vivo del contenedor. |
| **Pesaje confirmado** | Un ingreso detectado que un operador confirma (o un pesaje manual). Crea un lote y entra a los indicadores. | Tablero, lotes y trazabilidad. |

Esta separación viene del diseño de la plataforma (`app/docs/04`): una variación de peso no siempre es una bolsa nueva (alguien puede apoyarse en el contenedor o sacar algo), y los indicadores no deben contar dos veces la misma masa. **Por definir con el equipo:** si en la demo la confirmación es un clic del operador o si los ingresos detectados se confirman automáticamente.

## 4.3 Cálculo

```
acumulado = peso_total − tara                (fuente de verdad del contenido)
delta     = peso_total − peso de la última lectura válida
```

Solo se consideran lecturas con `quality = "stable"`. Las condiciones se evalúan **en este orden** y se aplica la primera que se cumpla:

| Condición | Resultado | Efecto |
| :-- | :-- | :-- |
| `messageId` ya recibido | duplicado | Se ignora. |
| \|delta\| < `UMBRAL_RUIDO_G` | ninguno | Se guarda la lectura, sin crear un evento. |
| acumulado < `UMBRAL_VACIO_G` **y** el anterior era ≥ `UMBRAL_VACIO_G` | **retiro detectado** | Se sugiere registrar el retiro (movimiento con destino) en la plataforma. |
| delta ≥ `UMBRAL_RUIDO_G` | **ingreso detectado** | Se muestra un ingreso de `delta` gramos, pendiente de confirmación. |
| delta ≤ −`UMBRAL_RUIDO_G` sin quedar vacío | ajuste | Se marca para revisión. |

Como el acumulado siempre se calcula desde `peso_total − tara`, el total del contenedor **no se desvía** aunque se pierda alguna lectura.

## 4.4 Parámetros iniciales

| Parámetro | Valor inicial | Se ajusta con |
| :-- | :-- | :-- |
| `UMBRAL_RUIDO_G` | 50 g | La variación real de la celda en reposo (prueba de calibración del hardware). |
| `UMBRAL_VACIO_G` | 100 g | El peso mínimo que se considera "contenedor vacío". |
| Intervalo de latido | 30 s | — |

Los valores son **provisionales** hasta medir el ruido real de la balanza.

## 4.5 Tara

* Se registra en la ficha del contenedor, con el contenedor vacío sobre la balanza.
* Después de un retiro, si el contenedor vuelve vacío, el acumulado queda cerca de 0 sin otra acción.

---

[← Volver al índice del MVP del software](README.md)
