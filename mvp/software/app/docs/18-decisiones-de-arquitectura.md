# 18 · Registro de decisiones de arquitectura (ADR)

Formato: contexto → decisión → consecuencias / cómo revertir. Las decisiones **provisionales** que requieren validación humana también figuran en `docs/11-decisiones-pendientes.md`. Fecha de todas: 2026-11-18, salvo indicación.

## ADR-001 · Stack de Fase 1 y acceso a datos
- **Contexto.** `docs/02` propone Next.js + TypeScript + Tailwind + shadcn/ui + Supabase + Recharts, "por verificar". No hay proyecto Supabase, credenciales ni hosting (`docs/14`).
- **Decisión.** Next.js 16 (App Router, React 19) + TypeScript estricto + Tailwind CSS 4 + componentes al estilo shadcn/ui escritos a mano (la CLI de shadcn necesita su registro en línea) + **PostgreSQL estándar** accedido con `pg` desde el servidor. Migraciones SQL versionadas (`db/migrations`, runner propio con checksum y *advisory lock*). Sin Supabase SDK en Fase 1. Recharts se incorpora en la iteración 3 (no hay gráficos todavía).
- **Verificado en esta sesión:** Node 22, PostgreSQL 16.15 real, Next 16.4.6, Vitest 5, Playwright 1.63.
- **Consecuencias.** El mismo SQL corre en cualquier PostgreSQL ≥ 14 (docker-compose, instalación local o la BD de un proyecto Supabase: basta `DATABASE_URL`). **No se verificó contra Supabase** (sin acceso). **Revertir/avanzar:** conectar Supabase = cambiar `DATABASE_URL` + aplicar migraciones + ADR-002.

## ADR-002 · Autenticación local detrás de una interfaz sustituible
- **Contexto.** `docs/03` supone `profiles.id = auth.users.id` (Supabase Auth), pero no hay Supabase y la vertical exige login real.
- **Decisión.** Proveedor local: contraseñas con **scrypt** (N=2¹⁵, r=8, p=3, parámetros codificados en el hash), sesión opaca de 32 bytes en cookie `hc_session` (`HttpOnly`, `SameSite=Lax`, `Secure` configurable), **solo el hash SHA-256** del token en BD, vigencia absoluta de 12 h, bloqueo de cuenta 15 min tras 5 fallos, respuesta uniforme ante correo inexistente/clave errónea/cuenta inactiva (con hash ficticio para igualar tiempos). Credenciales y sesiones viven en `hc.local_*`, accesibles **solo vía funciones `SECURITY DEFINER`** (`hc.auth_*`); el rol de aplicación no puede leerlas.
- **Consecuencias.** `profiles` no almacena credenciales (se respeta `docs/03`). Para migrar a Supabase Auth: añadir FK `profiles.id → auth.users`, reemplazar `identity/service.ts`, y retirar `hc.local_*` y `hc.auth_*`. El bloqueo por cuenta permite que un atacante bloquee temporalmente a un usuario conocido (riesgo aceptado; mitigable con límite por IP en el borde).
- **Pendiente:** gestión de usuarios por UI, cambio/restablecimiento de contraseña, política de contraseñas (hoy los usuarios nacen por seed).

## ADR-003 · Ámbito de roles por zona (RBAC)
- **Contexto.** `docs/00` "operador consulta su ámbito"; `docs/08` "operador no lee zonas ajenas"; `docs/03` ofrece `user_roles.zone_id`.
- **Decisión.** Tres roles (`administrador`, `operador`, `lector`). `user_roles.zone_id` NULL = todas las zonas; si no, **la zona y sus descendientes** (`hc.zone_within`). Se aplica en tres capas: matriz de permisos en la aplicación, validación dentro de `hc.register_weighing` y **RLS** sobre lectura.
- **Supuesto (H-10):** el administrador también puede registrar pesajes (equipo pequeño).
- **Consecuencias.** Un usuario puede tener varios roles/ámbitos. Ocultar enlaces no es seguridad: los endpoints y la BD vuelven a verificar.

