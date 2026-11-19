# 09 · Simulador IoT y escenarios de prueba

El simulador sirve para probar la ingesta **antes** de validar y calibrar el HX711 y la celda recibidos. Debe enviar mensajes contra un entorno **de pruebas**, sin credenciales reales ni usar datos ficticios en indicadores del piloto.

## Casos simulados
| Escenario | Lecturas | Resultado esperado |
|---|---|---|
| Contenedor vacío | peso 0–30 g fluctuante, distancia alta | Lectura visible, ninguna captación creada |
| Depósito de material | 0 → 1500 g → 1498 g estable | Sugerir nuevo ingreso, pendiente de confirmación |
| Peso estable repetido | 1500 g cada 10 s, 30 mensajes | No sumar 45 kg de captura |
| Retiro parcial | 1500 → 500 g | Dato/alerta de cambio, retiro requiere confirmación de operador |
| Duplicado HTTP | mismo deviceId+messageId | Una sola lectura persistida |
| Mensaje alterado | mismo messageId, payload distinto | Conflicto explícito |
| Sensor inválido | peso nulo, quality sensor_error | Registrar estado sin inventar cero |
| Sin conexión | ausencia de lecturas durante umbral | Dashboard muestra dato antiguo/offline estimado |
| Dato fuera de rango | fillPercent 130 | Rechazo 400 |
| Token revocado | bearer inválido | Rechazo 401/403 |

## Fixtures base
- `deviceId = HUB-ESP32-001` solo en **ambiente de prueba**.
- Valores ficticios de ejemplo `weightGrams=4250`, `distanceMm=180`, `fillPercent=65`.
- Nunca introducir datos de demostración en reportes ambientales reales.

## Implementación futura
Script ejecutable en Node/TypeScript con `fetch`, credencial local en `.env`, frecuencia parametrizable, interrupción limpia y reporte de respuestas. No implementarlo hasta definir el endpoint y la autenticación.
