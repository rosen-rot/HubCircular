# 6. Simulador y Plan B

## 6.1 Para qué sirve el simulador

1. **Desarrollar sin esperar el hardware:** el software puede avanzar desde el 12 de noviembre.
2. **Probar las reglas:** genera secuencias conocidas, con ingresos, ruido, duplicados y retiros.
3. **Plan B en la feria:** si el sensor falla, la demo del software sigue funcionando.

## 6.2 Escenarios

| Escenario | Qué envía |
| :-- | :-- |
| `normal` | Bolsas de 0,3 a 2 kg cada pocos segundos hasta llenar el contenedor, y luego un retiro. |
| `ruido` | Pequeñas variaciones (±20 g) sin bolsas nuevas. Ninguna debe contarse como ingreso. |
| `duplicados` | Reenvía algunas secuencias. No deben duplicarse los eventos. |
| `perdida` | Omite lecturas intermedias. El acumulado debe seguir cuadrando. |

Ejemplo de uso:

```
python simulador/simulador.py --escenario normal --url http://127.0.0.1:8000
```

## 6.3 Plan B en la feria

| Falla | Plan B |
| :-- | :-- |
| La red Wi-Fi propia no funciona | Segundo hotspot (otro celular) con el mismo nombre de red y la misma contraseña. |
| El sensor falla | Se activa el simulador. El dashboard muestra **SIMULADO**. |
| Falla todo el equipo | Video fechado de una prueba real, presentado como video. |

> Un plan B no debe presentar como real lo que solo fue simulado. Por eso el origen se toma del dispositivo registrado y el dashboard lo muestra siempre.

---

[← Volver al índice del MVP del software](README.md)
