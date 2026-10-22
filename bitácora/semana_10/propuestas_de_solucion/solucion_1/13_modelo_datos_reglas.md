# 13. Modelo de datos y reglas de negocio

## Entidades propuestas

| Tabla | Responsabilidad |
|---|---|
| `buildings` | Edificio o sede (si se requiere) |
| `zones` | Zonas, pisos y espacios configurables |
| `stations` | Estaciones de segregación |
| `containers` | Contenedores, QR, material esperado, tara |
| `materials` | Catálogo de materiales |
| `profiles`, `user_roles` | Identidad, estado, roles, alcance |
| `weighings` | Peso bruto, tara, neto, fecha y responsable |
| `batches` | Lote, material, origen y cantidad inicial |
| `movements` | Traslado, reutilización, despacho, rechazo y ajuste |
| `destinations` | Gestores y destinos |
| `evidence` | Respaldos y confirmaciones |
| `measurement_schedule` | Calendario de mediciones |
| `audit_logs` | Trazabilidad de cambios |
| `recommendations` | Oportunidades, reglas y revisión |

## Reglas de negocio obligatorias

| ID | Regla |
|---|---|
| RN-01 | Los pesos de captación deben ser positivos y válidos. Un chequeo con peso cero se registra como una inspección, no como nueva captación. |
| RN-02 | Tara ≤ peso bruto. |
| RN-03 | Material/contenedor compatibles o excepción justificada. |
| RN-04 | Saldo de lote nunca negativo. |
| RN-05 | Trasladar no aumenta captación. |
| RN-06 | La salida reduce inventario una vez. |
| RN-07 | Confirmar valorización no crea una nueva salida. |
| RN-08 | Verificación requiere respaldo y referencia al movimiento. |
| RN-09 | Correcciones documentadas y auditadas. |
| RN-10 | Una petición repetida con la misma clave de idempotencia no se duplica. |
| RN-11 | Los indicadores respetan filtros de fecha/zona/material y estado. |
| RN-12 | Los datos públicos se agregan sin exponer identidades de operadores. |
| RN-13 | Inventario y movimientos se registran transaccionalmente. |
| RN-14 | Pesajes fuera de calendario y omisiones quedan diferenciados. |

## API de referencia (si se implementan endpoints REST)

```text
GET    /me
GET    /zones
POST   /zones
GET    /stations
GET    /containers/:code
GET    /materials
POST   /weighings
GET    /weighings
GET    /weighings/:id
POST   /weighings/:id/corrections
GET    /batches/:id/history
POST   /movements
POST   /movements/:id/confirm-recovery
GET    /destinations
POST   /destinations
GET    /dashboard/summary
GET    /dashboard/by-material
GET    /dashboard/by-zone
GET    /dashboard/timeseries
GET    /dashboard/data-quality
GET    /reports/export
```

Los endpoints son **orientativos**, no contratos cerrados. El diseño definitivo dependerá de cómo se organice Next.js (Route Handlers, Server Actions o funciones de BD).

---

[← Volver al índice de la solución 1](README.md)