## ADR-004 · Modelo de saldo: tabla de saldos por lote y ubicación
- **Contexto.** `docs/03` exige elegir entre libro mayor append-only o tabla materializada, y documentar la prueba de concurrencia.
- **Decisión.** `hc.batch_location_balances (batch_id, zone_id, balance_g CHECK ≥ 0)`, **modificada solo por funciones transaccionales** (con `SELECT … FOR UPDATE`) a partir de la iteración 2; el lote nace con una fila igual al neto. Los retiros parciales indican cuánto queda y dónde, no un `status` global. La captación inicial se deriva de `weighings.net_g` (sin duplicar masa).
- **Consecuencias.** La restricción `CHECK` impide saldo negativo incluso ante errores de código. Falta (iteración 2) la tabla `movements` y la **prueba de concurrencia de dos retiros simultáneos**; el patrón de prueba ya existe (10 registros simultáneos con la misma clave en Fase 1).

## ADR-005 · "Ubicación" de inventario = zona (provisional, H-01)
- **Decisión.** `from/to_location_id` apuntarán a `hc.zones`; los espacios de acopio se modelan como zonas. Si el Hub necesita ubicaciones distintas (bodegas, estanterías), se introducirá `storage_locations` con una migración y backfill.

## ADR-006 · Idempotencia de pesajes manuales
- **Decisión.** El formulario recibe una **clave UUID nueva por cada carga**; única por `(created_by, idempotency_key)`. Misma clave + mismos datos ⇒ se devuelve el resultado original (`duplicate: true`, HTTP 200) incluso si el contenedor se desactivó después; misma clave + datos distintos ⇒ `HC409`. `INSERT … ON CONFLICT DO NOTHING` resuelve la carrera entre envíos simultáneos. API: `Idempotency-Key` obligatoria.
- **Verificado:** 10 envíos simultáneos ⇒ 1 pesaje y 1 lote (y la prueba falla si se quita la restricción única: prueba de mutación).

## ADR-007 · Separación de datos demo y reales
- **Decisión.** `data_origin ('real'|'demo')` en el catálogo; el pesaje y el lote **heredan el origen del contenedor en la función de BD** (el cliente no puede elegirlo; un trigger exige que el lote coincida con su pesaje). La interfaz marca cada registro demo con una insignia **DEMO**. El seed solo crea datos `demo` (con nombres evidentemente ficticios, correos `*.test`) y se niega a correr con `NODE_ENV=production` salvo `ALLOW_DEMO_SEED=true`. Los KPIs futuros **deben filtrar por origen**.

## ADR-008 · Masas y validaciones (H-14)
- **Decisión.** Gramos enteros (`bigint`); `net_g` es **columna generada** `gross_g − tare_g` (la BD lo calcula, nunca se acepta del cliente); `CHECK (gross_g > 0 AND tare_g ≥ 0 AND tare_g < gross_g AND gross_g ≤ 1.000.000)`. El tope de 1.000 kg es de cordura (detecta errores de unidad), no un límite físico del hardware; se ajusta con una migración. La interfaz recibe kilogramos con coma o punto (máx. 3 decimales, sin redondeo silencioso) y los convierte **sin coma flotante**.

## ADR-009 · Material interno fuera de Git por defecto
- **Contexto.** `README` y `docs/16`: la ficha oficial (PDF) es de uso interno y el repositorio debería ser privado.
- **Decisión.** `.gitignore` excluye `*.zip` y `referencias/*.pdf`, además de `.env*`. Si el equipo confirma que el repositorio es **privado** y autoriza versionarlos, basta quitar esas dos líneas. Los documentos `.md` de `referencias/` sí se versionan.

