# 01 · Requisitos funcionales, no funcionales y aceptación

## Trazabilidad a la ficha del desafío
| ID oficial | Exigencia | Evidencia verificable del software/piloto |
|---|---|---|
| PME-01 | Prototipo de registro y seguimiento | Crear pesaje, ver lote y seguimiento, realizar retiro parcial |
| PME-02 | Metodología para flujo o espacio piloto | Protocolo aprobado, material y período definidos, datos reales medidos |
| PME-03 | Panel de indicadores | Dashboard por período, material, zona y estado |
| CE-01 | Datos periódicos y comparables | Calendario, marca de faltantes/cero, filtros, comparación con cobertura |
| CE-02 | Detección de oportunidades | Caso cuantificado y regla/interpretación explícita |
| CE-03 | Operación sencilla | Prueba de tareas de operador con medición de tiempo/errores |

## Requisitos funcionales prioritarios
| ID | Requisito | Aceptación observable |
|---|---|---|
| RF-01 | Autenticación | Usuario anónimo no accede a operaciones privadas |
| RF-02 | RBAC | Operador no puede gestionar usuarios ni modificar catálogos restringidos |
| RF-03 | Materiales y ubicaciones | Alta/edición/inactivación sin romper referencias históricas |
| RF-04 | Registro de pesaje | Calcula neto=bruto−tara, neto positivo, una transacción crea pesaje y lote |
| RF-05 | Historial y filtros | Filtra por período, material, zona, usuario y referencia |
| RF-06 | Movimientos | Exigen cantidad positiva y saldo suficiente; traslado no suma captura |
| RF-07 | Retiros y destinos | Despacho con gestor/destino y fecha; confirmación posterior respaldada |
| RF-08 | Correcciones | Sin borrado silencioso; actor, motivo, tiempo y referencia original |
| RF-09 | Dashboard | KPIs coherentes con movimientos, filtros y datos faltantes |
| RF-10 | Exportación | CSV con zona horaria/unidades explícitas y sin datos privados en vista pública |
| RF-11 | Alertas | Regla explicable detecta al menos un caso con datos pertinentes |
| RF-12 | Ingesta IoT | Autenticación por dispositivo, esquema validado, idempotencia, telemetría separada |
| RF-13 | Estado IoT | Último contacto, peso y llenado estimado; señaliza dato desactualizado |
| RF-14 | Registro manual alternativo | Funciona con IoT desconectado |
| RF-15 | Identificación QR | URL o código identifica estación/contenedor, jamás da privilegios |

## No funcionales
- Seguridad: secretos solo servidor, validación de entrada, autorización por entidad/ámbito, RLS apropiada, rate limiting al endpoint IoT, control de tamaño de evidencia.
- Integridad: transacciones para movimientos de saldo, idempotencia; no stock negativo; precisión de peso en **gramos enteros** si resolución lo permite.
- Usabilidad: móvil primero, formularios cortos, estados claros, errores recuperables, accesibilidad de teclado y contraste.
- Observabilidad: logs sin credenciales, auditoría, errores visibles a administradores.
- Resiliencia: ausencia de conexión de sensores no impide registro manual; fallos de red no duplican operaciones.
- Mantenibilidad: modularidad, migraciones versionadas, pruebas automatizadas y documentación de variables de entorno.

## Metas internas (no exigencias oficiales)
- Registrar un pesaje habitual en menos de **90 s** (a validar con usuarios).
- Completar al menos **90%** de mediciones programadas del piloto.
- Encontrar al menos una oportunidad accionable con datos reales.
- Comparar al menos dos períodos equivalentes.

## Casos de aceptación críticos
1. Bruto 4.250 g y tara 350 g → neto 3.900 g, un lote de 3.900 g.
2. Tara > bruto, peso negativo, material desactivado → error, ningún efecto persistido.
3. Lote 12.000 g, traslado 12.000 g → captado sigue 12.000 g.
4. Despacho 9.000 g → saldo 3.000 g; segundo despacho de 4.000 g rechazado.
5. Misma `idempotencyKey` de IoT reenviada → un solo registro de telemetría.
6. Dos operadores intentan despachar un mismo saldo → a lo sumo una operación incompatible se confirma.
7. Telemetría cada 10 s con peso estable → total captado **no cambia** hasta evento de negocio confirmado.
8. Despacho sin evidencia de destino → no se declara como valorización confirmada.
9. Semana sin medición ≠ semana con pesaje de cero; dashboard informa cobertura.
