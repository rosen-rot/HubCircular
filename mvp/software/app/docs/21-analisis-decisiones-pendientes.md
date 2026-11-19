# 21 · Análisis de decisiones pendientes H-01, H-05 y H-07

> **Ninguna de estas decisiones está resuelta.** Este documento ordena alternativas y recomienda, pero la decisión corresponde al Hub Providencia y al equipo. Lo implementado hoy es provisional y está marcado como tal en `docs/11`, `docs/17` y `docs/18`. Los textos de `docs/01`–`docs/06` y la ficha oficial no se modifican para ajustarlos al código. Fecha: 2026-11-18.

## Actualización 2026-11-18 · información aportada por el equipo (no confirmada por el Hub)

Un integrante del equipo informó, de forma verbal y sin que el Hub lo haya confirmado por escrito, lo siguiente:

1. El Hub **no pesa** sus residuos y **no tiene una gestión de residuos reciclables** como tal: el proceso lo introduce el piloto.
2. Es **probable** que lleguen residuos de otro material a los contenedores; no se sabe cuándo ocurre.
3. Existen **contenedores globales** donde se almacenan muchas cosas **mezcladas**, como un basurero común.

Efecto sobre cada decisión (ninguna queda resuelta):

- **H-01.** No hay acopio ni bodegas existentes que representar: la estructura la define el piloto. El supuesto «ubicación = zona» (ADR-005) sigue siendo el más simple y no choca con lo informado. Se revisa solo si el equipo decide crear un punto de acopio común distinto de las zonas de captación.
- **H-05.** Sin gestión de reciclables previa, **no se sabe si habrá un gestor externo ni qué comprobante entregaría**. Mientras no exista un destino definido, la valorización confirmada no se puede modelar con evidencia real: el despacho de la iteración 2 debería poder registrarse con destino «por definir» y sin verificación. La pregunta al Hub cambia: quién retira hoy los residuos del edificio y si aceptarían coordinar un gestor de reciclables.
- **H-07.** Gana peso: es **probable** que el caso ocurra. Además, los contenedores globales mezclados plantean el caso de un contenedor **sin material único**. Sin cambiar el código se puede modelar un material de catálogo «MIXTO / NO CLASIFICABLE» y un contenedor global con ese material (el pesaje deriva el material del contenedor); hay que cargarlo como dato real con `data_origin = 'real'` (no hay interfaz de administración de catálogo todavía). La excepción justificada (alternativa 2) sigue pendiente, pero deja de ser opcional si se quieren pesar contenedores de material único con contaminación frecuente.
- **Implementado a petición del usuario (solo DEMO, ADR-018):** material `DEMO-MIXTO` y contenedor `DEMO-Z01-GLOBAL-MIXTO` sin tara nominal. No resuelve H-07: la excepción justificada sigue pendiente.
- **Alcance a decidir por el equipo (nueva pregunta):** ¿el piloto pesa solo los contenedores segregados que el equipo instale, o también los globales mezclados (por ejemplo, para medir cuánto reciclable se pierde)? Si se pesan los globales, los indicadores deben distinguirlos de la captación segregada para no inflar «reciclable capturado».

---

## H-01 · «Ubicación» de inventario = zona

**Problema.** `docs/03` define saldos y movimientos «por ubicación» (`from_location_id`, `to_location_id`) sin que exista una entidad *ubicación*. Hoy (ADR-005) se usa la **zona** del contenedor como ubicación; el saldo de un lote nace en la zona de origen (`hc.batch_location_balances.zone_id`).

**Alternativas.**

1. **Ubicación = zona (actual).** Una sola jerarquía (edificio → zona → estación → contenedor). Simple; el ámbito de permisos (`user_roles.zone_id`) y el inventario comparten la misma entidad.
2. **Entidad `storage_locations` propia** (bodega, estante, punto de acopio) dependiente de una zona. Permite saber *dónde físicamente* está cada kilo tras trasladarse del contenedor al acopio.
3. **Ubicación = estación.** Más fina que la zona pero sin representar el acopio, que normalmente no es una estación de captación.
4. **Híbrido:** zonas para permisos y reportes; `storage_locations` solo para el saldo y los traslados internos.