## ADR-010 · Modelo de acceso a la BD: RLS deny-by-default + rol mínimo
- **Decisión.** Todo en el esquema privado `hc` (no expuesto por la API de datos de Supabase). RLS habilitada en todas las tablas. El navegador **nunca** consulta la BD; la aplicación usa el rol `hc_app` (`-c role=hc_app` al conectar), que solo puede **leer** tablas de negocio filtradas por RLS según el actor de la transacción (`set_config('hc.actor_id', …, true)`) y **escribir únicamente mediante funciones `SECURITY DEFINER`** con `search_path` fijo. `anon`/`authenticated` no tienen `USAGE` en el esquema. El correo de `profiles` no es legible por `hc_app` (privilegios por columna). `audit_logs`, `weighings` y `batches` son inmutables (trigger `HC423`, incluso para el dueño).
- **Códigos de error de negocio** (SQLSTATE personalizados): `HC401` no autenticado, `HC403` sin permiso, `HC404` no encontrado, `HC409` conflicto de idempotencia, `HC422` validación, `HC423` registro inmutable. La aplicación solo muestra mensajes conocidos; los demás errores se registran sin detalle y se muestran como "inesperado".
- **Consecuencias.** Convención para migraciones futuras: toda función nueva revoca `EXECUTE` a `PUBLIC` y lo otorga explícitamente a `hc_app`. En Supabase con *pooler* en modo transacción, la opción de arranque `role` puede no aplicarse: usar conexión directa o `SET ROLE` por transacción (**no verificado**).

## ADR-011 · Fechas y zona horaria (H-15)
- **Decisión.** Almacenamiento `timestamptz` (UTC). La hora ingresada manualmente se interpreta en `America/Santiago` con `Intl` (sin dependencias) y se rechazan las horas inexistentes por cambio de horario (probado con el salto del 6-sep-2026). Los filtros por día usan el día local completo (inicio inclusivo, fin exclusivo). Una fecha de pesaje no puede estar más de 5 min en el futuro.

## ADR-012 · Correcciones y pesaje cero (H-04) diferidos a la iteración 2/3
- **Decisión.** Pesajes y lotes son inmutables. La **corrección** (RF-08) será un evento nuevo con actor, motivo y referencia al original. Un "cero confirmado" no es un pesaje: se modelará en `measurement_occurrences` (iteración 3).

## ADR-013 · Estrategia de pruebas
- **Decisión.** Tres niveles: (1) **unitarias** (Vitest) de conversión de unidades, horario, validación, permisos, hashing; (2) **integración con PostgreSQL real** (BD efímera por archivo, migraciones + seed reales, ejecutando como `hc_app` para que RLS y privilegios sean efectivos); (3) **E2E con Playwright** contra la compilación de producción y una BD dedicada, más **axe-core** (WCAG 2 A/AA: sin violaciones serias o críticas). Una prueba de mutación manual confirmó que el test de concurrencia detecta la ausencia de la restricción única.
- **Límite conocido:** el entorno de ejecución fue Linux/PostgreSQL 16; no se probó en Windows ni con Supabase.

---
# Iteración 1.5 (2026-11-18): Windows, Supabase, Git y validación

## ADR-014 · Autenticación: transición controlada (se mantiene la local por ahora)
- **Contexto.** `docs/03` supone `profiles.id = auth.users.id` (Supabase Auth). Hoy funciona una autenticación local propia (ADR-002: scrypt, sesión opaca con hash en BD, bloqueo por intentos). El proyecto Supabase «HubCircular» existe, pero en esta iteración **no hubo conexión** (sin `.env.local`; las credenciales no se pegan en el chat), de modo que Supabase Auth no puede probarse.
- **Alternativas.**
  1. *Solo local.* Probada (167 pruebas + 20 E2E), sin dependencias externas. Carencias: sin verificación de correo, recuperación de clave ni MFA; no hay interfaz de gestión de usuarios (se crean por seed/SQL).
  2. *Supabase Auth de inmediato.* Delega credenciales, recuperación y MFA. Exige `@supabase/ssr`, URL y clave pública del proyecto, validar el JWT en servidor, configurar URL de redirección en el panel y vincular `profiles` con `auth.users`; crear usuarios por API requeriría una clave `service_role` (no se presupone). Hoy sería código **sin poder probarse** y obligaría a retirar la local antes de demostrar la nueva, lo que el encargo prohíbe.
  3. *Transición controlada (elegida).* Local como proveedor activo; integración de Supabase Auth diseñada como segundo proveedor detrás de la misma interfaz (`src/modules/identity/service.ts`), activable por configuración y retirable por etapas.
