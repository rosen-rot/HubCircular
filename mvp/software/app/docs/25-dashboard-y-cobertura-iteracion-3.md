# 25 · Iteración 3 — Tablero de indicadores, cobertura de medición y «cero confirmado»

**Corte:** 19 de noviembre de 2026, Chile. Todo lo de este documento se implementó y probó **en el entorno Linux de la sesión con PostgreSQL 16 local**; la aplicación de 0010 en Supabase la hizo el usuario. La migración **0010 fue aplicada en Supabase por el usuario el 2026-11-19** (sección 6); el tablero y los calendarios **no se han probado a mano contra Supabase**. Lo verificado y lo no verificado está en las secciones 5 y 7.

## 1. Qué se entregó

- **Migración 0010** (`db/migrations/0010_dashboard_coverage.sql`): tablas `hc.measurement_schedules` (calendarios) y `hc.measurement_zero_confirmations` («cero confirmado»), tres funciones de escritura `SECURITY DEFINER` (`create_measurement_schedule`, `end_measurement_schedule`, `confirm_zero_measurement`) y funciones de lectura **`SECURITY INVOKER`** (`effective_movements`, `inventory_at`, `kpi_summary`, `kpi_weekly`, `coverage_occurrences`, `unplanned_weighings`). RLS activo en las dos tablas; `EXECUTE` revocado a `PUBLIC`, `anon` y `authenticated` y concedido solo a `hc_app`.
- **`/dashboard`**: tarjetas, cierre contable, gráfico semanal por material (SVG propio con leyenda, `<title>` por segmento y tabla de datos), cobertura por contenedor, movimientos de soporte, filtros (fechas, zona, material, origen real/DEMO), avisos de período incompleto y de datos DEMO, y definiciones visibles.
- **`/dashboard/export?kind=kpis|pesajes|movimientos|cobertura`**: CSV con sesión, permiso y ámbito aplicados en el servidor; `kind=todo` devuelve un Excel con las 4 hojas (§9).
- **`/calendarios`**: el administrador programa y termina calendarios por contenedor; administrador y operador (dentro de su zona) confirman «cero» de hoy.
- Permisos nuevos: `indicators:read` (administrador, operador, lector), `schedule:manage` (administrador), `measurement:zero` (administrador, operador).

## 2. Definiciones de los indicadores (ADR-025)

Todas las cifras son «lo conocido hoy»: un movimiento corregido y su corrección se anulan, de modo que una corrección posterior puede cambiar períodos ya consultados.

| Indicador | Definición |
|---|---|
| Captado | Suma de `net_g` de pesajes con `occurred_at` en el período (días de Chile). Traslados y ajustes no son captación. |
| Despachado | Despachos efectivos por fecha del propio despacho; se desglosa en **valorización confirmada**, **verificación rechazada** y **sin decisión** (de ellos, sin evidencia). La valorización confirmada se cuenta por la **fecha del despacho**, no por la de la confirmación (cierra H-06, decisión del usuario). |
| Reutilizado | Reutilizaciones efectivas; «respaldado» = con al menos una evidencia. |
| Rechazado, ajustes, traslados | Por fecha del movimiento. Los traslados se muestran como «entran/salen de su ámbito» (un traslado interno de una zona a otra de la misma vista no cambia el total). |
| Inventario | Reconstruido desde lotes + movimientos efectivos con `occurred_at` anterior al corte. «Actual» (corte infinito) coincide con `batch_location_balances` (probado). |
| Cierre contable | `cierre = apertura + captación + ajustes(+) − ajustes(−) − despachos − reutilización − rechazo + traslados entrantes − salientes`. La pantalla lo muestra y avisa si la suma no coincide con el inventario reconstruido. |
| Captación semanal | Semanas ISO en hora de Chile (inicia lunes); las de los extremos pueden ser parciales y se rotulan con `*`. |
| Cobertura | `(realizado + cero confirmado) ÷ (realizado + cero confirmado + omitido)`. Las mediciones de **hoy** están «pendientes» y no entran en el denominador. Sin mediciones evaluadas no se muestra porcentaje («Sin datos»). |

