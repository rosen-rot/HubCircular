# 2. Funcionamiento Paso a Paso

1. El contenedor vacío está sobre la plataforma de pesaje; el sistema registra su peso como **tara** (punto cero).
2. Una persona deposita una bolsa de residuos.
3. El ESP32 espera a que la lectura se **estabilice** y calcula el peso de la bolsa como la diferencia con la lectura anterior.
4. El sensor ultrasónico mide la altura de llenado y calcula el **porcentaje de volumen ocupado**.
5. El ESP32 envía por **Wi-Fi** a HubCircular: contenedor, material, peso de la bolsa, peso acumulado, volumen, fecha y hora.
6. Al final del día se consolida el **ingreso diario** de cada contenedor.
7. Cuando se retira el contenedor, se registra el **ingreso final** (total acumulado), se entrega al gestor y el sistema vuelve a tomar la tara.
8. El dashboard se actualiza con cada registro.

```
Bolsa en contenedor → Celda de carga → HX711 → ESP32 (+ HC-SR04) → Wi-Fi → HubCircular → Dashboard
```

---

[← Volver al índice de la solución 3](README.md)
