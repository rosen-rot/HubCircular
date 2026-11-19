# 26 · Rediseño de la plataforma (imágenes del Hub, 2026-11-19)

**Estado:** implementado en local (Linux + PostgreSQL 16). No revisado todavía por el Hub ni probado en Windows nativo. Sin cambios de base de datos.

## 1. Origen y alcance
El usuario recibió 9 imágenes de diseño (3 opciones de «Inicio» y 6 vistas más, con menú lateral verde oscuro). Decisiones tomadas con él:
- Alcance: **«Diseño + vistas con datos que ya tenemos»**. Lo que las imágenes muestran y aún no existe queda **registrado como pendiente** (§4), no simulado.
- «Inicio»: **opción 2 (dashboard)**.

## 2. Qué se construyó
| Pantalla / pieza | Contenido | Datos |
|---|---|---|
| Marco (`app-shell`, `side-nav`, `search-box`) | Menú lateral con iconos y sección activa; en teléfono se pliega tras el botón «Abrir menú»; barra superior con búsqueda (Ctrl/Cmd+K → `/historial?ref=`), avatar, rol y «Salir». | Sesión y permisos existentes |
| `/inicio` (aterrizaje de todos los roles) | 4 tarjetas (reciclable captado vs. período anterior, pesajes hoy/ayer, inventario actual, contenedores activos y medición de hoy), anillo por material, tendencia diaria (Kg / N.º de pesajes), medición de hoy, últimos pesajes. Período 7/30/90 días; origen real (por defecto) o DEMO. | `kpi_summary`, `kpi_weekly`, `coverage_occurrences`, `weighings` |
| `/lotes` | Lista con filtros (referencia, material, ubicación con saldo, estado derivado, fechas, origen), tarjetas de resumen y **panel de detalle**: resumen, saldo por ubicación y trazabilidad (captación → movimientos → evidencia → verificación). | `batches`, `batch_location_balances`, `movements` |
| `/movimientos` | Lista con filtros (referencia M-/L-, tipo, estado del despacho, fechas, origen), tarjetas (movimientos, despachos, sin evidencia, por verificar) y **panel de detalle con línea de tiempo**. El formulario sigue en `/retiros` (botón «Registrar movimiento»). | `movements`, `movement_evidence`, `movement_verifications` |
| `/registro` | Encabezado nuevo + columna con «Resumen de hoy» (reales y DEMO por separado), «Mis últimos registros» y «Recordatorio». | `weighings` |
| Resto de pantallas | Encabezado con icono (`PageHeader`) en historial, contenedores, calendarios, destinos, usuarios, ayuda, tablero y retiros. Contenido interior sin cambios. | — |

Reglas que se mantuvieron: el origen real es el predeterminado y los datos DEMO nunca se mezclan en cifras ni totales; el ámbito por zona lo impone la RLS (el operador de Cowork no ve lotes del Laboratorio ni por URL); el estado del lote y del despacho se **deriva** (no se guarda); el panel solo muestra lo registrado (un despacho sin evidencia aparece como «Pendiente», no como valorizado).

## 3. Decisiones de diseño
- **Estado del lote (derivado):** «En inventario» (saldo ≥ captación), «Saldo parcial», «Sin saldo». No se usa «Cerrado» ni «Inconsistencia» (no existen como estados).
- **Referencia visual, no copia:** colores, iconos (`lucide-react`) y disposición siguen las imágenes; las ilustraciones de mascota y cifras de ejemplo no se copian.
- **Móvil:** las imágenes son de escritorio; el menú se pliega y las tablas con desplazamiento horizontal son regiones con foco por teclado (`role="region"`, `tabindex=0`, etiqueta).
- **Panel de detalle por URL** (`?lote=` / `?mov=`): se puede compartir y funciona sin JavaScript; los valores inválidos se ignoran.

## 4. Lo que las imágenes muestran y NO se construyó (con motivo)
| Elemento de las imágenes | Motivo |
|---|---|
| CO₂ evitado, agua, árboles | Requiere factores de emisión validados; hoy sería una cifra inventada |
| Valorización en CLP | Requiere precios/contrato con gestor (H-05) |
| «Tasa de valorización» | Depende de la confirmación parcial del gestor (H-05) |
| Llenado / ocupación / capacidad de contenedores | Requiere capacidad configurada y sensor (IoT, iteración 4+) |
| Mapa de ubicaciones | No hay coordenadas ni requisito aprobado |
| Alertas / campana | No hay reglas de alerta definidas |
| Flujo solicitud → traslado → recepción → destino final con transportista | Requiere decisiones H-01/H-05; hoy el despacho es un movimiento con evidencia |
| Estados de pesaje «Validado / En revisión» | El pesaje no tiene flujo de revisión |
| Lote «Cerrado / Inconsistencia», «Editar» lote | No existen; la captación no se edita (se corrige con movimientos) |
| Elegir operador o material en el registro | El operador es la sesión y el material sale del contenedor |
| Acciones masivas | Fuera de alcance |
| «Kg recuperados» | Se usa «Reciclable captado» (definición vigente del glosario) |

## 5. Verificación (resultados reales, Linux + PostgreSQL 16 local)
- `tsc`, `eslint` y `next build` sin errores.
- **Vitest 365/365** (32 archivos): incluye `inicio.test.ts` y `lotes-movimientos.test.ts` (filtros, estado derivado, referencias, valores inválidos).
- **Playwright 83/83** (con axe-core): `inicio.spec.ts` (6) y `lotes-movimientos.spec.ts` (11): datos reales vs. DEMO, filtros, paneles con línea de tiempo, evidencia que cambia el estado en la lista, ámbito del operador (lote del Laboratorio no visible por lista ni por URL), lector sin botones de registro, y **axe + ausencia de desplazamiento horizontal a 1280 y 390 px en las 13 pantallas del menú**.
- `next dev` (escritorio y 390 px) recorriendo inicio, registro, historial, lote, movimiento, retiros, tablero, calendarios, contenedores, destinos, usuarios y ayuda: **0 avisos** de consola/hidratación.
- Revisión visual de capturas (1280 y 390 px) de Inicio, Lotes, Movimientos y Registro.

## 6. Errores encontrados y corregidos durante la verificación
1. Cuadrícula de una columna sin `minmax(0,1fr)` → desborde de 59 px a 390 px en Inicio.
2. Regiones con desplazamiento sin foco por teclado (axe `scrollable-region-focusable`) en Inicio, Lotes, Movimientos, Historial, Contenedores y Tablero.
3. Un `sr-only` absoluto dentro de una tabla con desplazamiento escapaba del contenedor y ensanchaba la página (268 px en Contenedores) → los contenedores con desplazamiento son `relative`.
4. Los globos de ayuda cerrados medían como elementos de ventana fuera de pantalla → ahora están ocultos mientras están cerrados.
5. «kg kg» duplicado y porcentajes con punto en el anillo (propio; corregido tras revisar la captura).

## 7. Límites
No revisado por el Hub; no probado en Windows nativo, lector de pantalla real ni contra Supabase; la tendencia diaria en 390 px usa texto pequeño; el tablero conserva su estructura interior anterior; no hay prueba automatizada de «sin avisos en `next dev`» (se hizo con un script desechable).
