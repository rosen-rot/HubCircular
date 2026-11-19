# 00 · Visión, alcance y definición del MVP

## Fuente oficial
**Desafío 04: Gestión y medición de residuos reciclables del Hub**. La ficha pide (a) prototipo de registro y seguimiento, (b) metodología de medición aplicable a un flujo o espacio piloto y (c) panel de indicadores sobre generación, recuperación y/o destino. Éxito: datos periódicos comparables, detección de oportunidades y operación sencilla. El documento oficial está en `referencias/Fichas_Desafios_Capstone_2026.pdf`. No confundir con Desafío 05, dedicado específicamente a fabricación digital.

## Problema y propuesta
Hub Providencia carece de un sistema consolidado de registro, medición y análisis de residuos reciclables. **HubCircular** reúne registros operativos, trazabilidad y dashboard para tomar decisiones y sensibilizar. Eslogan: **Medir, gestionar y transformar residuos en decisiones**.

## MVP académico obligatorio (Web)
1. Inicio de sesión de operador y administrador (roles mínimos).
2. Configurar materiales, espacios, estaciones y contenedores (puede iniciarse con datos semilla y UI de administración sencilla).
3. Pesaje **manual** con bruto, tara, neto, responsable, fecha, material, ubicación y observaciones; QR como atajo, no como autorización.
4. Crear lote a partir de cada captación válida; consultar historial y saldo.
5. Movimientos auditados: traslado, despacho/retiro, rechazo, reutilización y ajuste con motivo; destinos y evidencia opcional/solicitada según estado.
6. Dashboard: masa capturada, despachada, saldo, validación de destino, series y filtros; no duplicar masa.
7. Al menos una regla de oportunidad de mejora derivada de datos (ej. acumulación prolongada) y explicación visible.
8. Exportación CSV básica, validaciones, pruebas y protocolo de medición del piloto.

## Integración IoT paralela (objetivo técnico, no bloqueo)
- Un contenedor piloto: ESP32 + HX711 + celda de carga 50 kg + sensor ultrasónico tipo HC-SR04 si se confirma modelo.
- Ingestar **telemetría de peso y distancia** autenticada; mostrar estado actual y último contacto.
- Hasta validar montaje/calibración, usar **simulador de mensajes IoT**. Primeros ingresos se confirman manualmente para evitar doble conteo.
- Mostrar errores de sensor y lecturas atrasadas sin inventar resultados.

## Fuera del MVP
IA predictiva, reconocimiento visual, sensores múltiples/varios contenedores automatizados, app nativa, funcionamiento offline completo, puntos limpios externos, declaraciones REP, ahorro CO₂ estimado sin metodología, liquidación financiera.

## Usuarios
Operador: registra y consulta su ámbito; Administrador: configura y revisa auditoría; Gestor/lector: consulta analítica sin modificar inventario; visitante público: fase futura.

## Estado y supuestos
La tecnología propuesta es diseño, **no software implementado**. El ESP32, HX711 y una celda comercializada como 50 kg (tres cables) **ya fueron recibidos**. El firmware de prueba del ESP32 funciona por USB; sensores, calibración y comunicación IoT siguen pendientes. Resistencias de 1 kΩ compradas, pendientes de retiro al 18-11-2026. Véase `docs/14-estado-actual-y-handoff.md`. Zonas, materiales reales, destinos y acceso deben ser validados con el Hub. Ningún número de ejemplo representa resultados reales.