**Estado de una medición esperada** (día calendario de Chile): `realizado` (hay ≥ 1 pesaje del contenedor ese día; prevalece) > `cero_confirmado` > `omitido` (el día ya pasó) | `pendiente` (hoy). **Ausente ≠ cero** (caso de aceptación 9). Los pesajes en días sin medición esperada, de contenedores con calendario, se informan aparte como «no previstos».

**Ámbito y origen.** Cada línea se filtra explícitamente con `hc.actor_in_scope(zona)` además de la RLS, porque pesajes y lotes son visibles por políticas adicionales (por ejemplo un lote que se movió a otra zona). Los datos **real** y **DEMO** nunca se suman: el origen por defecto es «real» y el tablero explica cuando aún no hay datos reales. El material mixto no se mezcla con el segregado: se filtra por material.

**Decisiones abiertas que podrían cambiar estas definiciones:** H-01 (ubicación = zona; afecta inventario por ubicación y traslados), H-05 (valorización = verificación sin segunda salida; afecta «confirmada/sin decisión») y H-07 (material único por contenedor, sin excepciones; afecta la captación por material). Se informan en el propio tablero.

## 3. Calendarios y «cero confirmado» (ADR-026)

- Días fijos de la semana por contenedor (ISO 1–7), versionados: un calendario **se crea desde hoy o después** (hasta 366 días) y **se termina como máximo ayer**; no se edita ni se borra. Así lo esperado en días pasados nunca cambia. Para cambiar los días: terminar el vigente y crear otro (sin solapes, validado con el contenedor bloqueado).
- Las mediciones esperadas **se derivan** de los calendarios (sin filas por día ni tareas programadas).
- **«Cero confirmado»** solo de **hoy**, solo si hoy hay medición esperada, solo si todavía no hay pesaje del contenedor hoy y solo con ámbito en la zona. No es un pesaje: no crea lote ni suma masa. Es idempotente por contenedor y día, inmutable y auditado. Resuelve H-04 como lo previó la auditoría (`docs/17`): el cero no es captación.
- No hay calendarios de ejemplo en la semilla: se crean desde la pantalla.

## 4. Seguridad

- Funciones de lectura *invoker*: la RLS de `hc_app` sigue siendo la barrera; sin actor no se ve nada (probado).
- Escritura solo vía funciones `SECURITY DEFINER` con `search_path = hc, pg_temp`; sin escritura directa para `hc_app` (probado: `42501`).
- Exportación CSV: GET con sesión, permiso `indicators:read`, `Cache-Control: no-store`; separador `;`, BOM UTF-8, masas **siempre en gramos enteros**, hora local con zona horaria explícita, y neutralización de fórmulas (`=`, `+`, `-`, `@`) en textos. Tope de 20.000 filas con aviso en el archivo.
- Parámetros de URL validados (fechas reales, UUID, origen); un valor inválido vuelve al valor por defecto y se avisa.

