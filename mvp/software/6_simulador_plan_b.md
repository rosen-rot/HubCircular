# 6. Simulador y Plan B

**Estado:** por construir (S10), junto con la recepción de lecturas. Detalle de escenarios en [`app/docs/09-simulador-iot.md`](app/docs/09-simulador-iot.md).

## 6.1 Para qué sirve el simulador

1. **Desarrollar sin esperar el hardware:** el software puede probar la recepción de lecturas antes de que la balanza esté calibrada.
2. **Probar las reglas:** genera secuencias conocidas, con ingresos, ruido, duplicados y retiros.
3. **Plan B en la feria:** si el sensor falla, la demo del software sigue funcionando.

## 6.2 Escenarios

| Escenario | Qué envía | Resultado esperado |
| :-- | :-- | :-- |
| `normal` | Bolsas de 0,3 a 2 kg cada pocos segundos hasta llenar el contenedor, y luego un retiro. | Un ingreso detectado por bolsa y un retiro al final. |
| `ruido` | Pequeñas variaciones (±20 g) sin bolsas nuevas. | Ningún ingreso. |
| `repetido` | El mismo peso estable cada 10 s. | No suma kilos de más. |
| `duplicados` | Reenvía algunos mensajes con el mismo `messageId`. | Una sola lectura guardada. |
| `perdida` | Omite lecturas intermedias. | El acumulado sigue cuadrando. |
| `error` | `weightGrams` nulo con `quality = sensor_error`. | Se muestra el error, sin inventar un cero. |

Será un script Node/TypeScript dentro de `app/scripts/`, con la clave del dispositivo de prueba en `.env.local`. Ejemplo de uso previsto:

```
npm run iot:simulate -- --escenario normal --url http://127.0.0.1:3000
```

## 6.3 Plan B en la feria

| Falla | Plan B |
| :-- | :-- |
| La red Wi-Fi propia no funciona | Segundo hotspot (otro celular) con el mismo nombre de red y la misma contraseña. |
| No hay internet para llegar a Supabase | PostgreSQL local en el notebook, con los mismos datos de la demo. |
| El sensor falla | Se activa el simulador. El dashboard muestra **SIMULADO**. |
| Falla todo el equipo | Video fechado de una prueba real, presentado como video, en un segundo notebook. |

> Un plan B no debe presentar como real lo que solo fue simulado. Por eso el origen se toma del dispositivo registrado y el dashboard lo muestra siempre.

---

[← Volver al índice del MVP del software](README.md)
