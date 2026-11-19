# 06 · Indicadores, fórmulas y oportunidades

**Principio:** medir solo lo que respalda el dato observado; definir período y alcance. Fechas presentadas en `America/Santiago`, conservadas en UTC.

| Indicador | Definición operativa | Precaución |
|---|---|---|
| Captación neta [kg] | Suma de `weighings.net_g` confirmados / 1000 del período | No sumar telemetría ni traslados |
| Despachos [kg] | Suma de salidas físicas de tipo despacho en período / 1000 | No representa reciclaje final demostrado |
| Reutilización efectiva [kg] | Movimientos completados y respaldados tipo REUSED / 1000 | No contar solo intención |
| Valorización confirmada [kg] | Masa despachada con evidencia/verificación validada, definida por fecha de despacho **o** confirmación y rotulada consistentemente | Nunca contar dos salidas |
| Rechazo [kg] | Movimientos de rechazo de flujo evaluado | Registrar evidencia/motivo cuando sea posible |
| Inventario [kg] | Saldo disponible por lote/ubicación en fecha de corte | No restar automáticamente retiros de otros períodos del total captado de solo un período |
| Cobertura [%] | Occurrencias de medición válidamente completadas / programadas ×100 | Cero confirmado es completo; ausente no es cero |
| Captación por jornada medida | Captación / número de jornadas efectivamente cubiertas | Comparabilidad depende del alcance y mismo material |
| Nivel estimado [%] | Valor geométrico derivado de distancia calibrada | Indicador aproximado, distinto del peso |

### Cierre contable
Para un **intervalo** de inventario: `stock_final = stock_inicial + captaciones + ajustes_positivos - salidas_finales - ajustes_negativos`, cuidando traslados internos que solo cambian ubicación. Un despacho de 9 kg de un lote de 12 kg deja saldo 3 kg, pero no significa que los 9 kg hayan sido reciclados.

### Reglas de oportunidad mínimas
1. Inventario de un material por encima de umbral y con antigüedad relevante → sugerir revisar frecuencia de retiro.
2. Registros esperados no completados → sugerir asignación/recordatorio a operador.
3. Alto rechazo/contaminación observada en zona (con base de datos suficiente) → mejorar señalética.
Cada alerta debe detallar umbral, registros de evidencia y fecha. No afirmar causalidad por una fluctuación aislada.

### No calcular sin datos adicionales
- Tasa de reciclaje/desvío global del edificio sin masa total de residuos comparables.
- CO₂ evitado sin metodología y factores documentados.
- Tasa de merma de laboratorios sin consumo de insumos; corresponde a eventual ampliación, no requisito del Desafío 04.

## Implementación en la Iteración 3 (`docs/25`)
- **Valorización confirmada:** se cuenta por la **fecha del despacho** (cierra H-06, decisión del usuario), nunca por la de la confirmación.
- **Cobertura:** `(realizado + cero confirmado) ÷ (realizado + cero confirmado + omitido)`; las mediciones de hoy están pendientes y no entran en el denominador. Cero confirmado es completo; ausente es omitido, no cero.
- **Cierre contable** mostrado y conciliado en pantalla; traslados como «entran/salen del ámbito».
- Siguen sin calcularse (sin datos o metodología): tasa de reciclaje global, CO₂ evitado, nivel estimado de IoT, reglas de oportunidad.