- **Decisión.** Opción 3. En esta iteración **no se cambia el proveedor**; se deja lista la capa de datos (ADR-015) y se define la transición:
  1. Nueva migración: `hc.profiles.auth_user_id uuid unique null` (vínculo con `auth.users.id`; sin FK dura para que el esquema siga funcionando en PostgreSQL local).
  2. Variable `AUTH_PROVIDER=local|supabase` (por defecto `local`). Con `supabase`: iniciar sesión con Supabase, verificar al usuario **en el servidor** (`auth.getUser()`, no confiar en la cookie sin verificar) y resolver `auth_user_id → profile`. La **autorización no cambia**: sigue basada en `user_roles` y en las políticas RLS por `hc.actor_id` (ninguna política se reescribe para depender de `auth.uid()`).
  3. Alta de usuarios mediante invitación desde el panel de Supabase (sin `service_role`); vínculo por correo verificado.
  4. Convivencia hasta que todos los usuarios activos hayan ingresado por Supabase y existan pruebas E2E del proveedor nuevo; entonces `AUTH_PROVIDER=supabase`. La tabla `local_credentials` **se conserva** hasta pasar un período de prueba; eliminarla es una migración destructiva que requiere aprobación explícita.
- **Reversión.** Volver a `AUTH_PROVIDER=local` (las credenciales locales siguen intactas hasta el paso final).
- **Criterios de aceptación de la transición** (pendientes): login/logout, bloqueo de usuario inactivo, mismas matrices de permisos y de ámbito por zona, caducidad de sesión, rechazo de JWT inválido o vencido, y que ninguna clave secreta llegue al navegador.
- **Estado:** decisión tomada; implementación **no iniciada** (depende de validar antes la base en Supabase y de configurar Auth en el panel).

## ADR-015 · Rol de la aplicación: `SET LOCAL ROLE` por transacción (reemplaza la opción de arranque)
- **Contexto.** ADR-010 conectaba con la opción de arranque `-c role=hc_app` y advertía que podía no funcionar tras el pooler de transacciones de Supabase.
- **Decisión.** `src/lib/db.ts` abre cada transacción con `begin; set local role "hc_app"` (también las consultas «sin actor»). El efecto desaparece solo al terminar la transacción, no depende de estado de sesión ni de parámetros de arranque y funciona con conexión directa, Session pooler y Transaction pooler. El nombre del rol se valida (`/^[a-z_][a-z0-9_]*$/`) antes de interpolarse. TLS configurable (`DB_SSL`, `DB_SSL_CA_FILE`; remoto = `require` por defecto).
- **Recomendado antes de datos reales:** rol de login dedicado `hc_login` (miembro de `hc_app`, sin atributos especiales) para que la app **nunca** conecte como `postgres` ni pueda hacer `RESET ROLE` hacia un rol privilegiado. Verificado en PostgreSQL 16 local; **no** en Supabase (ver `docs/19`).
- **Migración 0006:** falla de forma explícita si el rol que migra no es miembro de `hc_app` (0001 solo avisaba) y retira todo privilegio de `anon`, `authenticated` y PUBLIC sobre el esquema `hc` (incluidos privilegios por defecto), por si la plataforma los otorga a objetos nuevos. Idempotente y sin cambios de datos.
- **Herramientas:** `npm run db:check` (solo lectura) verifica identidad del destino, TLS, `SET ROLE`, RLS en todas las tablas, ausencia de privilegios de `anon`/`authenticated`, migraciones pendientes y conflictos.

