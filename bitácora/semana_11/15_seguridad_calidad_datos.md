# 15. Seguridad, evidencia y calidad de datos

## Roles propuestos

| Rol | Permisos principales |
|---|---|
| Administrador | Configuración, usuarios, permisos, materiales |
| Operador | Captación y movimientos autorizados |
| Encargado de laboratorio (opcional) | Registros de su zona |
| Gestor del Hub | Indicadores, reportes y validaciones |
| Visitante | Solo información pública agregada, si se habilita |

Las reglas del servidor y de la base de datos deben aplicar autorización real; ocultar botones no basta. El QR identifica un recurso y no implica autorización.

## Prácticas esenciales

- Guardar fecha/hora, usuario y motivo de cada corrección.
- Mantener respaldos de destino protegidos.
- Validar permisos al crear y modificar registros.
- Evitar duplicaciones y movimientos concurrentes inconsistentes.
- Separar datos simulados de datos reales en toda presentación.
- Registrar material rechazado y destino desconocido sin inventar reciclaje confirmado.

---

[← Volver al índice de la semana 11](README.md)
