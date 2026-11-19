# 11 · Registro de supuestos y decisiones pendientes

| Asunto | Estado / resolución provisional | Quién valida |
|---|---|---|
| Zona piloto, frecuencia y material real | No confirmado; configurar dinámicamente | Hub + equipo |
| Responsables/roles y permisos reales | Administrador y operador mínimos | Hub |
| Disponibilidad de balanza de referencia y calibración | Sin confirmar | Laboratorio / equipo |
| Celda carga 50 kg (tres cables) + HX711 | **Recibidos**. La celda no tiene identificación visible; pinout/topología/capacidad real sin medir; conexión y calibración pendientes. Resistencias 1 kΩ compradas, retiro pendiente al 18-11-2026. | Equipo hardware |
| Modelo exacto de ultrasónico | Kit incluye sensor; se supone HC-SR04 hasta verificar | Equipo hardware |
| Contrato API IoT versión 1 | Propuesta en `04-contrato-api-iot.md` | Equipos de hardware/software |
| Umbrales de alerta y qué hacer cuando ocurren | Parámetros de prueba, sujetos a piloto | Hub |
| Evidencia de valorización y gestores disponibles | No confirmados | Hub |
| Proveedor hosting, dominio, cuentas y costos | Por definir | Equipo |
| Gestión de credenciales de dispositivos | Requerimiento seguro, mecanismo exacto por decidir | Software/seguridad |
| Política de datos y retención | Por definir | Contraparte |
| Tamaño del piloto y evaluación | Cuatro semanas sugeridas si calendario lo permite | Curso/Hub |

Si una decisión cambia, actualizar fecha, responsable y documento afectado. Evitar tratar la maqueta o datos ficticios como observaciones del Hub.

## Discrepancias y decisiones registradas por la auditoría de Fase 0 (2026-11-18)

Detalle completo en `docs/17-auditoria-documental.md`; decisiones de diseño en `docs/18-decisiones-de-arquitectura.md`.

| Asunto | Estado / resolución provisional | Quién valida | Iteración |
|---|---|---|---|
| "Ubicación" de inventario sin entidad propia (H-01) | Provisional: ubicación = zona (ADR-005). Análisis en `docs/21` | Hub + equipo | 2 |
| Valorización: ¿movimiento o verificación? (H-05) | Pendiente: modelar como verificación de evidencia, sin segunda salida. Análisis en `docs/21` | Equipo | 2 |
| Fecha del KPI de valorización (despacho vs. confirmación) (H-06) | Pendiente | Hub + equipo | 3 |
| Material del pesaje distinto del esperado del contenedor (RN-03, H-07) | Fase 1: **no se permite**; excepción justificada pendiente. Análisis en `docs/21` | Hub | 2 |
| Cero confirmado vs. captación (H-04) | Modelar en `measurement_occurrences`; no es pesaje | Equipo | 3 |
| Rol «gestor»: lector del Hub vs. gestor de residuos externo (H-08) | Rol técnico = `lector`; tercero = `destinations` | Hub | 1 (resuelto en código) |
| ¿El administrador puede registrar pesajes? (H-10) | Supuesto: sí | Hub | 1 |
| Tope de masa por registro (H-14) | 1.000 kg (ADR-008); ajustable por migración | Hub / laboratorio | 1 |
| Repositorio privado y versionado de PDF/ZIP internos (H-20) | `.gitignore` los excluye por defecto (ADR-009) | Profesor guía / Hub | 1 |
| Autenticación definitiva: Supabase Auth vs. local (H-21) | Local en Fase 1 (ADR-002); migración prevista | Equipo | antes del piloto |
| Hosting, dominio, cuentas Supabase, política de retención y respaldos | Sin definir; sin cambios | Equipo / contraparte | 6 |
| Política de contraseñas, alta/baja de usuarios y recuperación de acceso | Sin UI en Fase 1 (usuarios por seed) | Equipo | 2 |
| Cabeceras HTTP de seguridad (CSP, HSTS) | Se incluyen `nosniff`, `X-Frame-Options`, `Referrer-Policy`; **CSP y HSTS pendientes** (dependen del hosting) | Equipo | 6 |


## Información aportada por el equipo el 2026-11-18 (no confirmada por el Hub)
El Hub no pesa ni gestiona residuos reciclables actualmente; probablemente llegan materiales distintos a los contenedores; existen contenedores globales con residuos mezclados. Detalle y efecto sobre H-01, H-05 y H-07 en `docs/21`. Nuevo punto abierto: alcance del piloto respecto de los contenedores globales mezclados.

## Aplazado por decisión del usuario (2026-11-18): no añadir extras todavía
No se implementa nada de esto hasta que el usuario lo indique; no bloquea la Iteración 1.5 ni el estado actual.
- Material de catálogo «MIXTO / NO CLASIFICABLE» y un contenedor global que lo use (carga de datos reales, sin cambios de código).
- Alcance del piloto: ¿solo contenedores segregados o también los globales mezclados? (si se pesan, separarlos en los indicadores).
- Despachos con destino «por definir» y sin verificación de valorización (Iteración 2), mientras no exista gestor.
- Excepción justificada de material en el pesaje (H-07, alternativa 2).
Detalle y razonamiento en `docs/21`.
