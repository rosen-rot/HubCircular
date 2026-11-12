# 5. Materiales Faltantes y Dónde Comprarlos

Para completar el prototipo **solo faltan dos componentes: la celda de carga y el módulo HX711**. El resto de la electrónica viene en el kit recibido, por lo que no es necesario comprar otro kit. El estado de cada componente está en [Componentes y estado del hardware](../../mvp/hardware/2_componentes_estado.md).

## 5.1 Lista de compra

Precios de referencia en CLP, sin despacho. La disponibilidad puede cambiar.

| Material | Función | Precio | Tienda |
| :-- | :-- | --: | :-- |
| Celda de carga 50 kg | Sensor de pesaje del contenedor. | $2.500 | Afel Ingeniería SpA |
| Módulo HX711 | Convierte la señal de la celda de carga en datos digitales para el ESP32. | $2.300 | Afel Ingeniería SpA |
| **Total estimado** | | **$4.800** | |

## 5.2 Dónde comprar

**Afel Ingeniería SpA**, que tiene ambos componentes y atención en Providencia (Obispo Donoso 6, oficina 302).

## 5.3 Precaución antes de comprar la celda

Algunas celdas económicas de 50 kg tienen **tres cables** y funcionan como **medio puente**: no sirven solas con el HX711 y necesitan varias celdas o un circuito combinador. Antes de comprar hay que confirmar que sea una **celda de barra de cuatro cables** (rojo, negro, verde y blanco). No basta con mirar la capacidad nominal (ver [tipos de celda de carga](../../mvp/hardware/2_componentes_estado.md#22-atención-con-el-tipo-de-celda-de-carga)).

## 5.4 Próximo paso

Comprar la celda y el HX711 y, al recibirlos, **fotografiar la celda** para confirmar su modelo y definir cómo se montará en la plataforma del contenedor.

---

[← Volver al índice de la semana 14](README.md)