## ADR-016 · Sin Docker; pruebas destructivas solo contra PostgreSQL local
- **Decisión.** Se elimina `docker-compose.yml`. Las pruebas de integración y E2E crean y borran bases: `tests/helpers/guard.ts` y `assertLocalOnly` las **rechazan contra cualquier host no local** (incluido Supabase), sin variable que lo anule. Para Windows se documenta un PostgreSQL 16 portable (zip binario de EDB, sin instalador ni Docker) gestionado con `scripts/windows/postgres-local.ps1`. `db:reset` se niega siempre a actuar sobre hosts no locales.
- **Candados remotos:** migrar y sembrar contra un host no local exigen `CONFIRM_REMOTE_MIGRATION=<host>` / `CONFIRM_REMOTE_SEED=<host>` (el script imprime el host exacto); `db:migrate -- --dry-run` informa sin escribir; migrar por el puerto 6543 se rechaza (advisory lock de sesión).
- **Límite:** el script de PowerShell no se ha ejecutado en Windows.

## ADR-017 · Portabilidad Windows de las migraciones
- **Decisión.** `.gitattributes` fija LF en `*.sql` y el migrador normaliza CRLF→LF antes de calcular el checksum: un `git clone` en Windows no genera falsos «migración modificada». Con LF el checksum es idéntico al anterior, de modo que no invalida bases ya migradas.

## ADR-018 · Contenedor global mixto y material «MIXTO» (solo datos DEMO por ahora)
- **Contexto.** El equipo informó (verbal, no confirmado por el Hub) que existen contenedores globales con residuos mezclados y que probablemente llegan materiales distintos a los contenedores. El usuario pidió incorporarlo ya, con la posibilidad de cambiarlo o quitarlo después.
- **Decisión.** Sin cambios de esquema ni de código de aplicación: el seed DEMO agrega el material `DEMO-MIXTO` («Mixto / no clasificable (demo)»), la estación `DEMO-Z01-GLOBAL` y el contenedor `DEMO-Z01-GLOBAL-MIXTO` en la zona Cowork DEMO, **sin tara nominal** (se desconoce el peso del contenedor; el operador la ingresa en cada pesaje). El pesaje deriva el material del contenedor, como siempre.
- **Regla para el futuro.** Los indicadores de «reciclable capturado» **no deben mezclar** el material mixto con el segregado (se filtra por material); se aplicará al construir el dashboard (iteración 3).
- **No incluido (siguen aplazados):** carga de un material o contenedor *reales* (faltan zonas y estaciones reales y datos del Hub), despachos sin destino, excepción de material en el pesaje. Para quitarlo: eliminar las líneas marcadas en `db/seed/demo.ts` y los registros demo asociados (con aprobación; los pesajes son inmutables, por lo que un contenedor con pesajes solo puede desactivarse).
- **Verificado:** `tests/integration/mixed-container.test.ts` (4 pruebas) y 171/171 Vitest + 20/20 E2E en Linux. Pendiente en Supabase: volver a ejecutar `db:seed` (ver `docs/19`).

---
# Iteración 2 (2026-11-18): Trazabilidad

