# 29 · Iteración 5 — Oportunidades de mejora y usabilidad

**Estado (2026-11-24):** implementado en la rama `feat/estado-sensor-llenado` y verificado en Windows + PostgreSQL local de pruebas (§4). **Sin migración nueva** (solo lectura de datos existentes): funciona igual en Supabase con las migraciones ya aplicadas. Falta la **prueba con usuarios reales** (§5), que hace el equipo con el Hub.

## 1. Alcance acordado con el usuario
Las tres reglas mínimas de `docs/06` con **umbrales fijos en el código** (provisionales hasta acordarlos con el Hub, `docs/11`), una pantalla «Oportunidades», un resumen en Inicio y una guía rápida para el operador en «Ayuda». Decisión: ADR-031.

## 2. Reglas (`src/modules/opportunities/rules.ts`, funciones puras)
| Regla | Umbral provisional | Evidencia mostrada | Sugerencia |
|---|---|---|---|
| Acumulación prolongada | Saldo de un material en una zona ≥ 20 kg **y** su lote más antiguo con ≥ 14 días (fecha del pesaje que creó el lote) | Lotes con saldo (enlace a cada lote, saldo y antigüedad) | Revisar la frecuencia de retiro o coordinar un despacho |
| Mediciones omitidas | Últimos 14 días: ≥ 3 omitidas, o cobertura < 80 % con ≥ 5 esperadas. «Cero confirmado» cuenta como medición hecha; lo de hoy (pendiente) no cuenta | Días omitidos | Asignar responsable o recordatorio; si el contenedor ya no se usa, terminar su calendario |
| Contaminación frecuente | Últimos 30 días: zona con ≥ 10 pesajes y ≥ 30 % con contaminación observada. Con menos de 10 pesajes no se concluye (base insuficiente) | Pesajes marcados (enlace a cada pesaje) | Revisar la señalética e información junto a los contenedores |

- Cada caso muestra: alcance, **lo observado cuantificado**, el umbral, qué se revisó, la sugerencia y la evidencia (hasta 10 registros con el total). Cada regla sin casos lo dice («Sin casos con los datos actuales»).
- Las sugerencias son prudentes: indican dónde mirar, no la causa (`docs/06`: no afirmar causalidad por una fluctuación aislada).
- La cobertura usa la misma función que el tablero (`hc.coverage_occurrences`), por lo que ambos coinciden.
- **Origen:** se evalúa solo «Reales» o solo «DEMO» (por defecto reales); nunca se mezclan. **Ámbito:** la RLS limita a las zonas del usuario. Solo lectura: evaluar no escribe nada (probado).

## 3. Qué se construyó
| Pieza | Detalle |
|---|---|
| `/oportunidades` (menú «Oportunidades», todos los roles con `indicators:read`) | Selector Reales/DEMO, hora de evaluación, total, una sección por regla con umbral y casos; evidencia desplegable con enlaces. |
| Inicio | Tarjeta «Oportunidades de mejora» con el total por regla y el primer caso de cada una; enlace al detalle del mismo origen. |
| Ayuda | «Guía rápida del operador»: 6 pasos del día (revisar Inicio, pesar, confirmar cero, registrar retiro, qué hacer ante un error, datos del sensor) con enlaces. |
| Glosario | «Oportunidad de mejora». |

## 4. Verificación (resultados reales, Windows 11 + PostgreSQL 18 local de pruebas)
- `tsc` y `eslint` sin errores (1 aviso preexistente). `next build` correcto.
- **Vitest 452/452 (38 archivos)**: `tests/unit/opportunities.test.ts` (11: bordes exactos de cada umbral, base insuficiente, cero confirmado, pendientes de hoy, recorte de evidencia, zonas y materiales separados) y `tests/integration/opportunities.test.ts` (4: casos detectados con datos registrados por las funciones reales, DEMO/real separados, ámbito del operador y solo lectura).
- **Playwright 103/103** (97 previas + 6 de `tests/e2e/oportunidades.spec.ts`: caso DEMO con umbral, observación, sugerencia y evidencia que abre el lote; «Reales» sin casos DEMO; resumen en Inicio por origen; lector con acceso; guía del operador en Ayuda; axe-core a 1280 y 390 px sin desborde), con `DB_SSL=disable` contra el PostgreSQL de pruebas del puerto 54329. Una corrida anterior tuvo 1 fallo de la prueba (no de la regla): esperaba una antigüedad de 2 cifras y otras pruebas dejan un lote de 259 días; se ajustó la prueba.

## 5. Prueba con usuarios (pendiente; la realiza el equipo)
Requisito CE-03 / `docs/07` «operación sin instrucciones». Pauta propuesta (3–5 personas del Hub, sin explicación previa, con datos DEMO):
1. «Registre el pesaje del contenedor X con bruto 6,40 kg y tara 0,35 kg.» Medir tiempo (meta propuesta en `docs/10`: ≤ 90 s) y errores.
2. «Hoy el contenedor Y está vacío; déjelo registrado.» ¿Encuentra «Confirmar cero» sin ayuda?
3. «Se despacharon 3 kg del lote L-…; regístrelo.»
4. «¿Hay algo que convenga revisar esta semana?» ¿Llega a Oportunidades y entiende un caso y su evidencia?
5. Preguntar qué palabra no entendió y anotar sugerencias.
Registrar en `docs/15`: participantes (sin datos personales), tiempos, tareas completadas sin ayuda y cambios propuestos.

## 6. Límites
- Umbrales sin validar con el Hub; cambiarlos exige editar `THRESHOLDS` y documentarlo aquí.
- No hay notificaciones (correo/campana) ni historial de alertas: los casos se calculan al abrir la página.
- La regla de acumulación usa la ubicación = zona (H-01 provisional) y la fecha del pesaje que creó el lote.
- La contaminación depende de que el operador marque la casilla; si no se usa, la regla no detecta nada.
- Los datos DEMO de la semilla no generan casos por sí solos; en las pruebas se crean pesajes y calendarios para ello.
