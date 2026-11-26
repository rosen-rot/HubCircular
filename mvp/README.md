# PRODUCTO MÍNIMO VIABLE (MVP)

**Proyecto:** Gestión y Medición de Residuos Reciclables del Hub Providencia (Desafío 04 | Sostenibilidad)  
**Equipo:** HubCircular  
**Solución base:** [Solución 3: Contenedores con pesaje automático](../bitácora/semana_10/propuestas_de_solucion/solucion_3/README.md)

**Fecha de Emisión:** 10 de noviembre de 2026  
**Última actualización:** 19 de noviembre de 2026 (arquitectura ajustada al software desarrollado y fechas alineadas con el plan del curso)

---

> **Objetivo del MVP:** que una bolsa depositada en el contenedor aparezca en el dashboard como un ingreso en kg, enviado por Wi-Fi, sin que nadie escriba nada.

El MVP es lo que el equipo **sí podrá demostrar** en la Feria Capstone (3 de diciembre) y ante la comisión (10 de diciembre). Se divide en dos partes que se conectan por un contrato común: la [API de lecturas](software/3_api_datos.md).

| Parte | Estado al 19 de noviembre |
| :-- | :-- |
| [MVP del Software](software/README.md) | 🟡 Plataforma web construida y probada con datos ficticios. Falta la recepción de lecturas del ESP32 y el simulador. |
| [MVP del Hardware](hardware/README.md) | 🟡 Componentes recibidos. Falta el montaje, la calibración y las pruebas. |

```
[Hardware]  Contenedor → Celda de carga → HX711 → ESP32 (+ HC-SR04)
                                                    │  Wi-Fi (HTTP POST)
[Software]                                          ▼
            Next.js (API + reglas) → PostgreSQL (Supabase) → Dashboard web
```

## Fechas clave

| Fecha | Hito del curso | Qué debe estar listo |
| :-- | :-- | :-- |
| **12 nov** | Primer avance concreto | ❌ No cumplido en el prototipo: se avanzó en el informe y en la definición del MVP ([semana 14](../bitácora/semana_14/4_avance_equipo.md)). |
| **19 nov** | Segundo avance | ✅ Plataforma web construida y probada con datos ficticios: registro de pesajes, lotes, trazabilidad, tablero de indicadores y descarga de datos. Protocolo de pruebas definido. |
| **26 nov** | Tercer avance | Balanza montada y calibrada, ESP32 enviando lecturas a la plataforma, simulador funcionando y primeras pruebas con datos reales. |
| **3 dic** | Ensayo del pitch (mañana) y Feria Capstone (14:00–16:30) | Versión congelada. Demo en vivo con el contenedor. |
| **7 dic** | Entrega del informe final | Resultados de las pruebas y evidencia de la feria. |
| **10 dic** | Evaluación ante comisión (14:00–16:30) y cierre (17:00) | Presentación de 20 minutos (12 + 6 + 2). |
