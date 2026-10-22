# 7. Diseño operativo y metodología de medición

## 7.1 Áreas y materiales

La operación física debe verificarse en terreno. Como **hipótesis inicial**, se puede estudiar un punto de cowork/espacios comunes y, de ser factible, un segundo espacio con una dinámica distinta. No se deben fijar por código los nombres de pisos ni asumir que todos los materiales son reciclables por gestores locales.

Ejemplos sujetos a validación: papel y cartón; botellas PET; envases PEAD; latas de aluminio. Los residuos técnicos (PLA, MDF, acrílico, retazos) se consideran extensión **solo si existe un manejo y destino real conocido**.

Cada contenedor puede registrar:

- Código único, por ejemplo `HUB-Z01-EST01-CARTON`.
- Zona y estación.
- Material autorizado.
- QR impreso, con instrucciones de separación.
- Tara nominal y estado activo/inactivo, cuando aplique.

El QR identifica el contenedor; **no pesa residuos ni acredita su composición ni concede permisos de usuario**.

## 7.2 Unidad y cálculo

Unidad de visualización: **kilogramo neto**. Almacenamiento técnico opcional en **gramos enteros** según la resolución real de la balanza.

$$
\text{Peso neto} = \text{Peso bruto} - \text{Tara}
$$

Ejemplo: recipiente lleno 4,250 kg; recipiente vacío 0,350 kg; material neto **3,900 kg**.

## 7.3 Protocolo operativo

1. Definir punto, material, frecuencia, horario y responsable.
2. Verificar que la balanza funcione adecuadamente y que su rango/resolución sea pertinente.
3. Pesar recipiente y contenido; descontar tara.
4. Confirmar el material observado; registrar contaminación o mezcla.
5. Abrir formulario desde QR o aplicación.
6. Registrar peso, fecha, contenedor y observaciones.
7. Validar el registro y generar lote.
8. Documentar cada movimiento posterior.
9. Revisar datos faltantes, correcciones y saldos.
10. Consolidar y comparar los resultados al cierre del período.

## 7.4 Periodicidad y datos faltantes

**Propuesta piloto:** entre dos y tres mediciones por semana durante cuatro semanas operativas, ajustable según capacidad del Hub. La propuesta del compañero consideraba registro diario en espacios comunes y semanal o por proyecto en laboratorios; ambas son alternativas que se deben acordar con operadores.

Distinguir:

- **Peso positivo registrado:** hubo material capturado.
- **Peso cero confirmado:** se realizó la inspección y no hubo material a medir.
- **Medición omitida:** no existe dato; **no equivale a cero**.
- **Medición no programada:** no corresponde exigirla.

La comparabilidad exige iguales categorías, criterios de pesaje y ámbitos. Para semanas de distinta actividad, calcular opcionalmente kg/jornada medida. No se debe interpretar cualquier descenso de kg capturados como menor generación: puede haber menos afluencia o peores registros.

## 7.5 Trazabilidad y calidad

La primera medición debe hacerse **antes de mezclar material de zonas distintas**, si se desea conservar su origen. Si el material está contaminado o su destino es incierto, se registra esa condición y no se declara como reciclaje confirmado.

---

[← Volver al índice de la solución 1](README.md)
