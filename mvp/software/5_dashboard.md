# 5. Dashboard

Una sola página, servida por FastAPI en `http://<IP del notebook>:8000/`. Se actualiza sola consultando la API **cada 2 segundos**; no hace falta recargar.

## 5.1 Bloques de la página

| Bloque | Contenido | Por qué |
| :-- | :-- | :-- |
| **Estado del contenedor** | kg acumulados, % de llenado (barra) y material. | Es lo primero que debe ver un visitante. |
| **Conexión del sensor** | Indicador "en línea / sin señal", segundos desde la última lectura, RSSI y origen (`sensor` o `SIMULADO`). | Demuestra que los datos llegan por Wi-Fi. |
| **Lecturas en vivo** | Las últimas 20 lecturas, con hora y peso. Al llegar una nueva, se resalta. | Permite ver el dato aparecer justo después de depositar la bolsa. |
| **Último evento** | Ejemplo: "Ingreso de 1,4 kg a las 15:20". | Traduce la lectura en algo comprensible. |
| **kg por día** | Gráfico de barras con Chart.js. | Responde a la necesidad del Hub: cuantificar lo recuperado. |
| **Historial** | Tabla de ingresos, retiros y ajustes. | Respaldo de cada cifra mostrada. |

## 5.2 Reglas de presentación

* Pesos en **kg con un decimal** (los datos se guardan en gramos).
* El estado pasa a **"sin señal"** si pasan más de 90 segundos sin lecturas (3 latidos perdidos).
* Si los datos vienen del simulador, se muestra una etiqueta **SIMULADO** visible en el estado y en cada lectura.

---

[← Volver al índice del MVP del software](README.md)
