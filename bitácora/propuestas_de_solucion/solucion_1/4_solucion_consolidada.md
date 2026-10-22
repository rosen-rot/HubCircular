# 4. Solución consolidada: HubCircular

El sistema se organiza en cuatro pilares:

| Pilar | Objetivo | Ejemplo |
|---|---|---|
| **Registro** | Capturar peso, material, ubicación y responsable | Registrar 5,2 kg de cartón |
| **Trazabilidad** | Seguir lotes, almacenamientos y destinos | Despachar 3 kg y conservar 2,2 kg |
| **Análisis** | Convertir registros en KPIs y tendencias | Comparar dos semanas |
| **Mejora** | Detectar acciones ambientales concretas | Sugerir cambio de frecuencia de retiro |

## Flujo lógico

```mermaid
flowchart TD
  A[Separación en contenedor] --> B[Pesaje y lectura de QR]
  B --> C[Registro y creación de lote]
  C --> D[Almacenamiento / traslado]
  D --> E{Destino del material}
  E --> F[Reutilización]
  E --> G[Despacho a gestor]
  E --> H[Rechazo]
  G --> I[Confirmación y evidencia, si existe]
  F --> J[Dashboard e indicadores]
  H --> J
  I --> J
  C --> J
  J --> K[Oportunidades de mejora]
```

La **confirmación de destino** es distinta del despacho. Que un tercero retire un material no demuestra automáticamente que fue reciclado.

---

[← Volver al índice de la semana 11](README.md)
