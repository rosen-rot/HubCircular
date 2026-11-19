# 17 · Auditoría documental (Fase 0)

**Fecha:** 2026-11-18 · **Agente:** Claude (sesión de escritorio) · **Alcance:** lectura íntegra de `CLAUDE.md`, `AGENTS.md`, `README.md`, `PROMPT_MAESTRO_HUBCIRCULAR_V2.md`, `PROMPT_INICIAL_CODEX.md`, `docs/00`–`docs/16`, la maqueta `diseno/HubCircular_Dashboard_MVP.png`, la ficha oficial (`referencias/Fichas_Desafios_Capstone_2026.pdf`, 9 páginas, Desafíos 01–09) y la propuesta histórica (`referencias/HubCircular_Propuesta_Completa_Actualizada_2026.md`, 1.129 líneas).

**Estado del repositorio al inicio:** carpeta sin Git, sin código, sin `package.json`. Solo documentación y referencias (confirma lo que dicen `README.md` y `docs/14`).

## 1. Resumen de requisitos (lo que el software debe lograr)

Fuente oficial, Desafío 04 *Gestión y medición de residuos reciclables del Hub* (Sostenibilidad): producto mínimo = (a) prototipo de registro y seguimiento, (b) metodología de medición para un flujo/espacio piloto, (c) panel de indicadores de generación, recuperación y/o destino. Criterios de éxito: datos periódicos y comparables, detección de oportunidades de reducción/reutilización/reciclaje, operación sencilla por el equipo del Hub. La ficha **coincide** con lo que resumen `docs/00` y `docs/01` (PME-01..03, CE-01..03). La ficha es de uso interno ("No distribuir externamente").

Prioridades P0 del MVP: autenticación con roles, catálogo configurable, pesaje manual (bruto/tara/neto) con lote, historial, retiro parcial con saldo no negativo, dashboard reconciliable, protocolo con cobertura. IoT es paralelo y **no bloquea** (`docs/07`, regla de prioridad).

## 2. Hallazgos: inconsistencias, vacíos y riesgos

Severidad: **A** = condiciona el diseño y debe resolverse antes de la iteración indicada · **M** = decidir durante la iteración · **B** = menor / de redacción.