## 5. Evidencia de verificación (Linux + PostgreSQL 16 local)

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit`, `eslint .`, `next build` | sin errores |
| Vitest | ver registro en `docs/15` (cifras exactas de la corrida final) |
| Playwright | ver registro en `docs/15` (incluye `dashboard.spec.ts` con axe-core) |
| Conciliación SQL con libro conocido (`tests/integration/indicators.test.ts`, 14) | captado, despachado (confirmado/rechazado/pendiente/sin evidencia), reutilizado, rechazo, ajustes, traslados, apertura/cierre; despacho corregido excluido; identidad del cierre; `inventory_at(∞)` = saldos; partición de períodos sin pérdidas; filtros por zona/material; ámbito de operador/lector; separación real/DEMO; semanas ISO; frontera de día y cambio de hora (día de 25 h); privilegios de funciones |
| Calendarios, cobertura y cero (`tests/integration/coverage.test.ts`, 11) | precedencia realizado > cero > omitido; pesaje 23:30 local cuenta para su día; «no previsto»; validaciones; solape; inmutabilidad; cero idempotente, sin masa, auditado; ámbito |
| Capa de aplicación (`tests/integration/indicators-app.test.ts`, 8) | permisos, traducción de errores, ámbito, exportaciones |
| Unitarias (`tests/unit/indicators.test.ts`, 16) | filtros, cobertura, CSV, semanas y ejes |
| E2E (`tests/e2e/dashboard.spec.ts`, 9) | cifras en pantalla, cierre, gráfico y tabla, origen real por defecto, ámbito del operador, lector sin calendarios, CSV (401/307, 422, contenido, ámbito), flujo programar → cero → cobertura → terminar, axe-core |
| **Pruebas de mutación** (todas restauradas) | sin excluir corregidos: fallan 5 pruebas; sin ámbito en captación: 2; sin filtro de origen en inventario: 1; borde de día en UTC: 1; cero sobre pesaje: 1; sin guarda de pesaje del día: 1; día local en UTC (cobertura): 2 |
| Camino de actualización | 0009→0010 aplicado sobre una base local con datos; `db:check` y `db:check:app` sin errores |
| Revisión visual | capturas reales de `/dashboard` y `/calendarios` revisadas; corregidos el menú, filtros truncados y ancho de fecha |

## 6. Aplicación de 0010 en Supabase (ejecutada por el usuario, 2026-11-19)

Resultado informado con salida real: respaldo previo OK (18 tablas, 90 filas, 9 migraciones); `--dry-run` mostró solo 0010 pendiente; `db:migrate` con `CONFIRM_REMOTE_MIGRATION` ⇒ «Migraciones aplicadas: 0010»; `db:check` sin errores (10 migraciones, 0 pendientes, RLS en las 20 tablas de `hc`, `anon`/`authenticated` sin privilegios, 6 pesajes DEMO, 1 movimiento DEMO, ningún saldo negativo); `db:check:app` con `hc_login` sin errores ni avisos. Secuencia seguida (se conserva como procedimiento):

1. **Respaldo previo** (el plan gratuito no tiene copias): `npm run db:backup` (`docs/24`).
2. `npm run db:migrate -- --dry-run` debe mostrar **solo 0010** pendiente.
3. Con aprobación explícita: `db:migrate` con `CONFIRM_REMOTE_MIGRATION=<host>` (como en las migraciones anteriores).
4. `npm run db:check` y `npm run db:check:app`: 10 migraciones, 0 pendientes, RLS en las 20 tablas.
5. Probar a mano `/dashboard` (origen DEMO) y `/calendarios`; crear un calendario DEMO y confirmar «cero».

**Prueba manual (informada por el usuario, 2026-11-19, sin capturas):** con origen real el tablero dice «aún no hay pesajes reales»; creó un calendario y confirmó «cero» hoy; en origen DEMO el tablero muestra 100 % de cobertura; los CSV «están bien todos». No informó el detalle por archivo.

La migración solo agrega objetos y no modifica datos existentes. Si algo falla, restaurar con la prueba de `docs/24` y no borrar registros para «arreglar» migraciones.

## 7. Límites y no verificado

- El tablero, los calendarios y el CSV fueron **probados a mano por el usuario contra Supabase** (§6, sin detalle por paso); **no** en Windows nativo, y sin despliegue ni HTTPS reales. En Supabase el calendario y el «cero» creados en esa prueba quedan como datos de prueba.
- Las cifras con **datos reales** no existen todavía: el piloto no tiene pesajes reales; los valores probados son de fixtures y DEMO.
- Dependencia de decisiones abiertas con el Hub (H-01, H-05, H-07) y de la definición de «jornada»: la cobertura usa días fijos de la semana y el día calendario de Chile; un contenedor medido fuera de calendario no cuenta como medición esperada.
- Una corrección se fecha al momento de corregir (hoy), pero anula al original en **su** período: el detalle exportado muestra ambos con `efectivo = no`.
- No hay alertas ni reglas de oportunidad (Iteración 5) ni telemetría (Iteración 4). El gráfico no tiene tooltip interactivo propio (se usa el `<title>` nativo del navegador) ni modo oscuro (la aplicación no lo tiene).
- Reutilización y rechazo no tienen verificación propia; «respaldado» significa solo que existe una evidencia de texto.

## 8. Mejora posterior: ayuda y glosario (2026-11-19)

Pedido del usuario tras probar a mano: había palabras que no entendía («cero», «tara», entre otras). Se resolvió con tres cosas, sin cambiar reglas de negocio ni base de datos:

- **Nombres más claros** (con el término oficial entre paréntesis cuando hace falta): «Peso bruto: recipiente + material», «Tara: recipiente vacío», «Peso neto: solo el material», «Tara de referencia» (antes «Tara nominal»), «Cero confirmado (revisado, sin residuos)», «Omitido (sin revisar)», botón «Confirmar cero: hoy revisé y está vacío».
- **Icono (i) accesible** junto a cada término de registro, historial, detalle de pesaje y lote, movimientos, contenedores, destinos, usuarios, tablero y calendarios. Es un `<details>/<summary>` nativo con `aria-label` «Qué significa: …», se abre con teclado, se cierra con Escape o al pulsar fuera, y el globo se posiciona siempre dentro de la ventana (también dentro de tablas con desplazamiento). Componentes: `src/components/help/info-tip.tsx` (`InfoTip`, `Term`) y la propiedad opcional `help` de `Field`.
- **Página `/ayuda`** («Ayuda y glosario», en el menú, para todo usuario con sesión) con cada término, su explicación corta, el detalle con ejemplos y un ancla `#clave`. Todo el texto sale de **un solo módulo**, `src/lib/glossary.ts` (≈45 términos en 6 grupos), de modo que icono y página no se contradicen.