**Riesgos.**

- Con la alternativa 1, un traslado del contenedor a una bodega que esté fuera de la zona piloto no se puede representar sin inventar zonas artificiales que contaminan el ámbito de permisos y los indicadores «por zona».
- Con 2 y 4, hay que migrar saldos existentes y definir qué ubicación inicial recibe un lote recién captado.
- Cambiar tarde obliga a reescribir `movements` y los saldos con *backfill* (los pesajes y lotes ya son inmutables, por lo que solo cambian los saldos y los futuros movimientos).

**Recomendación.** Mantener la alternativa 1 **hasta la Iteración 2** y decidir con el Hub antes de crear `movements`. Si el Hub confirma que el material se traslada a un acopio distinto de la zona de captación, adoptar la alternativa 4 (zona para permisos, `storage_locations` para inventario). Es la que menos rompe: el saldo inicial seguiría en una ubicación «por defecto» de la zona.

**Consecuencias.**

- *Esquema (alt. 4):* nueva tabla `hc.storage_locations (id, zone_id, code, name, active, data_origin)`; `batch_location_balances` pasa de `zone_id` a `location_id` (migración nueva con *backfill*: una ubicación por defecto por zona que ya tenga saldos); `movements.from/to_location_id` apuntan a `storage_locations`; RLS por zona se hereda vía `location → zone`.
- *UI:* selector de ubicación destino en traslados y despachos; el inventario se muestra por ubicación y se agrega por zona. El formulario de pesaje no cambia.

**Pregunta para el Hub Providencia.** Después de pesar, ¿el material se queda en el contenedor de la estación o se traslada a un lugar de acopio común? Si se traslada: ¿cuántos lugares de acopio hay, y están dentro de una misma zona o son compartidos entre zonas?

---

## H-05 · Valorización: ¿movimiento o verificación?

**Problema.** La propuesta lista el evento `RECOVERY_CONFIRMED` y un endpoint `confirm-recovery`, lo que sugiere un *movimiento* adicional. `docs/01` (RF-07) y `docs/03` exigen que confirmar **no** cree una segunda salida (no se debe restar dos veces la misma masa). `docs/04` no lista el endpoint.

**Alternativas.**

1. **Verificación sobre la salida (recomendada hoy):** el despacho es el único movimiento que resta saldo; la «confirmación de valorización» es un registro de evidencia (`movement_evidence`/`recovery_verifications`) ligado a ese movimiento, con estado, fecha de confirmación, responsable y archivo/referencia.
2. **Segundo movimiento `RECOVERY_CONFIRMED` de masa cero** que solo cambia el estado. Consistente con un libro mayor, pero se presta a restar masa por error y duplica el concepto de «salida».
3. **Estado en el propio movimiento de despacho** (columna `recovery_status`). Más simple; pierde historial si la verificación se corrige o se rechaza y no admite varias evidencias.
4. **Verificación parcial por tramos** (un despacho confirmado en partes). Necesaria si un gestor confirma parte de lo entregado.

**Riesgos.**

- Contar la valorización como salida (alt. 2 mal implementada) duplica masa en los indicadores, error que `docs/06` señala como crítico.
- Las alternativas 1 y 3 exigen definir qué cuenta como evidencia válida y quién verifica, que **no está confirmado** (`docs/11`: «Evidencia de valorización y gestores disponibles»).
- La alt. 4 complica el KPI y la UI; no conviene antes de saber si el gestor confirma por tramos.

**Recomendación.** Alternativa 1, con la verificación como entidad propia (1 movimiento → 0..N evidencias → 0..1 verificación vigente, con historial) y sin tocar saldos. El KPI «valorización confirmada» se calcula a partir de verificaciones aceptadas, filtrado por `data_origin = 'real'` y rotulando si usa fecha de despacho o de confirmación (ver H-06).

**Consecuencias.**

