# 08 · Matriz QA y seguridad

## Tests unitarios
- Peso neto calculado en gramos: `4250 - 350 = 3900`; tara>bruto rechazada.
- `quantity_g` positivo, materiales y contenedores válidos.
- Cálculos KPI filtran tiempo y no incluyen telemetría como captación.
- Idempotencia con mismo mensaje + payload; conflicto con mismo ID + payload distinto.

## Tests integración / SQL
- Pesaje y creación de lote en una transacción; fallo deja 0 o ambos, nunca solo uno.
- Dos retiros simultáneos de un mismo saldo no pueden crear inventario negativo.
- Traslado entre ubicaciones conserva masa total; despacho disminuye saldo.
- Confirmación de evidencia no genera nueva salida de inventario.
- Corrección guarda actor, motivo y referencia; no elimina rastro.
- Políticas de acceso: operador no lee ni modifica zonas ajenas ni tablas sensibles.

## Tests E2E
- Login → escanear/abrir código de contenedor → registrar pesaje → ver historial.
- Retiro parcial y consulta del saldo.
- Dashboard con datos reproducibles y filtros.
- Acceso anónimo no visualiza datos privados.
- Simulador IoT → última lectura y alerta de dato antiguo.

## Checklist de seguridad
- No subir secretos, tokens de prueba ni datos personales a repo. `.env.example` con placeholders.
- Separar clave servidor Supabase de claves públicas y de credenciales de dispositivo.
- En UI no confundir QR con autorización.
- Rate limit y tamaño máximo en endpoints de ingesta.
- TLS y autenticación por dispositivo; rotación y revocación de credenciales.
- Sanitizar/validar inputs y metadatos de archivos, límites de tamaño; proteger evidencias en Storage.
- RLS por rol/ámbito, también comprobar en servidor.
- Logs con IDs y estados, no contraseñas/tokens.
- Resguardo de datos y copias de seguridad según política acordada con Hub.

## Evidencias del MVP
Capturas con datos ficticios etiquetados y prueba de usuario; resultados reales solo tras medición auténtica. Guardar un registro de defectos y correcciones, más pruebas de usabilidad y cobertura de medición.
