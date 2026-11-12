# 10. Pitch de 5 Minutos para la Feria

Pitch para la [Feria Capstone del 3 de diciembre](3_anuncios_feria.md#pitch-de-la-feria-5-minutos), presentado por **Fernanda López** y **Vicente Lizama**. Se construyó solo con información de este repositorio y sigue los cinco bloques que pide el curso: problema, solución, demostración, resultados y cierre.

> ⚠️ **Antes de presentar:** hoy el prototipo todavía no está construido (ver [avance del equipo](4_avance_equipo.md)). Todo lo que aparece entre **[corchetes]** debe reemplazarse por los datos reales de las pruebas. Si un resultado no cumple el criterio, se dice tal cual: no se maquilla.

---

## A. Diagnóstico estratégico

### Qué es HubCircular

Un **contenedor que se pesa solo**. Cada bolsa que se deposita aparece en un panel web como un ingreso en kilos, enviado por wifi, sin que nadie escriba nada ([objetivo del MVP](../../mvp/README.md)).

### Lo que sabemos (y de dónde viene)

| Tema | Qué dice el repositorio | Fuente | Estado |
| :-- | :-- | :-- | :-- |
| Problema | No existe un sistema para medir los residuos reciclables del Hub; los registros son inexistentes o están dispersos. | [Semana 4](../semana_4/1_que_esta_ocurriendo.md) | Diagnóstico del equipo |
| Caso concreto | El PLA de las impresoras 3D y los desechos de resina **no se gestionan**: se acumulan sin registro ni destino. | [Visita al Hub, semana 7](../semana_7/3_informacion_recopilada.md) | ✅ Fuente primaria |
| Oportunidad | El Hub quiere reutilizar ese plástico, por ejemplo en **planchas de plástico reciclado**. | [Visita al Hub, semana 7](../semana_7/3_informacion_recopilada.md) | ✅ Fuente primaria |
| Afectados | Administración del Hub (sin datos para presupuestos ni directrices municipales) y personal de aseo (sin procedimientos, teme más carga). | [Semana 4](../semana_4/2_a_quien_le_ocurre.md) | Diagnóstico del equipo |
| Solución | Celda de carga + HX711 + ESP32 + sensor ultrasónico → wifi → servidor FastAPI + SQLite → panel en vivo. | [MVP](../../mvp/README.md) | 📐 Diseñado |
| Decisión | Se compararon 3 alternativas (pesaje manual con QR, sensor de conteo, pesaje automático). | [Semana 10](../semana_10/propuestas_de_solucion/README.md) | ✅ Documentado |
| Reglas | Peso estable, solo diferencias (sin doble conteo), umbral de ruido de 50 g, retiro automático. | [Reglas de medición](../../mvp/software/4_reglas_medicion.md) | 📐 Diseñado |
| Pruebas | Criterios definidos: error ≤ ±20 g o ±2 %, 100 % de bolsas sin duplicados, < 10 s hasta el panel. | [Hardware](../../mvp/hardware/7_validacion.md) · [Software](../../mvp/software/7_validacion.md) | ⏳ Sin ejecutar |
| Costo | Lo único por comprar es la celda ($2.500) y el HX711 ($2.300); el resto viene en el kit. | [Materiales](5_materiales_faltantes.md) | 💲 Cotizado |
| Prototipo | Aún no existe. Faltan la celda y el HX711. | [Avance](4_avance_equipo.md) | ⏳ Pendiente |

### Las 3 fortalezas más convincentes

1. **Un problema real, visto en terreno.** El PLA del Hub se acumula sin registro, y la propia contraparte quiere reutilizarlo. No es un problema supuesto.
2. **Cero trabajo extra para las personas.** El registro es automático: ni quien bota la bolsa ni el personal de aseo hacen algo distinto. Responde directo al temor de sumar carga al personal de aseo ([semana 4](../semana_4/4_que_sabemos.md)).
3. **Rigor de medición, no solo un aparato.** La elección se justificó frente a dos alternativas, las reglas evitan contar dos veces la misma bolsa, y las pruebas tienen criterios de aceptación definidos antes de construir.

### Lo que falta o se contradice

| Hallazgo | Implicancia para el pitch |
| :-- | :-- |
| **No hay prototipo ni pruebas todavía.** | Los resultados del bloque 4 quedan entre corchetes hasta tener los datos. Es el punto más débil hoy. |
| Los [pitch de 1 y 3 minutos](../semana_10/propuestas_de_solucion/pitch/pitch_3_minutos.md) describen la **solución 1** (aplicación con QR y recomendaciones), no la seleccionada. La [presentación de la semana 13](../semana_13/8_presentacion_pitch.md) dice que se presentó la solución 3, pero describe el flujo con QR. | **No reutilizar esos guiones.** El QR y las recomendaciones quedaron para la fase 2. |
| La imagen [prototipo_contenedor.png](../../mvp/hardware/assets/prototipo_contenedor.png) es un **render referencial**, no una foto. | No mostrarla como prototipo real. Reemplazarla por una foto propia. |
| La visita al Hub no tiene fecha ni responsable registrados ([retroalimentación](../semana_13/3_retroalimentacion_informes.md)). | Completar el dato en la semana 7 antes del informe final. |
| No hay **línea base**: nadie sabe cuántos kilos genera el Hub. | Es justamente el gancho del pitch, pero impide prometer cifras de impacto. |
| Los supuestos sobre el personal de aseo y la administración ([semana 3](../semana_3/5_supuestos_prioritarios.md)) no se validaron con entrevistas. | Hablar de ellos como necesidades detectadas, no como validadas. |

### Argumento central de valor

El Hub no puede aprovechar lo que no mide, y nadie va a medir si eso significa más trabajo. HubCircular resuelve las dos cosas a la vez: **mide solo**.

---

## B. Mensaje central

> **"Cada bolsa, un dato. Sin que nadie escriba nada."**

Por qué importa, en una frase: *el Hub Providencia quiere reutilizar su plástico, pero hoy no sabe cuánto tiene; HubCircular le entrega ese dato de forma automática y sin sumar trabajo a nadie.*

---

## C. Guion final

**Duración estimada:** ~4:45 (545 palabras a 125 palabras por minuto, más ~25 s de acciones en la demostración). Quedan ~15 s de margen.

| Bloque | Tiempo | Quién habla | Palabras |
| :-- | :-- | :-- | :-: |
| 1. Problema | 0:00–0:45 | 🟣 Fernanda | 96 |
| 2. Solución | 0:45–1:45 | 🟢 Vicente | 125 |
| 3. Demostración | 1:45–3:15 | 🟢 Vicente habla · 🟣 Fernanda deposita las bolsas | 138 |
| 4. Resultados | 3:15–4:05 | 🟣 Fernanda | 104 |
| 5a. Viabilidad y próximos pasos | 4:05–4:25 | 🟢 Vicente | 45 |
| 5b. Cierre | 4:25–4:45 | 🟣 Fernanda | 37 |

**Reparto:** Fernanda abre, presenta la evidencia y cierra (~1:55 hablando, más las acciones de la demo). Vicente explica cómo funciona y conduce la demo (~2:50, incluidas las esperas de la demo). Quien abre es quien cierra, para que el inicio y el final se respondan.

### Bloque 1 · Problema (0:00–0:45) · 🟣 Fernanda

*(Diapositiva 1. Fernanda da un paso al frente, mira al público y espera dos segundos antes de hablar.)*

> ¿Cuántos kilos de plástico botó el Hub Providencia el mes pasado?
>
> *(pausa)*
>
> Nadie lo sabe. No porque no les importe, sino porque nadie lo mide.
>
> *(Diapositiva 2)*
>
> Cuando visitamos el Hub, nos contaron que el plástico que sobra de las impresoras 3D se deja en un contenedor, sin registro y sin destino. Y el Hub quiere reutilizarlo, por ejemplo, en planchas de plástico reciclado.
>
> Pero nadie puede planificar con un material si no sabe cuánto hay.
>
> Ese es el dato que le falta a la administración para justificar presupuestos y responder a las directrices de sostenibilidad de la Municipalidad.

### Bloque 2 · Solución (0:45–1:45) · 🟢 Vicente

*(Diapositiva 3)*

> Medir parece fácil: una balanza y una planilla. Lo evaluamos, junto con otros dos caminos.
>
> Pesar a mano depende de que alguien se acuerde, y le suma trabajo al personal de aseo. Contar objetos con un sensor no dice cuántos kilos hay.
>
> Por eso elegimos el tercero: **HubCircular, un contenedor que se pesa solo.**
>
> *(Vicente apunta al prototipo real.)*
>
> Está sobre una balanza hecha con una celda de carga, la misma pieza de una balanza digital. Cuando alguien deja una bolsa, una pequeña placa espera a que el peso se estabilice y lo envía por wifi. Un sensor en la tapa mide qué tan lleno está. Y un panel muestra cada ingreso, en kilos y en vivo.
>
> Quien bota la bolsa no hace nada distinto. El personal de aseo, tampoco.

### Bloque 3 · Demostración (1:45–3:15) · 🟢 Vicente habla · 🟣 Fernanda actúa

*(Se cambia a la pantalla con el dashboard en vivo. Fernanda toma la primera bolsa, previamente pesada en una balanza comercial.)*

> Se lo mostramos. Esta bolsa tiene restos de impresión 3D. En una balanza comercial pesó **[peso de referencia]**.
>
> Fernanda la va a dejar en el contenedor.
>
> *(Fernanda deposita la bolsa. Silencio hasta que aparece el ingreso: unos 5 a 10 s.)*
>
> Miren la pantalla. Ahí está: un ingreso de **[peso medido]**, con la hora, enviado por wifi desde el contenedor. **Nadie escribió nada.**
>
> Acá abajo ven que el llenado subió a **[porcentaje]**, y este indicador verde confirma que el sensor está en línea.
>
> Ahora, una segunda bolsa.
>
> *(Fernanda deposita la segunda bolsa. Pausa.)*
>
> Fíjense en el total. El sistema no vuelve a sumar todo el contenedor: registra solo la diferencia. Por eso el total es **[suma de las dos bolsas]**, y no el doble.
>
> Y cuando se vacía el contenedor, lo detecta solo: guarda el total retirado y vuelve a cero.
>
> Ese es el dato que hoy no existe en el Hub: **cuántos kilos entran, cuándo y cuánto sale.**

> **Si falla la demo en vivo (plan B):** Vicente dice *"Les muestro el mismo proceso grabado el [fecha] en una prueba real"* y se reproduce el video en el segundo notebook. Si se usa el simulador, el panel muestra la etiqueta **SIMULADO** y se dice en voz alta. Nunca se presenta como en vivo algo grabado o simulado.

### Bloque 4 · Resultados (3:15–4:05) · 🟣 Fernanda

*(Diapositiva 5)*

> Pero que funcione una vez frente a ustedes no basta. Por eso lo probamos con un protocolo.
>
> Primero, precisión: pesamos masas conocidas veinte veces. En **[X] de veinte**, el error quedó dentro de nuestro criterio: veinte gramos o dos por ciento.
>
> Segundo, conteo: dejamos veinte bolsas. El sistema registró **[X]**, con **[cero]** duplicados.
>
> Tercero, rapidez: en el **[X] por ciento** de los envíos, el dato apareció en menos de diez segundos.
>
> También encontramos límites. **[Una falla real y cómo la corregimos. Ejemplo de forma: "La primera calibración marcaba ___ de más; la ajustamos con ___ y volvimos a probar".]** Hoy medimos un solo contenedor, en una red local. Y si se cae el wifi, el panel muestra "sin señal": no inventa datos.

### Bloque 5a · Viabilidad y próximos pasos (4:05–4:25) · 🟢 Vicente

*(Diapositiva 6)*

> Y es viable: las piezas que tuvimos que comprar costaron menos de cinco mil pesos; el resto venía en un kit.
>
> Hoy el prototipo mide y muestra. El próximo paso es que gestione: un contenedor por material, avisos de retiro y reportes para la Municipalidad.

### Bloque 5b · Cierre (4:25–4:45) · 🟣 Fernanda

*(Fernanda vuelve al centro. Ritmo más lento.)*

> Volvamos a la pregunta del inicio: ¿cuántos kilos de plástico botó el Hub el mes pasado?
>
> Hoy nadie lo sabe. Con HubCircular, la respuesta está en esta pantalla.
>
> *(pausa, mirando al público)*
>
> **Cada bolsa, un dato. Sin que nadie escriba nada.**

---

## D. Presentación (6 diapositivas)

| # | Título | Mensaje | En pantalla | Quién · tiempo | Transición |
| :-: | :-- | :-- | :-- | :-- | :-- |
| 1 | **¿Cuántos kilos?** | Nadie sabe cuánto plástico se bota en el Hub. | Fondo oscuro, solo la pregunta en grande y un **"? kg"**. Nada más. | 🟣 0:00–0:15 | Tras "nadie lo mide", avanzar. |
| 2 | **Nadie lo mide** | El plástico se acumula sin registro, y el Hub quiere reutilizarlo. | Foto del equipo en la [visita al Hub](../semana_7/README.md) (o del contenedor de PLA si la tienen) + dos datos breves: "PLA y resina: sin registro ni destino" · "El Hub quiere planchas recicladas". Íconos de administración y aseo. | 🟣 0:15–0:45 | "Ese es el dato que le falta…" → cambia Vicente. |
| 3 | **Un contenedor que se pesa solo** | Automático, preciso y sin trabajo extra. | Franja con las 3 alternativas: ✗ Pesaje manual · ✗ Conteo · ✓ Pesaje automático. Debajo, diagrama simple: **Bolsa → Balanza → Wifi → Panel**. Foto **real** del prototipo (no el render). | 🟢 0:45–1:45 | "El personal de aseo, tampoco" → cambio a la pantalla del dashboard. |
| 4 | **En vivo** | La bolsa aparece sola en el panel. | Dashboard en vivo (no es una diapositiva). Si es plan B: video con la leyenda **"Prueba grabada el [fecha]"**. | 🟢🟣 1:45–3:15 | "Cuánto sale" → volver a la presentación. |
| 5 | **Lo probamos** | Hay evidencia, no solo una demo. | Tres números grandes con su criterio: **[X]/20** dentro de ±20 g · **[X]/20** bolsas, **[0]** duplicados · **[X] %** en < 10 s. Abajo, una línea: "Límite: un contenedor, red local". | 🟣 3:15–4:05 | "No inventa datos" → cambia Vicente. |
| 6 | **Cada bolsa, un dato.** | Es barato, funciona y tiene próximo paso. | "< $5.000 en piezas" · Hoy: mide y muestra → Próximo: gestiona (por material, avisos, reportes). Al final, solo la frase de cierre y el logo. | 🟢🟣 4:05–4:45 | Fin. Quedarse en esta diapositiva durante las preguntas. |

**Estilo:** colores naturales (verdes, madera, blanco), coherente con la decoración del stand. Máximo 12 palabras por diapositiva, sin párrafos. Cualquier imagen que no sea real se rotula como *referencial*.

---

## E. Recomendaciones de oratoria

| Momento | Qué hacer |
| :-- | :-- |
| **Primera pregunta** | Decirla lento y quedarse callada 2 segundos. El silencio hace que el público intente responder. |
| **"Nadie lo mide"** | Bajar el volumen, no subirlo. Es una constatación, no un reproche al Hub. |
| **"Un contenedor que se pesa solo"** | Señalar el prototipo físico. Que el público mire el objeto, no la pantalla. |
| **Esperar el dato en la demo** | No llenar el silencio. Si tarda, decir *"está esperando que el peso se estabilice"*: convierte la espera en una explicación. |
| **"Nadie escribió nada"** | Mirar al público, no a la pantalla. Es la frase que deben recordar. |
| **Los tres resultados** | Contar con los dedos: uno, dos, tres. Pausa breve entre cada número. |
| **"También encontramos límites"** | Decirlo con seguridad. Reconocer un límite da más credibilidad que esconderlo. |
| **Cierre** | Volver al centro, mirar al jurado y decir la última frase sin apuro. No agregar "gracias, eso sería todo": se espera el aplauso. |
| **Cambios de turno** | Quien termina mira a quien sigue. Practicar los tres cambios (0:45, 4:05, 4:25), que es donde más se pierde el ritmo. |
| **Ensayo** | Cronometrar con la demo real al menos 3 veces. Si pasan de 4:50, recortar del bloque 2, nunca de la demo ni del cierre. |

---

## F. Preguntas difíciles del jurado

| # | Pregunta | Respuesta breve |
| :-: | :-- | :-- |
| 1 | **¿Por qué no compraron una balanza comercial?** | La comparamos ([semana 11](../semana_11/8_sistema_pesaje_iot.md)). Mide bien, pero no envía los datos sola: alguien tendría que anotarlos, y ese es justamente el problema. La usamos como referencia para calibrar la nuestra. |
| 2 | **¿Qué pasa si se cae el wifi?** | El panel marca "sin señal" a los 90 s y el ESP32 intenta reconectarse cada 5 s. Como envía el **peso total** y no cada bolsa, al volver la conexión el acumulado sigue cuadrando. Lo que se pierde es el detalle de las bolsas depositadas durante el corte. |
| 3 | **¿Cuánto cuesta?** | Las piezas que compramos, la celda y el HX711, costaron cerca de $4.800. El ESP32, el sensor y los cables venían en un kit. Todavía no calculamos el costo completo por contenedor con estructura y servidor; es parte de la fase 2. |
| 4 | **¿Lo probaron en el Hub?** | Todavía no. Validamos el problema en la visita y probamos el prototipo con masas conocidas. El piloto en el Hub es el siguiente paso. |
| 5 | **¿Cómo sabe qué material hay adentro?** | No lo reconoce. Cada contenedor se asocia a un material, como ocurre hoy con los contenedores separados. Si alguien bota algo en el contenedor equivocado, se pesa igual. Por eso el Hub nos pidió agregar instrucciones con ejemplos, que quedaron para la fase 2. |
| 6 | **¿Y si alguien se apoya o saca algo?** | El sistema solo registra cuando el peso se estabiliza y descarta variaciones menores a 50 g. Si alguien saca algo, se registra como un ajuste para que el total cuadre. Un apoyo largo sí podría alterar una lectura; es un límite que estamos midiendo en las pruebas. |
| 7 | **¿Esto reduce los residuos?** | No directamente, y no queremos prometerlo. Lo que hace es entregar el dato que hoy no existe: cuánto se genera y cuándo se retira. Con eso, el Hub puede planificar retiros, justificar presupuesto y saber si tiene suficiente PLA para sus planchas. |
| 8 | **¿Lo que vimos era real o simulado?** | *[Responder según lo ocurrido.]* El panel indica siempre el origen del dato: si viene del simulador, aparece la etiqueta **SIMULADO**. El video de respaldo está rotulado con la fecha de la prueba real. |

---

## G. Evaluación final

### Evaluación como jurado

Puntaje **suponiendo que los corchetes se llenan con datos reales** que cumplen los criterios. Si no hay datos, la credibilidad baja a 3.

| Criterio | Nota | Justificación |
| :-- | :-: | :-- |
| Fuerza de la apertura | 8 | Pregunta concreta, local e incómoda, que nadie en la sala puede responder. Mejoraría con una foto real del contenedor de PLA. |
| Claridad del problema | 8 | Se apoya en lo visto en la visita y nombra a quién le falta el dato. No tiene una cifra de magnitud porque no existe línea base. |
| Comprensión de la solución | 9 | "Un contenedor que se pesa solo" se entiende en una frase y luego se ve en vivo. |
| Diferenciación | 7 | La comparación de 3 alternativas y el "sin trabajo extra" son claros. Falta contrastar con soluciones existentes en el mercado. |
| Credibilidad y evidencia | 6 → 8 | Hoy es 6: hay protocolo y criterios, pero no datos. Sube a 8 cuando se completen las pruebas y se nombre una falla real corregida. |
| Viabilidad | 7 | Costo bajo y componentes disponibles. No hay costo completo por contenedor ni piloto en el Hub. |
| Impacto | 6 | El impacto es proyectado y no se puede cuantificar sin línea base. El pitch lo reconoce en lugar de inflarlo. |
| Calidad narrativa | 8 | La pregunta inicial vuelve en el cierre y la idea "nadie escribe nada" atraviesa todo el discurso. |
| Capacidad de persuasión | 8 | La demo en vivo, con una bolsa real, es el momento más fuerte. Depende de que funcione o de un plan B honesto. |
| Fuerza del cierre | 8 | Retoma la pregunta y termina con una frase corta y concreta del proyecto. |

### Mejoras aplicadas antes de esta versión

* **Se recortó de 594 a 545 palabras:** la primera versión duraba ~5:10 con la demo.
* **Se cambió el orden propuesto** (diferenciación antes que la demo) por el de la feria: el jurado evalúa con esa pauta y la demo convence más que cualquier comparación.
* **Se eliminaron el QR, las recomendaciones y las tendencias**, que aparecían en los pitch anteriores pero no están en el MVP.
* **El impacto se presenta como proyectado**, sin cifras inventadas.
* **Se agregó un límite explícito** en los resultados, porque admitirlo da más credibilidad que esconderlo.

### Fortalezas

1. Problema real con fuente primaria y una contraparte con interés concreto.
2. Una demo física en la que el público ve aparecer el dato sin que nadie escriba.
3. Honestidad sobre lo que está probado, lo que no y lo que viene.

### Debilidades y cómo enfrentarlas

| Debilidad | Acción antes del 3 de diciembre |
| :-- | :-- |
| No hay datos de prueba. | Ejecutar H-P1, H-P5 y P4 antes del 26 de noviembre y llenar los corchetes. |
| No hay foto real del prototipo ni del contenedor de PLA. | Fotografiar el prototipo terminado y, si es posible, pedir al Hub una foto del contenedor de PLA. |
| La demo depende del wifi de la feria. | Probar en la red de la carpa o llevar hotspot (2,4 GHz) y tener el video listo. |
| No hay validación con el personal de aseo ni con la administración. | Si alcanza, una conversación breve con alguien del Hub mostrando el panel; citarla con fecha. |
| Impacto sin cifras. | Si se hace una prueba en el Hub, aunque sea de un día, usar ese número como primer dato real. |

---

[← Volver al índice de la semana 14](README.md)
