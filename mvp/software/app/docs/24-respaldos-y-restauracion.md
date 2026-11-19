# 24 · Plan de respaldos y restauración

> Estado: herramientas implementadas y **probadas contra PostgreSQL 16 local** (respaldo → restauración en base vacía → comparación). **No** se ha ejecutado contra el proyecto Supabase de desarrollo desde este entorno (sin acceso a la red del usuario); la primera corrida real la hace el usuario con los comandos de la sección 3.

## 1. Qué se respalda y qué no

| Incluye | No incluye |
|---|---|
| Esquema `hc` completo: tablas, datos, funciones, políticas RLS, triggers, concesiones (`GRANT`) a `hc_app`/`anon`/`authenticated`. | Otros esquemas del proyecto Supabase (`auth`, `storage`, `public`…): no pertenecen a HubCircular. |
| Registro de migraciones (`hc.schema_migrations`). | Roles de la base (se crean en el servidor de destino; en Supabase ya existen). |
| Un manifiesto `.manifest.json` con checksum SHA-256, conteo de filas por tabla, políticas, funciones y migraciones. | Secretos de `.env.local`, claves de Supabase, el PDF oficial. |

**Sensibilidad.** El respaldo contiene `hc.local_credentials` (hashes scrypt de contraseñas), sesiones, auditoría y datos de negocio. Es tan sensible como la base: guárdelo en una carpeta privada (idealmente cifrada, p. ej. BitLocker), **nunca** en el repositorio, GitHub ni por correo. `.gitignore` ya excluye `*.dump`, y el script se niega a escribir dentro del repositorio.

## 2. Herramientas

| Comando | Qué hace | Salvaguardas |
|---|---|---|
| `npm run db:backup` | `pg_dump --format=custom --schema=hc --no-owner --serializable-deferrable` hacia `BACKUP_DIR`, verificación con `pg_restore --list`, SHA-256 y manifiesto. Solo lectura sobre la base. | `BACKUP_DIR` obligatorio y fuera del repo; rechaza puerto 6543 (pooler transaccional); exige `pg_dump` de versión ≥ servidor; clave por `PGPASSWORD` del proceso hijo (no en argumentos); no sobrescribe archivos existentes; escribe `.partial` y renombra al terminar; permisos 0600 donde aplique. |
| `npm run db:restore-check -- <archivo.dump>` | Restaura en una base **local y vacía** (`RESTORE_TEST_DATABASE_URL`) y compara: checksum, tablas, filas por tabla, migraciones, políticas, funciones, estado de RLS por tabla, concesiones clave y saldos no negativos. | Rechaza hosts no locales (incluido Supabase); rechaza una base que ya tenga el esquema `hc`; nunca borra nada; avisa si el checksum no coincide. |

### Requisitos en Windows

- Herramientas de cliente de PostgreSQL con `pg_dump` y `pg_restore` (instalador oficial de PostgreSQL, solo «Command Line Tools»). Versión **17 o superior** si el servidor Supabase es 17 (`pg_dump` no puede volcar un servidor más nuevo que él). Si no están en el `PATH`, defina `PG_DUMP_PATH` y `PG_RESTORE_PATH`.
- Para la prueba de restauración, un PostgreSQL local (el del proyecto, `scripts/windows/postgres-local.ps1`).

## 3. Procedimiento (usuario, PowerShell)

1. En `.env.local` (nunca en el chat): `BACKUP_DIR=D:\Respaldos\HubCircular` y, si hace falta, `PG_DUMP_PATH`/`PG_RESTORE_PATH`. `MIGRATION_DATABASE_URL` debe ser la conexión directa o el Session pooler (5432).
2. `npm run db:check` (confirma el proyecto y el estado) y luego `npm run db:backup`.
3. Anote el nombre del archivo, tamaño y SHA-256 que imprime. Guarde `.dump` y `.manifest.json` juntos.
4. **Prueba de restauración** (hágala la primera vez y después de cada cambio de migración):
   - Cree una base local vacía, p. ej. `psql -h 127.0.0.1 -U postgres -c "create database hc_restore_test"`.
   - `$env:RESTORE_TEST_DATABASE_URL="postgres://postgres@127.0.0.1:54329/hc_restore_test"; npm run db:restore-check -- "D:\Respaldos\HubCircular\<archivo>.dump"`
   - Debe terminar en «Prueba de restauración OK». Luego descarte esa base (`drop database hc_restore_test`).
