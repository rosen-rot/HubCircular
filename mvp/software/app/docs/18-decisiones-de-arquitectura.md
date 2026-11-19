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
