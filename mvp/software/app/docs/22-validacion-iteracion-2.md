# 22 · Validación de la Iteración 2 (Trazabilidad)

**Fecha:** 18-11-2026. **Entorno de prueba:** Linux, Node 22.23, PostgreSQL 16.15 local, Next 16.4.6, Chromium (Playwright). **No** se probó en Windows nativo ni contra Supabase.

## 1. Qué se entregó
- Migración `db/migrations/0007_movements_traceability.sql`: `destinations`, `movements`, `movement_evidence`, `movement_verifications`; funciones `register_movement`, `correct_movement`, `add_movement_evidence`, `verify_movement`, `create_destination`, `set_destination_active`; RLS, privilegios mínimos y auditoría. Decisiones: ADR-019 y ADR-020 (`docs/18`).
- Interfaz: `/retiros` (formulario único para los cinco tipos), `/destinos` (solo administrador), detalle de lote con saldo por ubicación, movimientos, evidencia, historial de verificación y correcciones.
- `npm run db:check` informa movimientos, destinos, evidencias, verificaciones y comprueba que ningún saldo sea negativo.
- Datos DEMO: tres destinos DEMO (`db:seed`).

## 2. Resultados reales de las pruebas
| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` (typecheck) | ✅ sin errores |
| `eslint src tests` | ✅ 0 errores, 0 advertencias |
| `next build` | ✅ (rutas nuevas `/retiros`, `/destinos`) |
| Vitest | ✅ **18 archivos, 225 pruebas** (línea base de la Iteración 1.5 con mezclado: 171; nuevas: 40 de integración de movimientos + 14 unitarias) |
| Playwright E2E | ✅ **31 pruebas** (20 previas + 11 nuevas, incluida accesibilidad axe-core WCAG 2 A/AA sin violaciones serias/críticas en `/retiros`, `/destinos` y detalle de lote) |
| `db:check` sobre la base local | ✅ «Ningún saldo de lote es negativo» |
| Prueba de mutación (concurrencia) | Al quitar los dos `FOR UPDATE` de `register_movement`, fallan la prueba de 10 retiros simultáneos y la de traslados cruzados (la de traslados cruzados registró 9 interbloqueos); se restauró el archivo y vuelven a pasar |

La línea base de «171» incluye el contenedor MIXTO DEMO añadido tras la Iteración 1.5. Una prueba existente (`hardening.test.ts`) esperaba que 0006 fuera la última migración; se ajustó para exigir «0006 y posteriores» y sigue verificando que `anon`/`authenticated` queden sin privilegios tras 0007.

## 3. Casos de aceptación de `docs/01`
| Caso | Cubierto por |
|---|---|
| 3. Lote de 12.000 g, traslado de 12.000 g: lo captado sigue en 12.000 g | `movements.test.ts` («traslado de 12.000 g…»: sin pesajes ni lotes nuevos, saldo 0 → 12.000, total 12.000) |
| 4. Despacho de 9.000 g deja 3.000 g; un segundo de 4.000 g se rechaza | Integración y E2E («lote de 12.000 g…»); `initial_g` sigue en 12.000 |
| 6. Dos retiros simultáneos no pueden dejar saldo negativo | Concurrencia: 10 retiros de 4.000 g sobre 10.000 g ⇒ 2 prosperan, 8 `insufficient_balance`, saldo 2.000 g |
| 8. Despacho sin evidencia no se declara valorizado | UI «Pendiente: sin evidencia»; `verify_movement` exige evidencia; confirmar no crea movimiento ni cambia saldo |

Otras pruebas de `docs/08`: ajuste solo administrador y con motivo; corrección conserva autor, motivo y referencia, una sola vez, y es idempotente; no se revierte si el saldo no alcanza; verificación con historial; RLS por zona (incluido que el lote queda visible tras un traslado); inmutabilidad (HC423); `hc_app` no escribe directamente; `anon`/`authenticated` sin privilegios; ningún destino DEMO con lote real.

## 4. Límites y riesgos
- **Supabase:** la migración 0007 **fue aplicada por el usuario** el 18-11-2026 y `db:check` quedó sin errores (7 migraciones, 0 pendientes, ningún saldo negativo). Tras cargar los destinos DEMO con `db:seed`, el usuario probó a mano los movimientos, la evidencia y la verificación en Supabase con los tres roles e informó «está bien todo» (sin salidas por paso; no verificado por Claude).
- **Windows nativo:** no verificado (igual que en 1.5).
- **Decisiones abiertas:** H-01 (ubicación = zona, provisional), H-05 (valorización = verificación, provisional), H-07 (sin excepciones de material). Cambiarlas no obliga a rehacer los saldos.
- **Zonas visibles:** un operador solo ve como destino de traslado zonas de su ámbito (RLS de `zones`); la función de BD sí permite trasladar a cualquier zona activa si se conoce su identificador. Revisar con el Hub si los traslados entre zonas deben ser exclusivos del administrador.
- Sin API REST de movimientos; sin carga de archivos de evidencia (decisión del usuario); sin dashboard ni CSV (Iteración 3).
- La prueba de doble envío se verificó en PostgreSQL local; el botón se deshabilita al enviar (E2E de doble clic).

## 5. Cómo aplicar 0007 en Supabase (solo con aprobación explícita del usuario)
1. `npm run db:check` (solo lectura) y `npm run db:migrate -- --dry-run`: debe listar únicamente `0007_movements_traceability.sql`.
2. Con la aprobación dada: en PowerShell, `$env:CONFIRM_REMOTE_MIGRATION="<host que imprime el script>"; npm run db:migrate`.
3. `npm run db:check`: debe mostrar 7 migraciones, 0 pendientes y «Ningún saldo de lote es negativo».
4. Para tener destinos DEMO: `$env:CONFIRM_REMOTE_SEED="<host>"; npm run db:seed`. **Atención:** el seed restablece las contraseñas de los usuarios DEMO (a `SEED_*_PASSWORD` o a claves aleatorias que imprime una vez).
5. Revertir: no hay migración «down». Antes de aplicar, confirmar copia de seguridad de Supabase; una reversión sería una migración nueva y revisada.

## 6. Lista de validación manual en Supabase (informada como correcta por el usuario)
1. Operador: lote de 12,000 kg; despacho de 9 kg ⇒ saldo 3,000 kg y «Pendiente: sin evidencia»; segundo despacho de 4 kg rechazado por saldo insuficiente.
2. Operador: agrega evidencia de texto ⇒ «Pendiente de verificación»; sin botones de verificación.
3. Administrador: confirma la valorización ⇒ el saldo no cambia.
4. Administrador: corrige un movimiento sin verificación confirmada ⇒ aparece «Corrige M-…» y se restituye el saldo.
5. Administrador: crea y desactiva un destino ⇒ ya no se ofrece al registrar movimientos.
6. Lector: ve la trazabilidad, sin menú «Movimientos» ni botones de acción.