5. Un respaldo que nunca se restauró no cuenta como respaldo: registre la fecha de la última prueba exitosa en `docs/15-registro-de-avances.md`.

## 4. Restauración real (desastre)

Esta guía **no se ejecuta sin aprobación explícita** y siempre sobre un destino nuevo o vacío; nunca se borra el esquema `hc` existente para «arreglar» algo.

1. Detenga la aplicación (o ponga el sitio en mantenimiento) para que no haya escrituras.
2. Cree un proyecto/base nueva y vacía (o un esquema `hc` inexistente) y verifique con `npm run db:check` que el destino es el esperado.
3. `pg_restore --no-owner --exit-on-error --dbname <destino> <archivo.dump>` (con `PGPASSWORD` en el entorno, no en la línea de comandos). Los roles `hc_app`, `anon`, `authenticated` deben existir antes (en Supabase existen; en local, créelos `NOLOGIN`).
4. `npm run db:check` y `npm run db:check:app` contra el destino; compare con el manifiesto.
5. Apunte `DATABASE_URL` al destino y reinicie la aplicación. Las sesiones existentes siguen siendo válidas porque `hc.local_sessions` viaja en el respaldo; si el incidente fue de seguridad, restablezca contraseñas desde `/usuarios`.

## 5. Frecuencia y retención (propuesta; confirmar con el equipo)

- Antes de **cada migración** en Supabase: un `db:backup` (es la red de seguridad real si una migración sale mal).
- Una vez por semana mientras haya datos de piloto; a diario cuando se capturen datos reales.
- Retención sugerida: 4 semanales + 3 mensuales, en dos ubicaciones distintas (disco local cifrado y un segundo medio). Pendiente de decisión del equipo.

## 6. Copias propias de Supabase (lista de verificación del usuario)

No se afirma aquí qué incluye cada plan de Supabase: **verifíquelo en el panel** (Project → Database → Backups) y anótelo:

- [ ] ¿Hay copias automáticas diarias y cuántos días se conservan en su plan?
- [ ] ¿Está disponible la recuperación a un punto en el tiempo (PITR)? ¿Está activada?
- [ ] ¿Quién del equipo puede restaurar y con qué cuenta?
- [ ] ¿Las copias del panel cubren el esquema `hc` (sí, es parte de la base) y cuánto tardaría una restauración?

Las copias del panel **no sustituyen** este respaldo lógico: este se puede restaurar localmente, probar sin tocar Supabase y conservar bajo control del equipo.

## 7. Límites conocidos

- La restauración se probó con PostgreSQL 16 local (Linux). El usuario ejecutó `db:backup` contra Supabase (PostgreSQL 17.11) en Windows con `pg_dump` 18.2 el 19-11-2026 y terminó bien; `db:restore-check` con ese mismo archivo, en un PostgreSQL 18 local, terminó **OK** (77 filas, 9 migraciones, 17 políticas, 36 funciones y RLS idénticos). **Falta** probar la restauración en un servidor 17. Un volcado hecho con `pg_dump` 18 puede no restaurarse en un servidor 17 o menor: restáurelo en un PostgreSQL local de versión igual o mayor (el 18 instalado sirve).
- No respalda los esquemas internos de Supabase ni su Auth (cuando se active ADR-014, los usuarios de Supabase Auth viven en el esquema `auth`, **fuera** de este respaldo; ver docs/23).
- `--serializable-deferrable` puede esperar unos segundos a un momento sin transacciones conflictivas; con la carga prevista no es relevante.
- El manifiesto se calcula antes del volcado en una transacción `repeatable read`; si el origen recibe escrituras entre ambos pasos, `db:restore-check` informará diferencias y basta repetir el respaldo.
