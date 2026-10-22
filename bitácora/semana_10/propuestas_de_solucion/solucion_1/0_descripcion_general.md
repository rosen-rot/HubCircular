# 0. Descripción General: Pesaje Manual en el Retiro con Registro QR

## Idea

La persona encargada de retirar los residuos los **pesa antes de entregarlos** al camión que los retira del Hub. Cada pesaje se **registra escaneando un código QR**, y los datos llegan a un **dashboard web (página HTML)** donde se procesan y se muestran a las personas del Hub.

## Funcionamiento

1. Cada contenedor tiene un **código QR** que lo identifica (ubicación y tipo de material, por ejemplo PLA o resina).
2. Al momento del retiro, la persona encargada **pesa las bolsas** del contenedor con una balanza.
3. Escanea el QR con su celular, lo que abre un **formulario web** con el contenedor ya identificado.
4. Ingresa el **peso**, confirma el material y, si corresponde, agrega una foto u observación.
5. El registro se guarda con **fecha, hora y responsable**, y se marca como **entregado** al camión o gestor.
6. El dashboard actualiza los indicadores: kilos por material, por contenedor y por periodo.

## Dashboard

* Kilos retirados por tipo de material y por contenedor.
* Historial de retiros con fecha y responsable.
* Comparación entre semanas o meses.

## Ventajas

* Bajo costo: solo requiere una balanza, códigos QR impresos y la página web.
* Fácil de implementar en un piloto.
* El QR evita errores al identificar el contenedor y el material.

## Limitaciones

* Depende de que la persona encargada **recuerde pesar y registrar** cada retiro.
* Solo entrega datos **en el momento del retiro**: no muestra cuánto se genera día a día.
* La exactitud depende de la balanza utilizada y del cuidado al registrar.

## Desarrollo detallado

El resto de los documentos de esta carpeta desarrollan esta propuesta en profundidad (arquitectura, modelo de datos, pantallas, plan de trabajo y riesgos). Ver el [índice de la solución 1](README.md).

---

[← Volver al índice de la solución 1](README.md)
