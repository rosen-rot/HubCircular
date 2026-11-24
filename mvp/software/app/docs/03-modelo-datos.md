# 03 · Modelo de datos conceptual y reglas

Este es un **modelo conceptual para implementar y migrar**, no SQL aplicado. Crear migraciones, constraints, índices y permisos al comenzar. Identificadores UUID, timestamps UTC y masa en gramos enteros (`bigint` si corresponde). No actualizar saldos en cliente.

## Tablas
| Tabla | Campos esenciales | Notas |
|---|---|---|
| `profiles` | id(auth user), display_name, active | No duplicar credenciales de Auth |
| `roles` / `user_roles` | user_id, role, zone_id nullable | administrador, operador, lector |
| `buildings` | id, name, active | Escalable |
| `zones` | id, building_id, parent_id, name, active | Espacios configurables |
| `stations` | id, zone_id, code, active | Punto de reciclaje |
| `materials` | id, name, code, unit='g', active | Categorías validadas |
| `containers` | id, station_id, material_id, code, tare_g?, capacity_l?, active | QR = código, no credencial; `capacity_l` (litros, 0012) solo para interpretar el llenado del sensor |
| `weighings` | id, container_id, material_id, gross_g, tare_g, net_g, source, occurred_at, created_by, notes, idempotency_key | `source` manual/confirmación-IoT; bruto ≥ tara y neto >0 |
| `batches` | id, weighing_id, origin_zone_id, material_id, initial_g, created_at | Lote homogéneo por material |
| `movements` | id, batch_id, type, quantity_g, from_location_id, to_location_id, destination_id?, occurred_at, actor_id, reason?, reference_id? | Eventos/ajustes auditables |
| `destinations` | id, name, type, active | Gestor, reutilización u otro |
| `movement_evidence` | id, movement_id, file_path, kind, verified_by?, verified_at? | Acceso restringido |
| `measurement_schedule` | id, container_id, day_or_frequency, active | Calendario medible |
| `measurement_occurrences` | id, schedule_id, expected_at, status, weighing_id? | esperado, realizado, cero confirmado, omitido, no previsto |
| `devices` | id, code, container_id?, active, credential_hash, last_seen_at | ESP32/simulador; secreto seguro |
| `sensor_readings` | id, device_id, message_id, measured_at, received_at, weight_g?, distance_mm?, fill_pct?, quality, raw_payload? | UNIQUE(device_id,message_id) |
| `recommendations` | id, rule_code, scope, evidence_ref, status, generated_at | Revisables y justificadas |
| `audit_logs` | id, actor_id, entity, entity_id, action, old_summary?, new_summary?, timestamp | Sin secretos ni datos innecesarios |

## Relaciones y consistencia
- 1 edificio → N zonas → N estaciones → N contenedores.
- 1 pesaje → 1 lote (MVP); lote → N movimientos.
- 1 dispositivo puede asociarse a 1 contenedor a la vez; mantener historial si se reasigna.
- 1 dispositivo → N lecturas; ninguna lectura crea automáticamente kilos capturados sin regla de confirmación explícita.
- 1 movimiento de despacho puede enlazar evidencia y confirmación **sin una segunda salida**.
- Valorización confirmada deriva de salidas cuyo respaldo fue verificado; distinguir fecha de salida y fecha de confirmación.
- El saldo disponible de lote se deriva de captación, ajustes y movimientos netos sin duplicar traslados; ubicación de cada porción debe conservarse si hay despachos parciales.

## Invariantes y concurrencia
1. Bruto, tara y neto enteros no negativos; captación neta positiva.
2. Saldo de cualquier lote/ubicación >=0.
3. Material activo y válido para contenedor en la operación inicial.
4. Una corrección no elimina silenciosamente historial; referencia a evento corregido.
5. Idempotencia en `weighings` manuales y lecturas IoT cuando corresponda.
6. Bloquear/serializar filas o usar mecanismo transaccional equivalente al mover material; dos retiros concurrentes no pueden superar saldo.
7. Los registros públicos, si existieran, deben ser agregados y no exponer personas o credenciales.

## Enfoque de saldo sugerido
Opciones: libro mayor append-only de movimientos con consultas y bloqueo transaccional, o `batch_location_balances` materializada con restricciones y actualizaciones solo desde función transaccional. Elegir una y documentar prueba de concurrencia. Para retiros parciales se debe identificar cuánto queda y dónde, no únicamente un `status` global del lote.

## Calendarios y «cero confirmado» (Iteración 3, migración 0010)
- `hc.measurement_schedules`: calendario de medición por contenedor (`weekdays` ISO 1–7, `start_on`, `end_on` inclusive o nulo, autor, `data_origin`). Solo se puede terminar una vez (`end_on`, `ended_by`); no se edita ni se borra.
- `hc.measurement_zero_confirmations`: «cero confirmado» (contenedor revisado, sin residuos) único por contenedor y día; inmutable. **No es un pesaje**: no crea lote ni masa.
- No existe una tabla de ocurrencias: las mediciones esperadas y su estado se **derivan** (`hc.coverage_occurrences`). Reemplaza la `measurement_occurrences` prevista antes. Ver `docs/25`, ADR-026.

## Dispositivos y lecturas (Iteración 4, migración 0011)
- `hc.devices`: `device_code` único (no es credencial), `container_id` (obligatorio al crear), `token_hash` (SHA-256; **no legible** por `hc_app`), `token_prefix`, `stale_after_minutes`, `data_origin` (heredado del contenedor), `last_seen_at`, `last_reading_id`, `revoked_at/by`, `token_rotated_at`. No se borra (solo se revoca); se administra solo con funciones del administrador.
- `hc.sensor_readings`: solo anexado; `UNIQUE (device_id, message_id)`; `container_id` copiado al recibir; `measured_at` (dispositivo), `received_at` (servidor), `clock_ok`, `effective_at`; `weight_g`, `distance_mm`, `fill_percent` pueden ser NULL; `quality`; `data_origin`. No incluye `raw_payload` (no se guarda el cuerpo crudo).
- Previsión original ajustada: `credential_hash` → `token_hash`; `container_id` es obligatorio (no hay dispositivos sin contenedor) y no se guarda historial de reasignaciones (no hay reasignación aún). Ver `docs/27`.
