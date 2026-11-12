# 9. Conexión con el Proyecto Capstone

> *"Tan importante como proteger el huevo: demostrar con evidencia que la solución funciona y documentar cómo llegaron a ese resultado. Exactamente lo mismo ocurre con el proyecto capstone: no sirve que muestren un prototipo operativo, sino que la fortaleza está en mostrar la evidencia y la documentación que les permitió llegar a ese resultado."*

En la feria y ante la comisión no bastará con que el contenedor de HubCircular pese una bolsa frente al público. Tendremos que mostrar **cómo sabemos** que mide bien y qué cambiamos cuando algo falló.

| Egg Drop Challenge | HubCircular |
| :-- | :-- |
| El huevo llega intacto | Una bolsa depositada aparece en el dashboard como un ingreso en kg, enviado por Wi-Fi. |
| Primer lanzamiento fallido | Primeras pruebas de la celda de carga, del envío desde el ESP32 y de la integración con la plataforma. |
| Base sin refuerzo | Puntos débiles que encontremos: calibración, montaje de la plataforma o pérdida de conexión. |
| Refuerzo, sujeción y paracaídas | Ajustes justificados por la evidencia y registrados en la bitácora. |
| Ficha de evidencia (criterio, procedimiento, observación, mejora) | Tablas de las pruebas de [hardware](../../mvp/hardware/7_validacion.md) y [software](../../mvp/software/7_validacion.md), con fecha, responsable, resultados, fallas y cambios. |

## 9.1 Cómo aplicaremos lo aprendido

* **Registrar también las fallas:** cada prueba que no cumpla el criterio queda documentada con su causa y el cambio que se hizo, igual que el primer lanzamiento.
* **Usar los mismos cuatro campos:** criterio de éxito, procedimiento, observación y mejora para cada prueba del MVP.
* **Guardar evidencia audiovisual:** fotos y videos cortos de las pruebas en `assets/`, para mostrarlos en el stand y en el informe final.
* **Llevar la evidencia al pitch:** el bloque de **resultados** (3:20–4:20) del [pitch de 5 minutos](3_anuncios_feria.md#pitch-de-la-feria-5-minutos) debe mostrar el indicador, la prueba y sus limitaciones.
* **Cumplir los avances semanales:** protocolo y datos de funcionamiento el 19 de noviembre, y prototipo en funcionamiento con documentación el 26 de noviembre.

---

[← Volver al índice de la semana 14](README.md)
