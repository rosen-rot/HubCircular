# 4. Reglas de Medición

Estas reglas implementan en el servidor las [reglas definidas para la solución 3](../../bitácora/semana_10/propuestas_de_solucion/solucion_3/4_registro_reglas.md).

## 4.1 Reparto de responsabilidades

| Hardware (ESP32) | Software (servidor) |
| :-- | :-- |
| Leer la celda de carga y esperar a que la lectura se **estabilice**. | Calcular la diferencia con la lectura anterior. |
| Enviar el **peso total** solo si cambió, más un latido cada 30 s. | Decidir si es ingreso, retiro, ajuste o ruido. |
| Medir el nivel de llenado. | Mantener el acumulado y la tara. |

Así, si un umbral queda mal calibrado, se corrige en el servidor sin reprogramar el ESP32.

## 4.2 Cálculo

```
acumulado = peso_g − tara_g                 (fuente de verdad del contenido)
delta     = peso_g − peso_g de la última lectura válida
```

Las condiciones se evalúan **en este orden** y se aplica la primera que se cumpla:

| Condición | Evento | Efecto |
| :-- | :-- | :-- |
| Secuencia ya recibida | `duplicado` | Se ignora. |
| \|delta\| < `UMBRAL_RUIDO_G` | `ninguno` | Se guarda la lectura, pero no se crea un evento. |
| acumulado < `UMBRAL_VACIO_G` **y** el acumulado anterior era ≥ `UMBRAL_VACIO_G` | `retiro` | Se registra el retiro con el acumulado anterior (el **ingreso final**). |
| delta ≥ `UMBRAL_RUIDO_G` | `ingreso` | Se registra un ingreso de `delta` gramos. |
| delta ≤ −`UMBRAL_RUIDO_G` sin quedar vacío | `ajuste` | Se registra la baja (por ejemplo, si alguien sacó algo) para que el total cuadre. |

Como el acumulado siempre se calcula desde `peso_g − tara_g`, el total que muestra el dashboard **no se desvía** aunque se pierda alguna lectura.

## 4.3 Parámetros iniciales

| Parámetro | Valor inicial | Se ajusta con |
| :-- | :-- | :-- |
| `UMBRAL_RUIDO_G` | 50 g | La variación real de la celda en reposo (prueba de calibración del hardware). |
| `UMBRAL_VACIO_G` | 100 g | El peso mínimo que se considera "contenedor vacío". |
| Intervalo de latido | 30 s | — |

Los valores son **provisionales** hasta medir el ruido real de la balanza.

## 4.4 Tara

* Se registra con `POST /api/contenedores/{id}/tara`, con el contenedor vacío sobre la balanza.
* Después de un retiro, si el contenedor vuelve vacío, el acumulado queda cerca de 0 sin otra acción.

---

[← Volver al índice del MVP del software](README.md)