Los textos del glosario son una redacción nueva, en lenguaje simple; los términos que dependen de decisiones abiertas con el Hub (p. ej. «zona = ubicación», H-01) lo dicen.

Pruebas (Linux + PostgreSQL 16 local): `tsc`, `eslint` y `next build` sin errores; **Vitest 343/343** (29 archivos; +5 de `tests/unit/glossary.test.ts`: estructura de cada entrada, claves seguras como ancla, todo `k=`/`help=` usado en `src/` existe en el glosario); **Playwright 61/61** (+8 de `tests/e2e/ayuda.spec.ts`: acceso sin sesión, lector ve /ayuda, uso solo con teclado, la casilla de contaminación no se marca al pulsar el icono, el enlace «Más detalle» abre el término correcto, Escape y clic fuera, globo dentro de la ventana y sin recorte en tablas, y axe-core sin violaciones en /ayuda y en registro, tablero, calendarios y contenedores). Se actualizaron las pruebas E2E que dependían de textos renombrados (etiquetas de tara/bruto, botón de cero, «1 revisado sin residuos (cero)»). Revisión visual con capturas de registro, tablero, contenedores y móvil (390 px).

Límite: el globo requiere JavaScript para posicionarse y cerrarse con Escape/clic fuera; sin JavaScript sigue abriéndose y cerrándose con `<details>`. No se probó con un lector de pantalla real, solo con axe-core y navegación por teclado.

## 9. Descarga unificada: «Descargar datos» (2026-11-19; reemplaza la mejora «unir los CSV» pedida por el usuario)

Elegido por el usuario: **Excel con una hoja por tabla**, y un botón que **pregunta qué descargar** (todo o algo enfocado).

