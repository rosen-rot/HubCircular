# 13 · Historias de usuario y backlog inicial

| ID | Prioridad | Historia | Criterio clave |
|---|---|---|---|
| HU-01 | P0 | Como operador quiero iniciar sesión para registrar mediciones | Acceso autorizado, error claro |
| HU-02 | P0 | Como admin quiero configurar estaciones y materiales | Activo/inactivo y referencias estables |
| HU-03 | P0 | Como operador quiero registrar peso bruto y tara | Neto calculado servidor, lote creado |
| HU-04 | P0 | Como operador quiero consultar historial por zona/material | Filtros y trazabilidad del registro |
| HU-05 | P0 | Como operador quiero registrar un retiro parcial | Saldo no negativo, destino asociado |
| HU-06 | P0 | Como gestor quiero visualizar captación, despachos y existencias | KPIs reconciliables con DB |
| HU-07 | P0 | Como encargado quiero seguir un protocolo periódico | Cero, omisión y realizado diferenciados |
| HU-08 | P1 | Como gestor quiero identificar oportunidades de mejora | Recomendación con evidencia visible |
| HU-09 | P1 | Como admin quiero exportar CSV por período | Filtros y unidades claras |
| HU-10 | P1 | Como operador quiero entrar por QR al contenedor | Código precarga, no autoriza |
| HU-11 | P1 | Como técnico quiero recibir lecturas de simulador/ESP32 | Endpoint seguro e idempotente |
| HU-12 | P1 | Como gestor quiero ver el peso actual y último contacto IoT | Telemetría separada de captación |
| HU-13 | P1 | Como admin quiero auditar cambios/ajustes | Actor, motivo, timestamp |
| HU-14 | P2 | Como visitante quiero consultar resultados agregados | Solo datos públicos; fase futura |

P0 = obligatorio antes de piloto; P1 = recomendable/IoT en paralelo; P2 = expansión. Descomponer cada HU en tareas UI, DB, API, permisos y tests al implementarla.