| # | Sev. | Hallazgo | Dónde | Tratamiento propuesto (ver ADR en `docs/18`) |
|---|---|---|---|---|
| H-01 | A | **"Ubicación" no está modelada.** `movements.from_location_id/to_location_id` y los saldos por "ubicación" no apuntan a ninguna tabla. | `docs/03` | ADR-005: ubicación = zona (los espacios de acopio se modelan como zonas). Provisional; revisar con el Hub en Iter. 2. |
| H-02 | A | **Modelo de saldo sin elegir** ("elegir una y documentar prueba de concurrencia"). | `docs/03` | ADR-004: tabla `batch_location_balances` con `CHECK (balance_g >= 0)`, actualizada solo por funciones transaccionales con bloqueo de fila. En Fase 1 existe la tabla y la fila inicial; los movimientos llegan en Iter. 2. |
| H-03 | A | **Alcance de `idempotency_key` indefinido** (global vs. por usuario). | `docs/03`, `docs/04` | ADR-006: única por `(created_by, idempotency_key)`; misma clave + payload distinto ⇒ conflicto. |
| H-04 | A | **Pesaje cero vs. captación.** `weighings.net_g > 0` (docs 01/03) contradice en apariencia el estado "cero confirmado" (docs 06/10/12), que la propuesta (RN-01) trata como *inspección*, no como captación. | `docs/03`, `docs/06`, propuesta §13 | Un cero confirmado **no** es un pesaje; se registrará en `measurement_occurrences` (Iter. 3). En Fase 1 el servidor rechaza neto ≤ 0. |
| H-05 | A | **Valorización: ¿movimiento o verificación?** La propuesta lista `RECOVERY_CONFIRMED` como evento y un endpoint `confirm-recovery`; `docs/01` y `docs/03` exigen que confirmar **no** cree otra salida; `docs/04` no lista el endpoint. | propuesta §6/§13, `docs/01` RF-07, `docs/03` | Modelar como verificación sobre `movement_evidence` (no como movimiento). Decidir en Iter. 2. |
| H-06 | M | **Fecha del KPI "valorización confirmada"**: "fecha de despacho **o** confirmación". | `docs/06` | Decidir en Iter. 3; hasta entonces rotular explícitamente cuál se usa. |
| H-07 | M | **Material por contenedor vs. excepción.** `containers.material_id` único; RN-03 admite "excepción justificada" y `weighings.material_id` es columna propia. | `docs/03`, propuesta RN-03 | Fase 1: el material del pesaje se **deriva** del contenedor; sin excepciones (se rechaza lo incompatible). Excepción justificada queda como mejora (decisión pendiente). |
| H-08 | M | **Terminología "gestor"** designa a la vez a un rol del Hub (lector/analítica) y al tercero que retira residuos (destino). | `docs/00`, `docs/13`, propuesta §15 | Rol = `lector`; el tercero = "gestor de residuos"/`destinations`. |
| H-09 | M | **Alcance de rol "operador".** `docs/00` dice "su ámbito"; `docs/08` exige no leer zonas ajenas; no hay modelo de ámbito salvo `user_roles.zone_id`. | `docs/00`, `docs/03`, `docs/08` | ADR-003: ámbito por `user_roles.zone_id` (NULL = todas); aplicado en servidor **y** en RLS. |
| H-10 | M | **¿Puede el administrador registrar pesajes?** No especificado. | `docs/00`, `docs/13` | Supuesto: sí (equipo pequeño). Registrado en `docs/11`. |
| H-11 | M | **Contrato IoT divergente.** La propuesta (§27) usa `device_id`, `sequence`, `calibration_version`, tablas `device_calibrations`, `detected_events`, `device_alerts`; `docs/04` usa `deviceId`, `messageId`, `quality` y solo `devices`/`sensor_readings`. | propuesta §27 vs `docs/03`/`docs/04` | Prevalece `docs/04` (v0.1). Las tablas extra se evaluarán en Iter. 4. Sin impacto en Fase 1. |
| H-12 | M | **Propuesta histórica obsoleta en hardware**: §25 describe celda de **cuatro hilos** (E+/E−/A+/A−) y estado "solicitado"; el estado real es celda de **tres hilos**, recibida, sin pinout verificado. | propuesta §23–25 vs `docs/14` | Prevalece `docs/14`. No usar §25 para cablear. El software no depende del cableado. |
| H-13 | M | **Datos demo vs. reales** exigidos como "aislados", sin mecanismo definido. | prompt maestro §3, `docs/09` | ADR-007: columna `data_origin ('real','demo')` en catálogo; el pesaje hereda el origen del contenedor (el cliente no puede elegirlo). Los KPIs futuros filtrarán por origen. |
| H-14 | M | **Cota superior de masa** no definida (necesaria para validar en servidor). | `docs/01`/`docs/03` | ADR-008: tope de cordura 1.000 kg por registro (`1_000_000 g`), parametrizable por migración. |
| H-15 | M | **Zona horaria de entrada.** Se pide guardar UTC y mostrar `America/Santiago`; no define cómo se interpreta una hora ingresada manualmente. | `docs/02`, `docs/06` | Se interpreta en `America/Santiago` y se convierte a UTC con prueba de horario de verano. |
| H-16 | B | `README.md` nombra la carpeta raíz `HubCircular_Paquete_Codex_Software`; la carpeta real es `HubCircular`. | `README.md` | Solo redacción. |
| H-17 | B | `docs/07` se titula "para Codex", mientras el prompt maestro es común a Claude Code y Codex. | `docs/07` | Redacción; el contenido es válido para ambos. |
| H-18 | B | La maqueta usa "Registros" y el código `HUB-001`; `docs/05` usa `/registro`, `/historial` y códigos del tipo `HUB-Z01-EST01-CARTON`. | `diseno/`, `docs/05`, propuesta §7.1 | La maqueta es orientativa. Se sigue `docs/05`. |
| H-19 | B | La maqueta muestra "Peso actual", "Estado de sensor: Conectado, lectura en tiempo real" con cifras ficticias. | `diseno/` | No implementar en Fase 1 (telemetría es Iter. 4); jamás mostrar "Conectado" sin telemetría real. |
| H-20 | R | **Riesgo de publicación**: el ZIP y `referencias/*.pdf` (ficha **interna**) están en la raíz del proyecto; un `git add .` los incluiría. | `README.md`, `docs/16` | `.gitignore` excluye el ZIP y el PDF por defecto (ver ADR-009). |
| H-21 | R | **Sin acceso a Supabase, hosting ni credenciales** (consistente con `docs/02` y prompt §2). Se necesita persistencia real para la vertical. | prompt §6 | ADR-001/002: PostgreSQL estándar, migraciones portables a Supabase; autenticación local detrás de una interfaz sustituible. **No se simula persistencia remota.** |
| H-22 | R | **Falta de balanza de referencia y calibración** para validar pesos reales. | `docs/11` | Fuera del software; el MVP depende de pesaje manual con instrumento verificado por el Hub. |
| H-23 | R | **Entorno local del usuario con poco espacio** (el shell local no pudo iniciar por falta de disco). | sesión | Se trabajó en la nube; ver `docs/15` y README para reproducir en el equipo del usuario. |

