# 7. Validación

Se siguen los cinco pasos de validación vistos en la [clase 12](../../bitácora/semana_13/3_retroalimentacion_informes.md): función, indicador, criterio, prueba y evidencia.

| ID | Función | Indicador | Criterio de aceptación | Prueba | Evidencia |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **H-P1** | Medir el peso | Error respecto a la masa de referencia | Error ≤ ±20 g o ±2 % (el mayor) en el 95 % de las mediciones | 4 masas conocidas × 5 repeticiones = 20 mediciones | Tabla: masa, lectura, error |
| **H-P2** | Lectura estable | Deriva sin carga | Variación < 20 g en 30 minutos | Plataforma vacía durante 30 minutos | Registro de lecturas |
| **H-P3** | Estimar el llenado | Error respecto al nivel real | Error ≤ ±10 puntos porcentuales | 3 niveles conocidos × 5 repeticiones | Tabla: nivel real, nivel medido |
| **H-P4** | Recuperarse de un reinicio | Calibración conservada y tiempo de reconexión | Peso igual al de antes del reinicio (±20 g) y reconexión < 30 s | 5 desconexiones de la alimentación | Tabla de tiempos |
| **H-P5** | Detectar una bolsa | Bolsas detectadas / bolsas depositadas | 100 % de bolsas ≥ 100 g | 20 bolsas de peso conocido | Tabla y captura del dashboard |

Las pruebas de transmisión por Wi-Fi (tiempo de llegada y lecturas perdidas) son compartidas con el software: ver [P4 y P5](../software/7_validacion.md).

Los criterios son propuestos por el equipo y pueden ajustarse tras la primera prueba, justificando el cambio.

---

[← Volver al índice del MVP del hardware](README.md)