## ADR-019 · Un único flujo transaccional para los cinco movimientos
- **Contexto.** `docs/03`/`docs/07` piden traslado, despacho, reutilización, rechazo y ajuste con saldo nunca negativo, auditoría y corrección sin borrado.
- **Decisión.** Una sola función `hc.register_movement` (SECURITY DEFINER, `search_path = hc, pg_temp`, `EXECUTE` solo para `hc_app`) y una sola tabla `hc.movements` de **solo anexado** (trigger `forbid_modification`, HC423). Cada movimiento describe un delta de saldo: resta de `from_location_id` y/o suma a `to_location_id` (ubicación = zona, ADR-005). Reglas de forma por tipo (restricción `CHECK` + validación en la función): traslado = origen y destino distintos, sin destino externo; despacho/reutilización = origen + destino del catálogo; rechazo = origen + motivo; ajuste = una sola ubicación + motivo, **solo administrador**.
- **Concurrencia.** Cada movimiento bloquea primero la fila del **lote** (`SELECT … FOR UPDATE`) y luego la fila de saldo de origen. Bloquear siempre en ese orden serializa los movimientos de un mismo lote y evita interbloqueos entre traslados cruzados. Probado con 10 retiros simultáneos de 4.000 g sobre 10.000 g (solo 2 prosperan, saldo final 2.000 g) y con 16 traslados cruzados simultáneos (0 interbloqueos, masa total conservada). **Prueba de mutación:** al quitar los dos `FOR UPDATE`, ambas pruebas fallan.
- **Idempotencia.** `unique (created_by, idempotency_key)` + `ON CONFLICT DO NOTHING` y reproducción del resultado original; misma clave con datos distintos ⇒ HC409. Misma clave de 10 envíos simultáneos ⇒ 1 movimiento.
- **Corrección (RF-08, cierra ADR-012 para movimientos).** Un movimiento nunca se edita ni se borra. Corregir crea un movimiento `correccion` de efecto inverso con `corrects_movement_id`, motivo (≥ 5 caracteres), autor y auditoría; índice único parcial: **una sola corrección por movimiento**; no se corrige una corrección; si el saldo ya no alcanza para revertir, se rechaza (el saldo nunca queda negativo). Solo administrador. Los pesajes siguen siendo inmutables.
- **Coherencia de origen de datos.** Lote, movimiento y destino deben compartir `data_origin`: un destino DEMO no puede usarse con un lote real ni viceversa (trigger + función).
- **Ámbito.** El operador solo mueve desde zonas de su ámbito (RLS + `user_in_scope`). Un traslado a otra zona es válido; tras él, los lotes y pesajes quedan visibles para el ámbito que recibe el material (políticas `batches_read_by_location` y `weighings_read_via_batch`). **Limitación conocida:** la lista de zonas es la visible para el actor (RLS de `zones`), por lo que en la interfaz un operador solo ve como destino de traslado zonas de su ámbito; el administrador ve todas.
- **Sin cambio de contrato.** No se agregó endpoint de movimientos a la API (`docs/04` no lo define); la funcionalidad se expone por interfaz web (server actions). Si se necesita una API, se decide aparte.
- **Alternativas descartadas.** Un saldo calculado al vuelo sumando movimientos (más lento y sin un punto único para bloquear); `UPDATE` de movimientos para corregir (rompe la trazabilidad); tipos de movimiento separados en tablas distintas (duplica reglas).

## ADR-020 · Evidencia como referencia de texto y valorización como verificación (H-05, valor provisional)
- **Contexto.** H-05 está abierta (`docs/21`). El usuario decidió: evidencia = **solo referencia de texto** (sin carga de archivos ni Storage), y los destinos son un catálogo con administración básica.
- **Decisión provisional.**
  - `hc.movement_evidence` (solo anexado): `kind` (`guia_despacho`, `certificado`, `correo`, `foto` [solo referencia], `otro`), `reference` (1–200), `note`, quién y cuándo; única por (movimiento, tipo, referencia). La función admite evidencia en despachos y reutilización y la rechaza en otros tipos y en movimientos ya corregidos; la interfaz la ofrece hoy solo en despachos, que son los únicos verificables.
  - `hc.movement_verifications` (solo anexado): historial de decisiones `confirmada` | `rechazada`, con quién y cuándo; el rechazo exige motivo. **Verificar no es un movimiento**: no resta saldo ni crea una segunda salida (caso de aceptación 8 y prueba «evidence confirmation creates no new outflow»). Confirmar exige al menos una evidencia. Un despacho **sin evidencia no se declara valorizado**: la interfaz muestra «Pendiente: sin evidencia» / «Pendiente de verificación» y nunca «reciclado confirmado».
  - Solo el administrador decide la verificación; operador y administrador agregan evidencia. No se puede corregir un despacho con verificación `confirmada` sin rechazarla antes (con motivo); el historial se conserva.
