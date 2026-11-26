# 7. Validación

Se siguen los cinco pasos de validación vistos en la [clase 12](../../bitácora/semana_13/3_retroalimentacion_informes.md): función, indicador, criterio, prueba y evidencia.

## 7.1 Pruebas ya realizadas (con datos ficticios)

| Prueba | Resultado | Entorno | Evidencia |
| :-- | :-- | :-- | :-- |
| Pruebas automáticas completas: unitarias e integración (Vitest) | ✅ 365 de 365 | Linux + PostgreSQL 16 local, 19 nov | `app/docs/14` y `app/docs/15` |
| Pruebas de punta a punta, con revisión de accesibilidad (Playwright + axe) | ✅ 83 de 83, incluidas las 13 pantallas a 390 px de ancho | Linux, 19 nov | `app/docs/26` |
| Tipos, lint y pruebas unitarias en Windows | ✅ Sin errores; 174 de 174 pruebas unitarias | Windows 11, Node 24, 19 nov | Ejecución del 19 de noviembre |
| Migraciones y uso manual en Supabase | ✅ Migraciones 0001–0010 aplicadas; registro y tablero probados a mano | Supabase (desarrollo), 19 nov | `app/docs/14` |
| Respaldo y restauración de la base | ✅ Respaldo real de Supabase restaurado en una base local | 19 nov | `app/docs/24` |

**Límite:** ninguna de estas pruebas usa mediciones reales del Hub ni del contenedor. Faltan las pruebas de integración y de punta a punta en Windows (requieren PostgreSQL local).

## 7.2 Pruebas pendientes del sensor

| ID | Función | Indicador | Criterio de aceptación | Prueba | Evidencia |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **P1** | Detectar ingresos | Ingresos detectados / ingresos enviados | 100 % detectados y 0 duplicados | Secuencia simulada conocida de 50 lecturas (escenarios `normal`, `ruido` y `duplicados`) | Resultado de Vitest y tabla de la prueba |
| **P2** | Detectar retiros | Retiros detectados / retiros enviados | 100 % | Incluida en P1 | Ídem |
| **P3** | Acumulado correcto | Diferencia entre el acumulado del dashboard y el esperado | 0 g con datos simulados | Escenario `perdida` | Captura del dashboard y tabla |
| **P4** | Mostrar a tiempo | Segundos entre el envío del ESP32 y su aparición en el dashboard | < 10 s en el 95 % de los casos | 20 envíos con el ESP32 real | Tabla con horas de envío y de visualización |
| **P5** | Conexión estable | Lecturas recibidas / lecturas enviadas | ≥ 98 % durante 1 hora | ESP32 real en el hotspot que se usará en la feria | Conteo de mensajes recibidos |

Los criterios de P4 y P5 son propuestos por el equipo y pueden ajustarse tras la primera prueba.

## 7.3 Registro mínimo por prueba

* **Antes:** objetivo, procedimiento y materiales, criterio de aceptación.
* **Durante:** fecha, responsable, condiciones (red usada, distancia al hotspot) y resultados.
* **Después:** cálculo del indicador, fallas, cambios realizados y nueva prueba.

Las tablas y capturas se guardan en `assets/` de la semana en que se realiza cada prueba.

---

[← Volver al índice del MVP del software](README.md)
