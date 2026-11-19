# 4. Protocolo de Pruebas, Datos y Fallas

Consolidación del segundo avance: cómo vamos a probar, qué datos tenemos hoy y qué problemas encontramos.

## 4.1 Protocolo de pruebas

Cada prueba sigue los cinco pasos vistos en clase (función, indicador, criterio, prueba y evidencia) y se registra antes, durante y después:

* **Antes:** objetivo, procedimiento, materiales y criterio de aceptación.
* **Durante:** fecha, responsable, condiciones y resultados.
* **Después:** cálculo del indicador, fallas, cambios realizados y nueva prueba.

Las pruebas definidas están en los planes de validación del [software](../../mvp/software/7_validacion.md) (P1 a P5) y del [hardware](../../mvp/hardware/7_validacion.md) (H-P1 a H-P5).

## 4.2 Datos obtenidos (con datos ficticios)

| Prueba | Resultado | Entorno |
| :-- | :-- | :-- |
| Pruebas unitarias y de integración (Vitest) | ✅ 365 de 365 aprobadas | Linux + PostgreSQL local |
| Pruebas de punta a punta con revisión de accesibilidad (Playwright) | ✅ 83 de 83 aprobadas, incluidas 13 pantallas en ancho de celular (390 px) | Linux |
| Tipos, lint y pruebas unitarias en Windows | ✅ Sin errores; 174 de 174 pruebas unitarias aprobadas | Windows 11 |
| Migraciones de la base de datos en Supabase | ✅ 10 de 10 aplicadas | Supabase (desarrollo) |
| Respaldo y restauración de la base de datos | ✅ Respaldo real restaurado en una base local | Supabase → local |
| ESP32 | ✅ Programa de prueba cargado; responde por el monitor serie | Arduino IDE, Windows |

> Estos datos muestran que **la plataforma funciona**, pero **no son mediciones de residuos**: todo lo registrado es ficticio y está etiquetado DEMO. Las pruebas de la balanza (H-P1 a H-P5) y del envío por Wi-Fi (P4 y P5) quedan para el tercer avance.

## 4.3 Fallas y problemas encontrados

| Problema | Impacto | Qué haremos |
| :-- | :-- | :-- |
| **La celda de carga tiene 3 cables** (probablemente de medio puente). | No se puede conectar directo al HX711. | Medirla con multímetro y completar el puente con resistencias; si la precisión no alcanza, comprar una segunda celda ([opciones](../../mvp/hardware/2_componentes_estado.md#22-la-celda-recibida-tiene-3-cables)). |
| **El HX711 tiene los pines sin soldar.** | Sin conexión confiable no hay lectura. | Soldar los pines antes de cualquier prueba. |
| **La plataforma aún no recibe lecturas del ESP32** ni tiene simulador. | Sin esto no existe la demo "una bolsa aparece en el dashboard". | Construir la recepción de lecturas, el panel en vivo y el simulador ([plan](5_plan_tercer_avance.md)). |
| **Error de comunicación sobre la arquitectura:** los documentos del MVP describían FastAPI + SQLite, mientras la plataforma se construyó con Next.js + PostgreSQL. | Documentos y código no coincidían. | Se corrigieron los documentos del [MVP](../../mvp/README.md) el 19 de noviembre. Desde ahora, los cambios técnicos se acuerdan en el equipo antes de documentarlos. |
| **Por definir:** ¿el ingreso detectado por el sensor cuenta solo o lo confirma un operador? | Afecta la demo y el mensaje del pitch ("sin que nadie escriba nada"). | Decidirlo en equipo antes del 26 de noviembre ([reglas](../../mvp/software/4_reglas_medicion.md#42-dos-niveles-de-dato)). |
| La plataforma solo se probó completa en Linux. | Podría fallar algo en el notebook de la feria (Windows). | Correr todas las pruebas en ese notebook antes de la feria. |
| El hito del 12 de noviembre no se cumplió en el prototipo. | Menos tiempo para pruebas reales. | Concentrar la semana en el montaje y la integración. |

---

[← Volver al índice de la semana 15](README.md)
