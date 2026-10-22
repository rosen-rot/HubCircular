# 8. Módulos y funcionalidades

## Módulo 1 — Registro de residuos (MVP)

**Usuario:** operador autorizado.  
**Flujo:** QR → contenedor preseleccionado → bruto/tara → neto calculado → observaciones → confirmación.  
**Validaciones:** números válidos, pesos no negativos, tara no superior al bruto, compatibilidad material/contenedor, permisos.

**Resultado:** medición y lote creados automáticamente, con fecha y autor identificables.

## Módulo 2 — Inventario y trazabilidad (MVP)

Consultas por lote, saldo y ubicación, registro de traslados, retiros, reutilizaciones, rechazos, comprobantes y correcciones auditadas. Impide despachar una cantidad superior al saldo.

## Módulo 3 — Administración (MVP)

Gestionar edificios (si se requieren), zonas, estaciones, contenedores, materiales, gestores y cuentas. Permite ampliar el sistema sin editar listas en código.

## Módulo 4 — Dashboard y reportes (MVP)

KPIs, evolución semanal/mensual, filtros por material/zona/fecha/destino, detalle de los datos que respaldan cada gráfico y exportación CSV.

## Módulo 5 — Oportunidades y recomendaciones (MVP sencillo)

Reglas transparentes que convierten datos en alertas con fundamento, por ejemplo acumulación prolongada, reportes reiterados de contaminación o mediciones faltantes. No requiere aprendizaje automático.

## Módulo 6 — Sensibilización (fase 2)

Portal de resultados agregados, material educativo de segregación, campañas y metas internas. No muestra información personal ni reemplaza las funciones administrativas.

---

[← Volver al índice de la solución 1](README.md)
