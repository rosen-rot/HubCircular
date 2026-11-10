# PRODUCTO MÍNIMO VIABLE (MVP)

**Proyecto:** Gestión y Medición de Residuos Reciclables del Hub Providencia (Desafío 04 | Sostenibilidad)  
**Equipo:** HubCircular  
**Solución base:** [Solución 3: Contenedores con pesaje automático](../bitácora/semana_10/propuestas_de_solucion/solucion_3/README.md)

**Fecha de Emisión:** 10 de noviembre de 2026

---

> **Objetivo del MVP:** que una bolsa depositada en el contenedor aparezca en el dashboard como un ingreso en kg, enviado por Wi-Fi, sin que nadie escriba nada.

El MVP es lo que el equipo **sí podrá demostrar** en la Feria Capstone (3 de diciembre) y ante la comisión (10 de diciembre). Se divide en dos partes que se conectan por un contrato común: la [API de lecturas](software/3_api_datos.md).

| Parte | Estado |
| :-- | :-- |
| [MVP del Software](software/README.md) | ✅ Definido |
| [MVP del Hardware](hardware/README.md) | ✅ Definido |

```
[Hardware]  Contenedor → Celda de carga → HX711 → ESP32 (+ HC-SR04)
                                                    │  Wi-Fi (HTTP POST)
[Software]                                          ▼
            API FastAPI → Reglas de medición → SQLite → Dashboard
```
