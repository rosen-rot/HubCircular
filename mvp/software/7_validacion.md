# 7. Validación

Se siguen los cinco pasos de validación vistos en la [clase 12](../../bitácora/semana_13/3_retroalimentacion_informes.md): función, indicador, criterio, prueba y evidencia.

## 7.1 Pruebas del software

| ID | Función | Indicador | Criterio de aceptación | Prueba | Evidencia |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **P1** | Registrar ingresos | Ingresos detectados / ingresos enviados | 100 % detectados y 0 duplicados | Secuencia simulada conocida de 50 lecturas (escenarios `normal`, `ruido` y `duplicados`) | Resultado de `pytest` y tabla de la prueba |
| **P2** | Detectar retiros | Retiros detectados / retiros enviados | 100 % | Incluida en P1 | Ídem |
| **P3** | Acumulado correcto | Diferencia entre el acumulado del dashboard y el esperado | 0 g con datos simulados | Escenario `perdida` | Captura del dashboard y tabla |
| **P4** | Mostrar a tiempo | Segundos entre el envío del ESP32 y su aparición en el dashboard | < 10 s en el 95 % de los casos | 20 envíos con el ESP32 real | Tabla con horas de envío y de visualización |
| **P5** | Conexión estable | Lecturas recibidas / lecturas enviadas | ≥ 98 % durante 1 hora | ESP32 real en la red que se usará en la feria | Conteo de secuencias recibidas |

Los criterios de P4 y P5 son propuestos por el equipo y pueden ajustarse tras la primera prueba.

## 7.2 Registro mínimo por prueba

* **Antes:** objetivo, procedimiento y materiales, criterio de aceptación.
* **Durante:** fecha, responsable, condiciones (red usada, distancia al router) y resultados.
* **Después:** cálculo del indicador, fallas, cambios realizados y nueva prueba.

Las tablas y capturas se guardan en `assets/` de la semana en que se realiza cada prueba.

---

[← Volver al índice del MVP del software](README.md)
