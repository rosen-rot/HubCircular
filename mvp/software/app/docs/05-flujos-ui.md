# 05 · Pantallas, flujos y UX

## Navegación propuesta
- `/login`: inicio de sesión.
- `/dashboard`: indicadores y filtros, origen de recomendaciones.
- `/registro`: nuevo pesaje, acceso también por `/registro?container=CODE` desde QR.
- `/historial`: pesajes y eventos con filtros.
- `/lotes/[id]`: trazabilidad detallada, saldo actual y movimientos.
- `/retiros`: registrar despacho, destino y evidencia.
- `/contenedores`: administración de estaciones/contenedores y QR.
- `/dispositivos`: último contacto, lectura e incidencias IoT.
- `/configuracion`: materiales, zonas y usuarios (solo admin).

## Flujo de registro manual
1. Usuario autenticado abre formulario (o QR **solo precarga contenedor**).
2. Verifica ubicación/material asociado, ingresa bruto/tara y opcional observación.
3. UI muestra neto calculado, pero servidor recalcula y valida.
4. Confirmación visible con ID de pesaje/lote; prevenir doble clic mediante clave de idempotencia.
5. Historial y dashboard muestran el evento, diferenciando telemetría de ingreso confirmado.

## Flujo de retiro
1. Seleccionar lote(s) y saldo por ubicación.
2. Indicar cantidad, destino, fecha, responsable, evidencia si existe.
3. Confirmar mediante operación transaccional; mostrar recibo y saldo restante.
4. Si falta evidencia de valorización, mostrar `pendiente de verificación`, no como material reciclado confirmado.

## Dashboard mínimo
- Tarjetas: captación neta, despachos, inventario pendiente, valorización respaldada (cuando exista).
- Gráfico de captación por semana/material y distribución por material.
- Filtros por fechas, zona y material; advertencia por períodos incompletos.
- Datos de sensores separados: peso instantáneo, llenado estimado, última actualización y estado estable/erróneo.
- Reglas de alerta con evidencia y recomendaciones cautelosas.
- CSV y enlace a registros de soporte por KPI.

## Experiencia
Diseño responsive, accesible, etiquetas explícitas, navegación teclado, colores no como único significado, tamaños de botones adecuados; segundos para operación frecuente. Evitar requerir cuenta para visitantes que solo depositan residuos.

## Diseño de referencia
`../diseno/HubCircular_Dashboard_MVP.png` es una maqueta ilustrativa. No copiar números; nunca presentar cifras ficticias como reales.
