# 9. Producto mínimo esperado: explicación punto por punto

## PME-01 — Prototipo de sistema de registro y seguimiento

**Idea:** una aplicación web en la que operadores registran pesajes y siguen el destino del material por lote. Los QR evitan escribir manualmente la ubicación; el servidor conserva el historial completo.

**Cómo funcionaría:** el usuario inicia sesión, identifica el contenedor, registra datos y recibe confirmación. Más tarde, un operador registra movimientos parciales y adjunta evidencias de destino.

**Cómo demostrarlo:** en una demo se crea un lote, se consulta su historial y se ejecuta un retiro parcial sin doble contabilizar el material.

**Entregables:** web desplegada, cuenta de prueba autorizada, base de datos, módulos 1–3 y demostración con datos controlados.

## PME-02 — Metodología de medición aplicable a un flujo/espacio piloto

**Idea:** un protocolo reproducible con balanza, unidades, frecuencia, responsable, ubicación y validaciones consistentes.

**Cómo funcionaría:** el operador realiza pesajes del mismo tipo de residuo bajo un procedimiento establecido; el sistema registra jornadas completadas, ceros y omisiones.

**Cómo demostrarlo:** mostrar el protocolo, contenedor identificado, registros fechados, cobertura del plan y análisis de dos o más períodos comparables.

**Entregables:** procedimiento escrito, fichas de área/material, planificación, hoja de capacitación y datos de piloto (sujetos al acceso otorgado).

## PME-03 — Panel de indicadores

**Idea:** un dashboard conectado a los datos reales del sistema, con información sobre captación, despacho, reutilización, inventario y confirmaciones, más tendencias y filtros.

**Cómo funcionaría:** los indicadores se calculan en el servidor o BD, se actualizan al registrarse movimientos y permiten inspeccionar sus registros de origen.

**Cómo demostrarlo:** agregar un pesaje y una salida y verificar cambios correctos de KPIs y gráficos; generar un reporte por período.

**Entregables:** dashboard funcional, definiciones de fórmulas y exportación.

---

[← Volver al índice de la semana 11](README.md)