- **Pendiente con el Hub (H-05):** si la valorización debe ser un evento propio, quién la certifica y con qué documentos. Si cambia, el efecto es acotado: la tabla de verificaciones es independiente de los saldos.
- **Destinos.** `hc.destinations` (`gestor`, `reutilizacion`, `otro`; activo/inactivo; DEMO/real). Se **desactivan**, no se eliminan. Alta y activación solo administrador, con auditoría. Todo despacho y reutilización exige destino (queda fuera del alcance: despachos con destino indefinido, ver `docs/11`). Se siembran 3 destinos DEMO.

## ADR-021 · Supabase Auth como segundo proveedor de identidad; la autorización sigue siendo de HubCircular (cumple ADR-002/014)
- **Contexto.** ADR-002/014 previeron reemplazar la autenticación local por Supabase Auth. Antes de datos reales se pidió implementarlo.
- **Decisión.** `AUTH_PROVIDER=local|supabase` (por defecto `local`). Supabase solo **verifica** correo y contraseña por REST (`/auth/v1/token`); la app abre su propia sesión opaca y decide permisos con sus roles/zonas/RLS. El perfil debe existir (creado por un administrador), estar activo y tener el correo **confirmado** en Supabase; el primer ingreso lo vincula con `profiles.auth_user_id` (único); una identidad distinta para el mismo correo se rechaza (migración 0009, `hc.auth_link_supabase`).
- **Sin `service_role` ni `@supabase/supabase-js`.** Solo la clave publicable, solo en servidor (nunca `NEXT_PUBLIC_*`); una clave secreta/service_role se rechaza al cargar la configuración. `fetch` nativo con tiempo límite de 8 s; 429/5xx/red caída se informan como «servicio no disponible».
- **Por qué no los JWT de Supabase en la aplicación ni RLS con `auth.uid()`.** Las políticas actuales usan `hc.current_actor()` fijado por el servidor; cambiarlas habría tocado todo el modelo. Con este diseño el cambio de proveedor es reversible y no altera RLS.
- **Consecuencias.** En modo Supabase no hay claves en HubCircular (sin restablecer/cambiar, sin clave temporal); el bloqueo por intentos lo aplica Supabase; los usuarios de Supabase Auth viven fuera del respaldo de `hc`. Volver a `local` es posible porque no se borran credenciales locales y el administrador puede restablecer claves.
- **Verificado:** contra un GoTrue **simulado** (19 pruebas de integración, 9 unitarias, 5 E2E). **No verificado contra Supabase real.**

