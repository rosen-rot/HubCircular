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

## Implementación (2026-11-20)
Script en Node/TypeScript: `npm run iot:simulate` (`scripts/iot-simulator.ts`; escenarios puros en `scripts/iot-scenarios.ts`, con pruebas en `tests/unit/iot.test.ts` y `tests/integration/iot.test.ts`). Detalle y resultados en `docs/27`.

```bash
npm run iot:simulate -- --list
npm run iot:simulate -- --scenario=duplicado
npm run iot:simulate -- --scenario=estable_repetido --count=30 --interval=1000
npm run iot:simulate -- --scenario=todos
```
Variables (en `.env.local`, sin subirlo a Git): `IOT_DEVICE_TOKEN` (credencial de un dispositivo **DEMO** creado en `/dispositivos`), `IOT_DEVICE_ID` (por defecto `HUB-ESP32-001`), `IOT_BASE_URL` (por defecto `http://localhost:3000`).

| Escenario de la tabla | Nombre en el script | Respuesta esperada |
|---|---|---|
| Contenedor vacío | `vacio` | 202 × N (0–30 g fluctuante) |
| Depósito de material | `deposito` | 202 × 3 (0 → 1500 → 1498 g) |
| Peso estable repetido | `estable_repetido` | 202 × 30 (messageId distintos) |
| Retiro parcial | `retiro_parcial` | 202 × 2 (1500 → 500 g) |
| Duplicado HTTP | `duplicado` | 202 y luego 202 con `duplicate:true` |
| Mensaje alterado | `alterado` | 202 y luego 409 |
| Sensor inválido | `sensor_invalido` | 202 con valores nulos (`sensor_error`) |
| Sin conexión | `sin_conexion` | 202 y se detiene; el panel pasa a «dato desactualizado» tras la tolerancia |
| Dato fuera de rango | `fuera_de_rango` | 400 |
| Token revocado | `token_invalido` (token inventado → 401) y `token_revocado` (tras revocar o rotar en `/dispositivos` → 403/401) | 401 / 403 |

Garantías: todo mensaje lleva firmware `sim-…`, por lo que el servidor lo rechaza en dispositivos que no sean DEMO; el simulador solo apunta a `localhost` salvo `--allow-remote`; no imprime el token; Ctrl+C lo detiene limpiamente; termina con código 1 si alguna respuesta difiere de lo esperado. **No prueba el ESP32, el HX711 ni la celda.**