- **Pantalla.** El tablero tiene un único botón «Descargar datos» que abre «¿Qué quieres descargar?»: **Todo junto** (un `.xlsx` con las hojas Indicadores, Pesajes, Movimientos y Cobertura; es la opción marcada por defecto) o **solo una tabla** en CSV. Es un formulario GET normal (sin JavaScript propio) que lleva como campos ocultos los filtros activos: se descarga exactamente lo que se ve (período, zona, material, origen real/DEMO). Reemplaza a los 4 botones sueltos «CSV …»; los **CSV siguen existiendo** con las mismas URL (`/dashboard/export?kind=kpis|pesajes|movimientos|cobertura`) y el mismo contenido.
- **Ruta.** `/dashboard/export?kind=todo&…` devuelve el libro (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, nombre `hubcircular-todo-<origen>-<desde>_<hasta>.xlsx`, `no-store`). Mismas defensas que el CSV: sesión (401/redirección a /login), permiso `indicators:read`, ámbito y origen aplicados en el servidor, `kind` desconocido ⇒ 422.
- **Una sola definición.** Las hojas salen de las **mismas tablas** que los CSV (`src/modules/indicators/exports.ts`: `kpiTable`, `detailTable`, `coverageTable`; los CSV son `toCsv` de esas tablas) y se escriben con `src/modules/indicators/workbook.ts`. Mismas columnas y valores: masas en gramos enteros **como números**, fechas/horas como texto en hora de Chile, tope de 20.000 filas con la nota de truncado, booleanos como «sí»/«no».
- **Fórmulas.** Todo texto se escribe como celda de texto, nunca como fórmula: lo que empieza con `=`, `+`, `-` o `@` se ve tal cual y no se evalúa (en el CSV se antepone `'`; en el libro no hace falta ni se altera el dato). Comprobado leyendo el XML (sin `<f>`) y abriendo el archivo en LibreOffice.
- **Dependencia nueva (ADR-028).** `write-excel-file` 4.1.1 (única dependencia propia: `fflate`); `npm audit`: 0 vulnerabilidades. Se descartó SheetJS (`xlsx` en npm, sin mantenimiento y con avisos) y `exceljs` (mucho más pesada). `fflate` también se declara como devDependency para leer el libro en las pruebas (`tests/helpers/xlsx.ts`).
- **Pruebas (Linux + PostgreSQL 16 local):** `tsc`, `eslint` y `next build` sin errores; **Vitest 349/349** (30 archivos; +5 de `tests/unit/workbook.test.ts`: 4 hojas en orden con los mismos encabezados que los CSV, masas numéricas, ninguna fórmula, nota de truncado, archivo vacío válido); **Playwright 66/66** (+5 en `dashboard.spec.ts`: libro con las mismas cifras y filas que los CSV, sesión/permisos, origen real sin mezclar DEMO, operador solo con su zona, selector con descarga `.xlsx` por defecto y `.csv` al elegir una tabla, panel dentro de la ventana en escritorio y en 390 px, axe-core sin violaciones). `next dev`: 0 avisos de hidratación en `/dashboard`. Revisión visual con captura del selector.
- **Incidencia durante el desarrollo:** la primera versión posicionaba el panel «hacia la izquierda» y, al saltar de línea el botón, quedaba **fuera de la pantalla** (la prueba E2E de descarga lo detectó); se rehízo con el botón en su propia línea y el panel abierto hacia la derecha, y se agregaron pruebas de posición. Después el botón «Descargar» quedaba bajo el pliegue; se compactó el panel.
- **Límites:** no se probó abriendo el `.xlsx` en Microsoft Excel real (sí en LibreOffice y leyendo el XML); no se probó en Windows nativo ni contra Supabase; un libro con 20.000 filas por hoja no se midió en tiempo ni memoria; no se incluye una hoja de «Léeme» (el período, el origen y la zona horaria están en las columnas de la hoja Indicadores).