- *Esquema:* `movement_evidence (id, movement_id, kind, reference, uploaded_by, created_at)` y `recovery_verifications (id, movement_id, status in (pendiente, confirmada, rechazada), verified_by, verified_at, notes)`; restricción de que solo exista una verificación vigente por movimiento; verificación solo sobre movimientos de tipo despacho. Sin cambios en `batch_location_balances`.
- *UI:* en el detalle de un despacho, panel «Evidencia y valorización» (adjuntar referencia, confirmar/rechazar según rol). El dashboard distingue «despachado» de «valorización confirmada».
- *API:* `docs/04` no lista el endpoint; si se necesita, agregar `POST /api/movements/{id}/verification` y actualizar `docs/04` mediante decisión explícita.

**Pregunta para el Hub Providencia.** ¿Qué documento o comprobante entrega el gestor que retira el material (guía de despacho, certificado de valorización, correo, foto) y quién del Hub lo revisa? ¿Un gestor puede confirmar solo una parte de lo que retiró?

---

## H-07 · Material del pesaje distinto del esperado del contenedor (RN-03)

**Problema.** RN-03 admite una «excepción justificada» cuando el material pesado no coincide con el esperado del contenedor, pero `containers.material_id` es único y hoy el material del pesaje se **deriva** del contenedor: un material distinto simplemente no se puede registrar (Fase 1: sin excepciones).

**Alternativas.**

1. **Sin excepciones (actual).** El contenido debe corresponder al contenedor; lo que no corresponde se registra como rechazo/contaminación (campo `contamination_observed`) o no se registra.
2. **Excepción justificada:** el operador elige otro material, con motivo obligatorio (lista corta + texto), el pesaje guarda `material_id` real y `expected_material_id`, y queda marcado para revisión del administrador.
3. **Reclasificación posterior** sobre el lote (movimiento de ajuste) en lugar de en el pesaje; el pesaje conserva el material esperado.
4. **Contenedores de material «mixto/no clasificable»** (la propuesta menciona material no clasificable): se registra tal cual y se segrega después.

**Riesgos.**

- La alt. 2 permite sesgar los indicadores por material si se abusa; requiere motivo, auditoría y filtro de revisión. El lote hereda un material distinto al del contenedor, lo que afecta la regla de lotes homogéneos del MVP.
- La alt. 1 puede inducir al operador a registrar el material «esperado» aunque no sea el real (dato falso por conveniencia), lo peor para la trazabilidad.
- La alt. 3 obliga a movimientos de ajuste que aún no existen (Iteración 2).

**Recomendación.** Mantener la alt. 1 en el piloto inicial y **decidir con el Hub antes de la Iteración 2**. Si en el piloto aparecen discrepancias reales, adoptar la alt. 2 con revisión del administrador; es la que preserva la veracidad del dato sin romper la homogeneidad del lote (el lote tomaría el material real del pesaje).

**Consecuencias.**

- *Esquema (alt. 2):* nueva migración que agrega a `hc.weighings` `expected_material_id`, `material_exception_reason` y `exception_status` (null / pendiente de revisión / aprobada); `register_weighing` recibe `p_material_id` opcional y exige motivo si difiere; el `CHECK`/trigger de coherencia lote–pesaje se actualiza; `weighings` sigue siendo inmutable (la revisión se registra en una tabla de revisiones, no editando el pesaje).
- *UI:* en `/registro`, casilla «El material no es el esperado» que muestra selector de material y motivo; insignia «Excepción» en historial y detalle; bandeja de revisión para el administrador. Hasta entonces, el formulario muestra el material esperado sin opción de cambio.

**Pregunta para el Hub Providencia.** En los contenedores de la zona piloto, ¿es frecuente que lleguen residuos de otro material (por ejemplo, plástico en el contenedor de cartón)? Cuando ocurre, ¿se separa en el momento o se pesa tal cual? ¿Quién debe poder aprobar una excepción?

---

## Resumen

| Decisión | Estado | Comportamiento actual | Antes de qué iteración decidir |
|---|---|---|---|
| H-01 | Abierta | ubicación = zona | 2 (antes de `movements`) |
| H-05 | Abierta | no implementada | 2 |
| H-07 | Abierta | sin excepciones | 2 |
