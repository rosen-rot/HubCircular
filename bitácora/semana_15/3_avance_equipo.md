# 3. Avance del Equipo

Respuestas del equipo a las cuatro preguntas de la tutoría del segundo avance (10 minutos por equipo).

## 3.1 ¿Qué hicimos? ¿Cómo vamos?

* **Software:** Carlos Concha desarrolló la **plataforma web de HubCircular** ([código](../../mvp/software/app/README.md)). Hoy permite:
  * iniciar sesión con tres roles (administrador, operador y lector);
  * registrar pesajes (bruto, tara y neto), que crean un lote;
  * seguir la trazabilidad de cada lote: traslados, retiros, reutilización, rechazo y destino;
  * ver un tablero de indicadores con kg captados, despachados y en inventario;
  * descargar los datos en Excel o CSV y consultar una página de ayuda con glosario.
* **Hardware:** llegaron **todos los componentes** (ESP32, HX711, celda de carga y resistencias). El ESP32 ya tiene cargado un programa de prueba y responde por el monitor serie.
* **Documentación:** se actualizó el [MVP](../../mvp/README.md) para que describa la plataforma tal como se construyó y para alinear las fechas con el plan del curso.

**Estado frente al plan:** el segundo avance está **cumplido en el software**, pero solo con **datos ficticios**. El hardware sigue sin montar, por lo que **aún no hay mediciones reales**.

## 3.2 ¿Cómo lo comprobamos?

* **Pruebas automáticas de la plataforma**, con datos ficticios etiquetados DEMO: todas aprobadas (detalle en [Protocolo, Datos y Fallas](4_protocolo_datos_fallas.md)).
* **Prueba manual en Supabase:** la base de datos en la nube tiene todas las migraciones aplicadas, y el registro y el tablero se probaron a mano.
* **Hardware:** solo se comprobó que el ESP32 se programa y responde. La balanza, el Wi-Fi y el sensor ultrasónico están **sin probar**.

**Principales fallas:** la celda de carga que llegó tiene 3 cables (no se puede conectar directo al HX711), el HX711 tiene los pines sin soldar y la plataforma todavía no recibe lecturas del ESP32.

## 3.3 ¿Quién hará qué?

El equipo tiene **4 integrantes**, por lo que el stand se atenderá con 2 personas en lugar de 3 (ver [Roles y Stand](6_roles_stand_feria.md)).

| Rol | Integrantes |
| :-- | :-- |
| **Pitch de la feria** | Fernanda López y Vicente Lizama |
| **Atención del stand** | Carlos Concha y Débora Cáceres |

## 3.4 ¿Cómo será el stand?

Contenedor con balanza, pantalla con la plataforma en vivo y un segundo notebook con el plan B (detalle en [Roles y Stand](6_roles_stand_feria.md)).

---

[← Volver al índice de la semana 15](README.md)
