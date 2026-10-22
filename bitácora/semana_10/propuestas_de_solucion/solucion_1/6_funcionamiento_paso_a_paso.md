# 6. Funcionamiento paso a paso

## Caso ilustrativo: cartón en cowork

1. Los visitantes depositan cartón en un contenedor autorizado; **no** necesitan iniciar sesión cada vez.
2. Un operador autorizado pesa el material con una balanza.
3. Escanea el QR del contenedor: se identifica su zona y material esperado.
4. Registra peso bruto, tara y observaciones; el sistema calcula el neto.
5. Se crea un registro de medición y un lote con identificación única.
6. El lote se almacena y, posteriormente, puede trasladarse o retirarse total o parcialmente.
7. Una salida a un gestor se registra con cantidad, destino y evidencia disponible.
8. Solo si existe confirmación suficiente se clasifica el resultado como valorización verificada.
9. El dashboard actualiza métricas y propone acciones basadas en reglas.

**Ejemplo ficticio:** se capturan **12 kg de cartón**. Posteriormente se despachan **9 kg** y quedan **3 kg** en almacenamiento. Si el gestor aún no confirma el tratamiento, los indicadores muestran: 12 kg capturados, 9 kg despachados, 3 kg disponibles y valorización de esos 9 kg *pendiente de confirmación*. No se suman los 9 kg despachados a los 12 kg capturados como si fueran material nuevo.

## Estados / eventos de trazabilidad

| Evento | Significado | Efecto contable |
|---|---|---|
| `CAPTURED` | Pesaje ingresado | Aumenta captación e inventario |
| `TRANSFERRED` | Traslado interno | Cambia ubicación; no aumenta captación |
| `REUSED` | Reutilización efectiva | Reduce existencia; documenta reutilización |
| `DISPATCHED` | Salida hacia gestor | Reduce existencia; documenta salida |
| `RECOVERY_CONFIRMED` | Valorización respaldada | Cambia verificación; **no** vuelve a descontar existencia |
| `REJECTED` | Material descartado o rechazado | Se registra salida o reclasificación según caso |
| `ADJUSTED` | Corrección auditada | Modifica saldo con justificación |

Las salidas parciales se realizan sobre cantidades identificables de cada lote. Para el MVP convienen lotes homogéneos por material; si hay mezclas, deben segregarse o registrarse explícitamente como material no clasificable o rechazado.

---

[← Volver al índice de la solución 1](README.md)
