# 2. Funcionamiento Paso a Paso

1. Una persona deposita un residuo (por ejemplo, una pieza de PLA) en el contenedor.
2. Al pasar por la abertura, el objeto **interrumpe el haz del sensor**.
3. El microcontrolador **suma uno al contador** del contenedor y guarda la fecha y hora.
4. Cada cierto tiempo, o en cada ingreso, envía el conteo por **Wi-Fi** al servidor de HubCircular.
5. El servidor acumula los conteos por contenedor, material y periodo.
6. El dashboard muestra los totales y avisa cuando un contenedor se acerca a su capacidad.
7. Al vaciar el contenedor, el contador se **reinicia** y se registra el retiro.

```
Residuo → Sensor en la abertura → Microcontrolador → Wi-Fi → Servidor → Dashboard
```

---

[← Volver al índice de la solución 2](README.md)
