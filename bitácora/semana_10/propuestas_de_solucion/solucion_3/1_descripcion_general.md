# 1. Descripción General

Todos los contenedores del Hub se ubican sobre una **balanza propia** (celda de carga + módulo HX711 + ESP32). Cada vez que se deposita una bolsa de residuos, el sistema **registra su peso**, y un sensor mide el **volumen ocupado** del contenedor. Así se lleva una cuenta exacta que considera **peso y volumen**.

El sistema registra el **ingreso diario** de residuos y el **ingreso final** (lo acumulado al momento del retiro). Todos los datos llegan a un **dashboard web (página HTML)** al que acceden las personas del Hub para analizarlos.

El diseño técnico del sistema de pesaje se definió en la [semana 11](../../../semana_11/8_sistema_pesaje_iot.md).

---

[← Volver al índice de la solución 3](README.md)