## 3. Cobertura de la ficha y de los requisitos por iteración

Leyenda: ✅ implementado y probado en Fase 1 · 🟡 parcial · ⏳ planificado (iteración) · — no aplica a esta fase.

| Requisito | Descripción | Iteración | Estado tras Fase 1 |
|---|---|---|---|
| RF-01 | Autenticación | 1 | ✅ |
| RF-02 | RBAC (admin / operador / lector) | 1 | ✅ (servidor + RLS); gestión de usuarios por UI ⏳ |
| RF-03 | Materiales y ubicaciones (alta/edición/inactivación) | 1–2 | 🟡 semilla demo + inactivación respetada por el servidor; UI de administración ⏳ |
| RF-04 | Registro de pesaje (neto, lote, transacción) | 1 | ✅ |
| RF-05 | Historial y filtros | 1 | ✅ |
| RF-06 | Movimientos | 2 | ⏳ (saldo inicial y restricción `>= 0` ya existen) |
| RF-07 | Retiros y destinos | 2 | ⏳ |
| RF-08 | Correcciones auditables | 2 | 🟡 (pesajes inmutables por trigger; flujo de corrección ⏳) |
| RF-09 | Dashboard | 3 | ⏳ |
| RF-10 | Exportación CSV | 3 | ⏳ |
| RF-11 | Alertas | 5 | ⏳ |
| RF-12 / RF-13 | Ingesta y estado IoT | 4 | ⏳ (contrato v0.1 sin cambios) |
| RF-14 | Registro manual con IoT desconectado | 1 | ✅ (no existe dependencia de IoT) |
| RF-15 | QR precarga contenedor sin privilegios | 1 | ✅ (`/registro?container=CODE`) |
| PME-01 | Prototipo de registro y seguimiento | 1–2 | 🟡 registro + lote + saldo; retiro parcial en Iter. 2 |
| PME-02 | Metodología piloto | 6 | ⏳ (protocolo en `docs/10`) |
| PME-03 | Panel de indicadores | 3 | ⏳ |
| CE-01..03 | Comparabilidad, oportunidades, operación sencilla | 3–5 | ⏳ |

## 4. Decisión de alcance de la "primera fase"

El prompt maestro y `docs/07` definen la **primera vertical** como: autenticación mínima + material/ubicación semilla + registro manual validado + consulta persistida + pruebas. Se implementa **Iteración 0 (proyecto base) + Iteración 1 (primera vertical real)** de `docs/07`, con sus pruebas obligatorias (neto correcto, pesos inválidos, acceso denegado, doble clic). No se adelanta IoT, dashboard avanzado ni movimientos: `PROMPT_INICIAL_CODEX.md` lo prohíbe expresamente hasta tener registro manual e inventario correctos.

## 5. Hechos de hardware tomados como base (sin cambios)

ESP32 con sketch de prueba por USB verificado; HX711 recibido sin soldar; celda de **tres** cables sin pinout/capacidad verificados; resistencias 1 kΩ pendientes de retiro (19-11-2026); ultrasónico sin conectar; Wi-Fi/API/Supabase sin pruebas. Esta fase **no toca firmware ni hardware** y no afirma nada sobre ellos.