## ADR-022 · CSP con nonce por solicitud y cabeceras de endurecimiento en el proxy
- **Decisión.** `src/proxy.ts` aplica a toda respuesta una CSP con nonce y `strict-dynamic` (sin `unsafe-inline`/`unsafe-eval` en producción para scripts), más `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP. HSTS y `upgrade-insecure-requests` solo con `SESSION_COOKIE_SECURE=true`.
- **Compromisos aceptados.** `style-src 'unsafe-inline'` (React/Next); layout raíz dinámico; sin `preload` de HSTS hasta decidir dominio definitivo.
- **Verificado:** 5 pruebas unitarias y 3 E2E (cabeceras, nonce, ausencia de violaciones, bloqueo de manejador inline inyectado). Falta comprobarlo en el host real.

## ADR-023 · Gestión de usuarios por interfaz con clave temporal mostrada una vez
- **Decisión.** Funciones `SECURITY DEFINER` (0008) para alta, activación, roles y restablecimiento; clave temporal aleatoria generada y hasheada (scrypt) en el servidor, mostrada una vez; `must_change_password` obliga a cambiarla en el primer ingreso. Protecciones en la base: no desactivarse, no quedar sin administrador con acceso total, no dejar usuarios sin roles. Auditoría sin secretos.
- **Compromiso aceptado.** La obligación de cambiar la clave temporal se aplica en la aplicación, no en RLS.
- **Alternativas descartadas.** Clave elegida por el administrador (la conoce un tercero); enlace por correo (no hay SMTP ni dominio aún).

## ADR-024 · Respaldo lógico fuera del repositorio y prueba de restauración obligatoria
- **Decisión.** `npm run db:backup` (pg_dump formato custom del esquema `hc` + manifiesto con checksum y conteos) hacia una carpeta fuera del repo; `npm run db:restore-check` restaura en una base **local vacía** y compara con el manifiesto. No sustituye las copias propias de Supabase (a confirmar en el panel); las complementa y se puede restaurar y probar sin tocar Supabase.
- **Salvaguardas.** Rechaza escribir dentro del repo, el puerto 6543, un `pg_dump` más antiguo que el servidor, destinos de restauración no locales o con esquema `hc`; la clave va por `PGPASSWORD`. El respaldo contiene hashes de contraseña: es información sensible.
- **Verificado:** restauración real en PostgreSQL 16 local; **no** ejecutado contra Supabase.

## ADR-025 · Definiciones de los indicadores del tablero (Iteración 3)
- **Contexto.** `docs/06` dejaba abiertas la fecha de la valorización (H-06) y la forma de cerrar el inventario.
- **Decisión.** Cifras «como se conoce hoy»: movimientos efectivos = sin correcciones y sin los originales corregidos; período por fecha local de Chile (`America/Santiago`) del propio registro; valorización confirmada por **fecha de despacho** (decisión del usuario); inventario reconstruido del libro con cierre contable explícito que la pantalla concilia; origen real/DEMO nunca mezclado (por defecto real); ámbito aplicado línea a línea con `actor_in_scope`, no solo por RLS. Cálculo en funciones SQL *invoker* (una sola definición para pantalla y CSV).
- **Consecuencia aceptada.** Una corrección posterior cambia períodos ya consultados. Las definiciones dependen de H-01, H-05 y H-07 (abiertas) y así se informa en la pantalla.
- **Alternativas descartadas.** Cálculo en la aplicación (dos definiciones posibles); fecha de confirmación (mueve cifras de períodos cerrados); vistas materializadas (estado extra sin necesidad).

## ADR-026 · Calendarios de medición versionados, cobertura derivada y «cero confirmado» (resuelve H-04)
- **Decisión.** Días fijos de la semana por contenedor; calendario inmutable salvo su término (como máximo ayer; creación desde hoy) para que lo esperado en el pasado no cambie; mediciones esperadas **derivadas** (sin filas por día ni cron); estado derivado realizado > cero_confirmado > omitido/pendiente; «cero confirmado» solo de hoy, sin pesaje del día, con ámbito, idempotente e inmutable, y **no es un pesaje** (no crea lote ni masa). Solo el administrador programa; administrador y operador confirman cero; el lector solo mira. Reemplaza la tabla `measurement_occurrences` prevista en ADR-012.
- **Consecuencia aceptada.** No se puede confirmar cero retroactivamente ni programar hacia atrás; un día sin pesaje ni cero queda «omitido» (ausente ≠ cero).
- **Alternativas descartadas.** Filas de ocurrencias generadas por tarea programada (requiere cron y puede divergir); calendarios editables (reescriben el historial de lo esperado); ventana de ±1 día.

## ADR-027 · Gráficos en SVG propio, sin Recharts (modifica la previsión de ADR-001)
- **Decisión.** El gráfico semanal es un componente servidor en SVG con leyenda, `<title>` por segmento, tabla de datos equivalente y paleta categórica validada con el validador del skill de visualización (separación CVD adyacente y piso de visión normal aprobados; el contraste bajo de tres tonos se compensa con leyenda y tabla). Sin dependencia nueva.
- **Consecuencia aceptada.** Sin tooltip interactivo propio ni animaciones; cada gráfico nuevo requiere código nuevo.
