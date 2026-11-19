# 07 · Hoja de ruta de implementación para Codex

> **Estado a 2026-11-19:** Iteraciones 0, 1, 2 y 3 implementadas y probadas en PostgreSQL local (ver `docs/14`, `docs/15`, `docs/22`, `docs/25`); la migración de la 3 (0010) ya está aplicada en Supabase (probadas a mano por el usuario allí); 4–6 pendientes. Los demás párrafos se conservan como plan.

## Iteración 0 — Auditoría y proyecto base
Leer docs; registrar decisiones; crear repositorio Next.js/TypeScript, convenciones, `.env.example`, configuración de lint/typecheck/tests, guía de inicio. **Entregable:** arranque local reproducible sin secretos en Git.

## Iteración 1 — Primera vertical real (máxima prioridad)
Auth mínima y 2 roles → una zona/material/contenedor de prueba → formulario registro manual → validación servidor → escritura transaccional de pesaje y lote → historial. **Pruebas:** neto correcto, pesos inválidos, acceso denegado, doble clic.

## Iteración 2 — Trazabilidad
Movimientos por lote, ubicaciones, retiros parciales, saldo no negativo, auditoría, destinos, confirmación de evidencia. **Pruebas:** retiro parcial, ajuste y concurrencia.

## Iteración 3 — Dashboard mínimo
KPI desde consultas de base de datos, filtros por zona/material/fecha, tendencias y CSV; separar periodos sin medición de cero. **Pruebas:** reconciliación contra fixtures conocidos.

## Iteración 4 — Integración IoT simulada
Modelo de dispositivo + ingesta de lecturas HTTPS idempotente + panel de último estado/estado de conexión, simulador. La telemetría jamás incrementa captura por sí sola. **Pruebas:** duplicado, token revocado, lectura fuera de rango, sin red.

## Iteración 5 — Oportunidades y usabilidad
Regla explicable, estados vacíos/errores, filtros e instrucciones de operador, prueba manual con usuarios. **Pruebas:** alerta justificable y operación sin instrucciones.

## Iteración 6 — Piloto y entrega
Migraciones y backups, roles definitivos, documentación, capacitación, calendario de pesajes, resultados reales y evidencia del cumplimiento de PME/CE.

## Definition of Done por incremento
- Feature accesible desde interfaz si aplica y persistida en DB.
- Validación servidor y autorización cubiertas.
- Migración/semillas y variables documentadas.
- Pruebas automatizadas (unitarias/integración/E2E pertinentes), comandos registrados y estado real de ejecución.
- Sin datos de demostración mezclados con resultados reales.
- README actualizado con cómo reproducir el comportamiento.

## Regla de prioridad
La API IoT y el dashboard avanzado **no bloquean** registro manual ni metodología del piloto. Hardware físico se valida en paralelo en otro chat.

> **Estado operativo (18-11-2026):** el ESP32 ejecuta un sketch de prueba por USB; HX711, celda de tres cables y Wi-Fi no tienen integración validada. La API IoT es un contrato de diseño, no un despliegue verificado. Consulta `docs/14-estado-actual-y-handoff.md`.
