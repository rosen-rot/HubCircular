# 9. Actividad en Grupo: ¿Qué Demostraremos en la Feria?

Respuestas del equipo a las preguntas de la actividad en grupo de la clase 12. Se basan en el [MVP del software y del hardware](../../mvp/README.md).

## 9.1 ¿Qué funciones estarán listas y cuáles no?

| Estado | Software (Carlos Concha) | Hardware (Vicente Lizama) |
| :-- | :-- | :-- |
| ✅ **Listas para la feria** | Recepción de lecturas por Wi-Fi, base de datos, reglas de ingreso y retiro, dashboard en vivo y simulador. | Medición de peso calibrada, estabilización de la lectura, nivel de llenado, envío por Wi-Fi y contenedor montado. |
| 🟡 **Si queda tiempo** | Exportación a CSV, aviso de llenado sobre 80 % y peso promedio por bolsa. | LED de estado y alimentación con cargador USB, sin notebook. |
| ❌ **No estarán (fase 2)** | Inicio de sesión, códigos QR, trazabilidad hacia el gestor, recomendaciones y tendencias mensuales. | Varios contenedores, pantalla LCD y otros sensores del kit. |

**Producto mínimo que sí demostraremos:** al depositar una bolsa en el contenedor, aparece en el dashboard como un ingreso en kg, enviado por Wi-Fi, sin que nadie escriba nada.

## 9.2 ¿Con qué pruebas, indicadores y evidencia demostraremos resultados?

| Afirmación | Indicador | Criterio | Evidencia |
| :-- | :-- | :-- | :-- |
| La balanza mide bien | Error frente a masas conocidas | ≤ ±20 g o ±2 % en el 95 % de las mediciones | Tabla de 20 mediciones ([H-P1](../../mvp/hardware/7_validacion.md)) |
| Cada bolsa se registra una sola vez | Bolsas detectadas / bolsas depositadas | 100 % y 0 duplicados | Tabla de 20 bolsas y captura del dashboard ([H-P5](../../mvp/hardware/7_validacion.md), [P1](../../mvp/software/7_validacion.md)) |
| El nivel de llenado es aproximado | Error frente al nivel real | ≤ ±10 puntos porcentuales | Tabla de 15 mediciones ([H-P3](../../mvp/hardware/7_validacion.md)) |
| Los datos llegan rápido por Wi-Fi | Segundos hasta aparecer en el dashboard | < 10 s en el 95 % de los casos | Tabla de 20 envíos ([P4](../../mvp/software/7_validacion.md)) |
| La conexión es estable | Lecturas recibidas / enviadas | ≥ 98 % durante 1 hora | Conteo de secuencias ([P5](../../mvp/software/7_validacion.md)) |

Cada prueba se registra con fecha, responsable, condiciones, resultados, fallas y cambios. Las tablas y fotos se guardan en `assets/` de la semana en que se realizan.

## 9.3 ¿Cómo lo presentaremos en la feria y quién presentará el pitch?

**Stand:**

* El **contenedor real** con la caja transparente que deja ver la electrónica.
* Un **notebook con el dashboard** a la vista de los visitantes.
* **Demostración:** un visitante deposita una bolsa y la ve aparecer en el dashboard en segundos, con el panel que muestra que el dato llegó por Wi-Fi.

**Guion de la visita (alrededor de 2 minutos):**

1. **Problema (30 s):** el Hub Providencia no sabe cuántos kilos de residuos reciclables genera ni recupera.
2. **Demo (1 min):** depositar una bolsa y mostrar el ingreso en el dashboard.
3. **Evidencia (30 s):** mostrar los resultados de las pruebas de precisión y sus límites.

**Roles:**

| Rol | Integrante |
| :-- | :-- |
| Explicar el hardware y la medición | Vicente Lizama |
| Explicar el software y el dashboard | Carlos Concha |
| Competencia de pitch (2 integrantes) | Débora Cáceres y Carlos Concha |

## 9.4 ¿Qué haremos si el proyecto no resulta como esperamos?

| Si falla… | Plan B | Cómo se presenta |
| :-- | :-- | :-- |
| **La red Wi-Fi** | Segundo hotspot (otro celular) con el mismo nombre y contraseña, en 2,4 GHz. | Igual que la demo normal. |
| **El sensor o la balanza** | El **simulador** envía lecturas por la misma API y el dashboard sigue funcionando. | El dashboard muestra la etiqueta **SIMULADO**. |
| **La celda de carga no llega a tiempo** | Demostrar el nivel de llenado con el sensor ultrasónico real y el peso con el simulador. | Se explica qué parte es real y cuál es simulada. |
| **Todo el equipo** | **Video fechado** de una prueba real grabada antes del 26 de noviembre. | Se presenta como video, no como demo en vivo. |
| **La precisión no cumple el criterio** | Mostrar los resultados obtenidos, la causa probable y el ajuste planeado. | Se reconoce el límite en lugar de ocultarlo. |

> Un plan B no debe presentar como real lo que solo fue simulado.

---

[← Volver al índice de la semana 13](README.md)
