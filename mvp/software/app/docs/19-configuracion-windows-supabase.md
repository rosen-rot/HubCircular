# 19 · Configuración en Windows y conexión a Supabase (Iteración 1.5)

> Esta guía **no contiene secretos**. Las contraseñas y cadenas de conexión se escriben solo en `.env.local` (ignorado por Git), nunca en el chat, en commits ni en la documentación. Última revisión: 2026-11-18.

## 0. Qué está verificado y qué no

| Aspecto | Estado | Evidencia |
|---|---|---|
| Código, migraciones 0001–0006 y pruebas | Verificado en **Linux + PostgreSQL 16.15** | `docs/20` |
| Compatibilidad con el pooler de Supabase (rol por `SET LOCAL ROLE`, TLS, sin estado de sesión) | Verificado **por pruebas locales equivalentes**; no contra Supabase | `tests/integration/app-role.test.ts` |
| Ejecución nativa en **Windows** (PowerShell, rutas `D:\`, `npm ci`) | **No verificado**: el shell disponible para el asistente es una VM Linux, no tu Windows | `scripts/windows/*.ps1` sin ejecutar |
| Conexión real al proyecto Supabase «HubCircular» | **No realizada**: no existe `.env.local` en la carpeta y no se debe pegar la clave en el chat | `docs/20` |

Por eso los pasos 1 y 2 de esta guía los ejecutas tú en PowerShell; cada comando indica qué resultado esperar.

## 1. Windows sin Docker

Requisitos: Node.js LTS (≥ 20.9; probado con 22), npm y Git. No se necesita Docker ni PostgreSQL instalado para **usar** la aplicación (la base es Supabase). PostgreSQL local solo hace falta para las pruebas destructivas (sección 5).

```powershell
cd D:\Proyectos\HubCircular
# Diagnóstico de solo lectura (no instala nada, no imprime secretos)
powershell -ExecutionPolicy Bypass -File scripts\windows\verificar-entorno.ps1
```

Si falta algo (con tu aprobación, pues instala software):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Cachés en `D:` (opcional, evita llenar `C:`):

```powershell
npm config set cache D:\Cache\npm
```

Instalación y comprobaciones sin base de datos:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:unit
```

Notas de compatibilidad con Windows: los scripts de `package.json` usan solo `npm`, `tsx`, `next` y `vitest` (sin sintaxis bash); `.gitattributes` fija saltos de línea LF en `*.sql` y el migrador normaliza CRLF→LF antes de calcular el checksum, de modo que un `git clone` en Windows no provoca falsos conflictos de migración.

## 2. Obtener la conexión de Supabase (sin pegarla en el chat)

1. Abre el panel de Supabase e ingresa al proyecto **HubCircular** (el de desarrollo).
2. Confirma la identidad del proyecto: **Project Settings → General → Reference ID** (20 letras). Anótala; `npm run db:check` imprime la referencia deducida de tu conexión y debe coincidir.
3. Contraseña de la base: **Project Settings → Database → Database password**. Si no la recuerdas, usa **Reset database password**, genera una larga y guárdala en tu gestor de contraseñas. Si contiene caracteres especiales (`@ : / ? # %`), debe ir codificada como URL (`@`→`%40`, `/`→`%2F`, `#`→`%23`, `:`→`%3A`, `%`→`%25`).
4. Cadena de conexión: botón **Connect** (arriba) → pestaña **Connection string** → tipo **URI**. Hay tres modalidades; elige así:

| Modalidad | Puerto | Útil para | Notas |
|---|---|---|---|
| Direct connection | 5432 | migrar | Solo IPv6 salvo que el proyecto tenga el complemento IPv4. Muchas redes domésticas de Chile no tienen IPv6. |
| **Session pooler** | 5432 | **migrar y ejecutar la app (recomendado)** | Funciona con IPv4. Usuario con formato `postgres.<referencia>`. |
| Transaction pooler | 6543 | solo la app, opcional | **No sirve para migrar** (advisory locks de sesión). La app lo soporta porque no depende de estado de sesión. |

Recomendación: **Session pooler (5432)** para `MIGRATION_DATABASE_URL` y `DATABASE_URL` en esta etapa.

## 3. Configurar `.env.local` de forma segura

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Completa **solo en ese archivo** (los valores entre `<>` son los tuyos):

```ini
# Cadena del Session pooler copiada del panel (la clave la escribes tú, codificada como URL)
MIGRATION_DATABASE_URL=postgresql://postgres.<referencia>:<CLAVE>@<host-del-pooler>:5432/postgres
DATABASE_URL=postgresql://postgres.<referencia>:<CLAVE>@<host-del-pooler>:5432/postgres
DB_APP_ROLE=hc_app
DB_SSL=require
SESSION_COOKIE_SECURE=false
```

Reglas:

- `.env.local` está en `.gitignore`; la plantilla pública es `.env.example` (solo marcadores). `git status` **no** debe listar `.env.local`.
- **Nunca** pongas `DATABASE_URL`, claves `service_role` ni claves secretas en variables `NEXT_PUBLIC_*` ni en código de navegador. Esta versión **no usa** `service_role` ni la API REST de Supabase: la aplicación habla con PostgreSQL desde el servidor.
- `DB_SSL=require` cifra la conexión sin validar el certificado. Para validarlo, descarga el certificado raíz (Project Settings → Database → SSL Configuration), guárdalo fuera del repositorio y usa `DB_SSL=verify` con `DB_SSL_CA_FILE=D:\ruta\prod-ca-2021.crt`.

Comprobación de solo lectura (no escribe nada; transacción `read only` que siempre se revierte):

```powershell
npm run db:check
npm run db:migrate -- --dry-run
```

Qué debes ver: `Destino: Supabase · … · proyecto Supabase <tu referencia>`; `Conexión cifrada (TLS)`; la lista de esquemas existentes (`public`, `auth`, `storage`, etc., que **no** se tocan); `El esquema hc no existe` (base sin inicializar); y `Pendientes (6)`. Si la referencia no coincide con la del paso 2, **detente**.

## 4. Aplicar migraciones (requiere tu aprobación explícita)

Las migraciones crean únicamente el esquema `hc` y el rol `hc_app` (sin login). No modifican `public`, `auth`, `storage` ni otros esquemas de Supabase; `anon` y `authenticated` ya existen y solo se les **retiran** privilegios sobre `hc`.

Cuando des tu aprobación, ejecuta (el valor debe ser el host exacto que imprime el script):

```powershell
$env:CONFIRM_REMOTE_MIGRATION = "<host-del-pooler>"
npm run db:migrate
Remove-Item Env:CONFIRM_REMOTE_MIGRATION
npm run db:check
```

Resultado esperado de `db:check`: `SET LOCAL ROLE hc_app funciona`, `Todas las tablas de hc tienen RLS habilitado`, `anon y authenticated no tienen ningún privilegio sobre el esquema hc`, `No hay migraciones pendientes`.

Si una migración falla, se revierte esa migración (cada una va en su transacción) y las anteriores quedan aplicadas; el mensaje indica cuál. **No** se corrige editando una migración ya aplicada (el checksum lo impide): se crea una nueva.

Datos DEMO opcionales (solo proyecto de desarrollo; usuarios `*.demo.hubcircular.test`, claves aleatorias que se muestran una sola vez):

```powershell
$env:CONFIRM_REMOTE_SEED = "<host-del-pooler>"
npm run db:seed
Remove-Item Env:CONFIRM_REMOTE_SEED
```

Iniciar la app: `npm run dev` → http://localhost:3000.

### Plan de recuperación (preparado, **no ejecutado**)

El estado inicial esperado es un proyecto vacío; todo lo que HubCircular crea vive en el esquema `hc` y el rol `hc_app`. Si hubiera que volver al estado anterior, y **solo con aprobación explícita** (borra todos los datos de HubCircular en esa base), se ejecutaría manualmente en **SQL Editor** del panel:

```sql
drop schema if exists hc cascade;
drop role if exists hc_app;
```

No existe script ni comando npm para esto contra Supabase (`npm run db:reset` se niega a actuar sobre cualquier host no local). Antes de datos reales: activar copias de seguridad del proyecto (Database → Backups; depende del plan) y probar una restauración.

### Endurecimiento recomendado antes de datos reales: rol de login dedicado `hc_login`

Hoy la aplicación se conecta como `postgres` y baja a `hc_app` con `SET LOCAL ROLE` en cada transacción. Funciona, pero una inyección SQL hipotética podría ejecutar `RESET ROLE` y volver a `postgres`. Con un rol de login dedicado, **ni siquiera eso es posible**: `hc_login` no tiene privilegios propios y solo puede cambiar a `hc_app`.

1. **Antes de tocar nada**, copia tu `DATABASE_URL` actual (la de `postgres.<referencia>`) a `MIGRATION_DATABASE_URL` en `.env.local`. Desde ahora `DATABASE_URL` no podrá migrar.
2. Genera una clave larga y segura sin caracteres especiales (no necesita codificación en la URL) y guárdala en tu gestor de contraseñas; no la pegues en el chat:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

3. En el panel de Supabase abre **SQL Editor → New query**, pega esto reemplazando `<CLAVE>` por la clave generada y ejecútalo. La clave solo queda en esa consulta del panel, no en el repositorio:

   ```sql
   create role hc_login login password '<CLAVE>' noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
   grant hc_app to hc_login;
   ```

   Si ya lo ejecutaste antes y necesitas cambiar la clave: `alter role hc_login password '<CLAVE_NUEVA>';`.
4. En `.env.local` cambia **solo** `DATABASE_URL`: el usuario pasa a `hc_login.<referencia>` y la clave a la nueva (mismo host y puerto del Session pooler). `MIGRATION_DATABASE_URL` conserva `postgres.<referencia>`.
5. Verifica la conexión de la aplicación (solo lectura):

   ```powershell
   npm run db:check:app
   ```

   Debe mostrar: `«hc_login» no tiene atributos privilegiados`, `Sin SET ROLE, «hc_login» no puede usar el esquema hc`, `Solo puede cambiar a hc_app`, `SET LOCAL ROLE hc_app funciona` y `Resultado: sin errores ni avisos`.
6. Reinicia `npm run dev` y registra un pesaje DEMO para confirmar que la app funciona con el rol nuevo. `npm run db:check` sigue usando la conexión de migración.

Comportamiento verificado en PostgreSQL 16 local con `db:check:app` en cuatro escenarios: `hc_login` correcto ⇒ sin errores; conectando como `postgres` ⇒ aviso de rol privilegiado; sin membresía en `hc_app` ⇒ error; miembro de un rol privilegiado ⇒ error. En Supabase se valida con el paso 5.

### Revisiones en el panel que el código no puede hacer

- **Project Settings → API → Exposed schemas**: `hc` **no** debe aparecer (solo `public`). Aunque apareciera, `anon` y `authenticated` no tienen ningún privilegio sobre `hc` y todas las tablas tienen RLS (`db:check` lo comprueba), pero la superficie debe permanecer cerrada.
- Si no usarás la API REST/GraphQL de Supabase, puedes desactivar la Data API del proyecto.
- Authentication → Providers: sin cambios en esta iteración (ver ADR-014 en `docs/18`).

## 5. Pruebas destructivas: PostgreSQL local descartable (sin Docker)

Las pruebas de integración y E2E crean y eliminan bases `hc_test_*`/`hc_e2e`. **Se niegan a ejecutarse contra cualquier host que no sea local** (`tests/helpers/guard.ts`), incluido Supabase, sin variable que lo evite.

Opción sin instalador ni administrador: binarios portables de PostgreSQL 16 para Windows (zip «Binaries» de EDB, https://www.enterprisedb.com/download-postgresql-binaries) descomprimidos en `D:\Tools\pgsql`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\postgres-local.ps1 -Action init
powershell -ExecutionPolicy Bypass -File scripts\windows\postgres-local.ps1 -Action start
$env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:54329/postgres"
npm run test:integration
npm run test:e2e
powershell -ExecutionPolicy Bypass -File scripts\windows\postgres-local.ps1 -Action stop
```

Datos en `D:\Datos\hubcircular-pg-test`, puerto 54329, solo `127.0.0.1`. Este script **no se ha ejecutado en Windows** (ver sección 0). Si prefieres otra vía (p. ej. instalar PostgreSQL 16 de forma convencional), basta con que `TEST_DATABASE_URL` apunte a esa instancia local con un usuario que pueda crear bases.

Sin PostgreSQL local, `npm run test:unit` sigue funcionando y las pruebas de integración/E2E quedan **pendientes** (no se simulan).

## 6. Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | sí | Conexión de la app (servidor). Nunca `NEXT_PUBLIC_*`. |
| `MIGRATION_DATABASE_URL` | no | Conexión con privilegios para migrar; si falta se usa `DATABASE_URL`. |
| `DB_APP_ROLE` | no (`hc_app`) | Rol al que baja cada transacción (`SET LOCAL ROLE`). |
| `DB_SSL` | no | `disable` (local por defecto) · `require` (remoto por defecto) · `verify`. |
| `DB_SSL_CA_FILE` | con `verify` | Ruta del certificado raíz. |
| `DB_POOL_MAX` | no (10) | Tamaño del pool de la app. |
| `SESSION_COOKIE_SECURE` | no (`false`) | `true` solo detrás de HTTPS. |
| `SEED_*_PASSWORD` | no | Claves de los usuarios DEMO; si faltan, se generan y se muestran una vez. |
| `CONFIRM_REMOTE_MIGRATION` / `CONFIRM_REMOTE_SEED` | solo remoto | Host exacto; confirmación explícita por comando. |
| `TEST_DATABASE_URL` | solo pruebas | PostgreSQL **local** con permiso de crear bases. |

## 7. Problemas frecuentes

- `ENOTFOUND` / `network is unreachable` con la conexión directa: tu red no tiene IPv6; usa el Session pooler.
- `password authentication failed`: clave mal codificada como URL, o usuario sin el sufijo `.<referencia>` en el pooler.
- `Tenant or user not found`: referencia o región del pooler incorrectas; copia de nuevo la cadena del panel.
- `SET LOCAL ROLE hc_app falló` en `db:check`: el rol de conexión no es miembro de `hc_app` (ejecuta `grant hc_app to <rol>;` en SQL Editor).
- `ExecutionPolicy` bloquea `.ps1`: usa `powershell -ExecutionPolicy Bypass -File …` como en los ejemplos.
