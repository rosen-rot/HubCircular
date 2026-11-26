# 5. Dashboard

La plataforma se abre en `http://<IP del notebook>:3000/` e inicia sesión con un usuario. Tiene un **menú lateral** que se pliega en el celular.

## 5.1 Pantallas construidas (al 19 de noviembre)

| Pantalla | Contenido |
| :-- | :-- |
| **Inicio** | Resumen: kg captados, tendencia y reparto por material. Es la pantalla de llegada de todos los roles. |
| **Registro** | Formulario de pesaje (bruto, tara y neto calculado), con resumen del día y últimos registros. |
| **Historial** | Todos los pesajes, con detalle de cada uno. |
| **Lotes** | Lotes con saldo, panel de detalle y línea de tiempo de sus movimientos. |
| **Movimientos y retiros** | Traslados, retiros, reutilización, rechazo y ajustes, con destino y evidencia. |
| **Destinos** | Gestores o lugares a los que se envía el material. |
| **Contenedores** | Contenedores por zona y material. |
| **Tablero de indicadores** | Kg captados, despachados y en inventario; filtros por fecha, zona y material; cobertura de medición; botón **Descargar datos**. |
| **Calendarios** | Jornadas de medición programadas y "cero confirmado". |
| **Usuarios** | Alta de usuarios y roles (solo administrador). |
| **Ayuda** | Glosario y explicación de cada indicador. |

## 5.2 Panel en vivo del contenedor *(por construir, S9)*

| Bloque | Contenido | Por qué |
| :-- | :-- | :-- |
| **Estado del contenedor** | Kg actuales, % de llenado (barra) y material. | Es lo primero que debe ver un visitante. |
| **Conexión del sensor** | "En línea / sin señal", segundos desde la última lectura, RSSI y origen (`sensor` o **SIMULADO**). | Demuestra que los datos llegan por Wi-Fi. |
| **Lecturas en vivo** | Las últimas 20 lecturas con hora y peso. La nueva se resalta. | Permite ver el dato aparecer justo después de depositar la bolsa. |
| **Último ingreso detectado** | Ejemplo: "Ingreso de 1,4 kg a las 15:20", con botón para confirmarlo. | Traduce la lectura en algo comprensible. |

El panel se actualiza solo cada 2 segundos, sin recargar la página.

## 5.3 Reglas de presentación

* Pesos en **kg con un decimal** (los datos se guardan en gramos).
* El sensor pasa a **"sin señal"** si pasan más de 90 segundos sin lecturas (3 latidos perdidos).
* Si los datos vienen del simulador, se muestra **SIMULADO** en el estado y en cada lectura.
* Solo se muestran datos registrados: no se muestran cifras estimadas como CO₂ evitado o valor en pesos.

---

[← Volver al índice del MVP del software](README.md)
