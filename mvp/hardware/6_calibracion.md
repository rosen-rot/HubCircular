# 6. Calibración

> Los datos de peso **no se usan como mediciones oficiales** hasta comprobar la precisión del prototipo ([prueba H-P1](7_validacion.md)).

## 6.1 Peso

1. Montar la celda en la estructura definitiva (calibrar sobre la protoboard no sirve).
2. Cargar el programa `calibracion.ino`.
3. Con la plataforma vacía, registrar la lectura en reposo: es el **cero**.
4. Colocar una masa conocida (por ejemplo, 1 kg) y calcular el **factor de calibración** = (lectura − cero) / masa.
5. Guardar el cero y el factor en la memoria del ESP32.
6. Verificar con las demás masas (0,5 kg, 2 kg, 5 kg), cinco veces cada una.
7. Si es posible, comparar con una balanza comercial o masas verificadas del laboratorio.

## 6.2 Ruido de la celda

Con la plataforma vacía, registrar lecturas durante 10 minutos. La variación máxima define:

* La ventana de estabilidad del firmware (valor inicial: 20 g).
* `UMBRAL_RUIDO_G` del servidor (valor inicial: 50 g), que debe ser claramente mayor que el ruido.

## 6.3 Nivel de llenado

1. Con el contenedor vacío, medir la distancia: `distancia_vacío`.
2. Medir la distancia hasta la línea de llenado máximo: `distancia_lleno`.
3. Verificar con alturas conocidas (por ejemplo, cajas o un objeto plano a 25 %, 50 % y 75 %).

## 6.4 Tara del contenedor

Con el contenedor vacío sobre la plataforma, registrar su peso en el servidor con `POST /api/contenedores/{id}/tara`.

---

[← Volver al índice del MVP del hardware](README.md)
