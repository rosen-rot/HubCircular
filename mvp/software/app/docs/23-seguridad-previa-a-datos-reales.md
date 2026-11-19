# 23 · Seguridad previa a datos reales (cabeceras, usuarios, Supabase Auth, respaldos)

**Corte:** 19 de noviembre de 2026, Chile. Todo lo de este documento se implementó y probó **en el entorno Linux de la sesión con PostgreSQL 16 local**. Las migraciones **0008 y 0009 fueron aplicadas en Supabase por el usuario el 19-11-2026** (`db:check` sin errores; `docs/15`) y **Supabase Auth NO se probó contra el servicio real** (solo contra un servidor simulado; el proveedor sigue siendo `local`). Lo que cuenta como verificado y lo que no está en la sección 6.

## 1. Cabeceras de seguridad (CSP, HSTS y otras) — ADR-022

- `src/proxy.ts` genera un *nonce* por solicitud y aplica a **todas** las respuestas (páginas, redirecciones a `/login`, `401` de `/api`): `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (cámara, micrófono, geolocalización, pagos y USB desactivados), `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy: same-origin`.
- **CSP.** `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'` (sin `unsafe-inline` ni `unsafe-eval` en producción); `object-src 'none'`; `frame-ancestors 'none'`; `form-action 'self'`; `base-uri 'self'`; `connect-src 'self'`. **Límite conocido:** `style-src` conserva `'unsafe-inline'` porque React/Next emiten atributos `style`; sin scripts inline el riesgo es bajo.
- **HSTS** (`max-age=31536000; includeSubDomains`, sin `preload`) y `upgrade-insecure-requests` solo se envían cuando `SESSION_COOKIE_SECURE=true` (es decir, detrás de HTTPS). Por http local se omiten para no romper el desarrollo.
- El layout raíz es dinámico (`force-dynamic`) para que Next pueda inyectar el nonce en cada respuesta; el costo es no tener páginas estáticas, irrelevante para esta aplicación autenticada.
- La verificación de credenciales con Supabase Auth ocurre **en el servidor** (`fetch` desde Node), por lo que `connect-src 'self'` no se ve afectado.
- **Cómo comprobarlo tras desplegar:** `curl -sI https://<su-dominio>/login` debe mostrar `content-security-policy` con un nonce distinto en cada llamada y `strict-transport-security`. Un escáner externo (securityheaders.com) es un complemento, no un reemplazo.

Pruebas: `tests/unit/security-headers.test.ts` (5) y `tests/e2e/security.spec.ts` (3): cabeceras en login, redirecciones y API; nonce distinto por solicitud y presente en los `<script>`; la interfaz completa funciona sin violaciones de CSP y un manejador inline inyectado queda bloqueado.

## 2. Gestión de usuarios por interfaz — ADR-023

Pantalla `/usuarios` (solo administrador) y `/cuenta/clave` (cualquier usuario autenticado, con proveedor local).

- **Alta**: correo, nombre, rol y zona (el operador exige zona). Con proveedor local el sistema genera una **clave temporal aleatoria** (16 caracteres sin ambiguos, formato `XXXX-XXXX-XXXX-XXXX`) y la **muestra una sola vez** al administrador; en la base solo se guarda su hash scrypt y la bandera `must_change_password`. No se vuelve a mostrar al recargar.
- **Primer ingreso**: quien entra con una clave temporal solo puede usar `/cuenta/clave`. Todo lo demás redirige allí (páginas vía `requireActor`), las acciones/servicios responden `password_change_required` y la API devuelve 403. Al cambiarla (mínimo 12 caracteres, distinta de la actual, sin el correo; máximo 128) se cierran las demás sesiones.
- **Restablecer** clave: nueva clave temporal, sesiones del usuario revocadas, bloqueo por intentos limpiado.
- **Desactivar / activar**: desactivar revoca las sesiones y bloquea el ingreso. **Roles**: agregar/quitar con ámbito de zona.
- **Protecciones (en la base, no solo en la interfaz):** no se puede desactivar ni restablecer la propia cuenta desde `/usuarios`, no se puede dejar al sistema sin un administrador activo con acceso a todas las zonas (`last_admin`), ni dejar a un usuario sin roles (`last_role`), ni duplicar un rol o un correo. Cada cambio queda en `audit_logs` sin claves ni hashes.
- **Límite de diseño:** la obligación de cambiar la clave temporal se aplica en la aplicación (páginas, servicios y API), **no en las políticas RLS**; el rol `hc_app` no distingue sesiones con clave temporal. Un fallo en la capa de aplicación no lo detendría la base.

Pruebas: `tests/integration/users.test.ts` (13), `tests/unit/users.test.ts`, `tests/e2e/users.spec.ts` (5, incluye axe-core) y una prueba de mutación: sin el control del «último administrador» fallan 6 pruebas.

## 3. Supabase Auth como segundo proveedor — ADR-021

**Qué hace.** `AUTH_PROVIDER=local` (por defecto) o `supabase`. En modo `supabase`, Supabase Auth **solo verifica la identidad** (correo + contraseña, endpoint `POST /auth/v1/token?grant_type=password`). La **autorización** (roles, zonas, RLS), la **sesión de la aplicación** (cookie opaca, hash en `hc.local_sessions`) y la **auditoría** siguen siendo de HubCircular. El token de Supabase se descarta (se intenta revocar con `/auth/v1/logout`); no se guarda.

**Reglas de acceso (migración 0009, `hc.auth_link_supabase`).**
1. Solo entra quien ya tiene un **perfil activo creado por un administrador**; registrarse en Supabase no da acceso (sin perfil no hay sesión ni se crea uno).
2. El correo debe estar **confirmado** en Supabase (se exige `email_confirmed_at`/`confirmed_at` y que el correo devuelto coincida).
3. El primer ingreso verificado **vincula** el perfil con el `id` de Supabase (`profiles.auth_user_id`, único, no legible por `hc_app`). Si el perfil ya está vinculado a **otra** identidad, se rechaza (evita la toma de cuenta por homónimo de correo o por cuenta recreada).
4. Desactivar el perfil cierra sus sesiones y le impide volver a entrar aunque su cuenta de Supabase siga viva.

**Qué NO usa.** No usa `service_role` ni clave secreta: la configuración **rechaza** una clave `sb_secret_…` o un JWT con rol `service_role`. Variables solo de servidor (nunca `NEXT_PUBLIC_*`): `SUPABASE_URL` (https; http solo localhost) y `SUPABASE_PUBLISHABLE_KEY` (publicable/anon). Sin dependencias nuevas (se usa `fetch`, no `@supabase/supabase-js`).

**Cambios de interfaz en este modo.** `/usuarios` crea el perfil **sin clave** y explica que la persona debe existir en Supabase (Authentication → Users) con el mismo correo confirmado; se ocultan «Restablecer contraseña» y «Mi contraseña»; `/cuenta/clave` informa que la clave se administra en Supabase; las operaciones de clave en HubCircular responden `auth_external`. Si Supabase Auth no responde (red, 429, 5xx) se informa «no fue posible contactar el servicio» sin culpar a la clave.

**Bloqueo por intentos.** En modo `supabase` lo aplican los límites de tasa del proyecto Supabase, no la base local (cuya cuenta atrás de 5 fallos aplica solo al proveedor local). Hay que revisar esos límites en el panel.

### Cómo activarlo (usuario; **no** se ha hecho)

1. Antes de nada, `npm run db:backup` (ver `docs/24`) y aprobar las migraciones pendientes: `npm run db:migrate -- --dry-run` (deben listarse 0008 y 0009), luego `$env:CONFIRM_REMOTE_MIGRATION="<host>"; npm run db:migrate` y `npm run db:check`. **0008 cambia la firma de `auth_resolve_session`: aplique la migración y despliegue/reinicie el código nuevo juntos.**
2. En el panel de Supabase del proyecto de desarrollo: Authentication → Sign In / Providers → email habilitado, **desactivar «Allow new users to sign up»**, exigir confirmación de correo, y revisar los límites de tasa.
3. Crear en Authentication → Users **primero al administrador** con el mismo correo que su perfil de HubCircular (con «Auto Confirm User» o confirmando el correo). Sin esto, al cambiar de proveedor nadie podría entrar.
4. En `.env.local`: `AUTH_PROVIDER=supabase`, `SUPABASE_URL=https://<referencia>.supabase.co`, `SUPABASE_PUBLISHABLE_KEY=<clave publicable>`. Reiniciar. **No** pegue claves en el chat.
5. Probar el ingreso del administrador. Si algo falla, **volver a `AUTH_PROVIDER=local`** restaura el ingreso con las claves locales existentes (no se borran al cambiar de proveedor; a los usuarios creados en modo Supabase, un administrador les puede restablecer la clave en modo local).

## 4. Respaldos

Ver `docs/24-respaldos-y-restauracion.md`: `npm run db:backup` y `npm run db:restore-check`, probados con una restauración real en PostgreSQL 16 local (filas, migraciones, políticas, funciones, RLS y concesiones idénticas al origen). **No** se han ejecutado contra Supabase.

## 5. Antes de cargar datos reales (lista de control)

| # | Acción | Responsable | Estado |
|---|---|---|---|
| 1 | Aplicación de 0008 y 0009 en Supabase con `CONFIRM_REMOTE_MIGRATION` | Usuario | **Hecho** el 19-11-2026 (salida real en `docs/15`); no consta respaldo previo |
| 2 | Primera corrida real de `db:backup` y de `db:restore-check` en Windows | Usuario | **Hecho** el 19-11-2026 (`docs/15`): `db:backup` con pg_dump 18.2 (77 filas, 9 migraciones) y `db:restore-check` OK en un PostgreSQL 18 local (filas, migraciones, políticas y RLS idénticos). Falta probar la restauración en un servidor 17 |
| 3 | Confirmar en el panel de Supabase qué copias automáticas/PITR incluye el plan (`docs/24` §6) | Usuario | Pendiente |
| 4 | Decidir el proveedor de identidad (local o Supabase Auth) y, si es Supabase, completar la sección 3 | Usuario/equipo | Pendiente |
| 5 | Servir detrás de HTTPS con `SESSION_COOKIE_SECURE=true` y comprobar las cabeceras con `curl -I` | Usuario | Pendiente (sin despliegue) |
| 6 | Rol dedicado `hc_login` en lugar de `postgres` en `DATABASE_URL` (`docs/19`) | Usuario | Pendiente (aviso de `db:check:app`) |
| 7 | Cambiar las claves DEMO y no usar datos DEMO como reales; crear zonas, estaciones y materiales reales | Equipo | Pendiente |
| 8 | Decisiones H-01, H-05, H-07 con el Hub (`docs/11`, `docs/21`) | Equipo/Hub | Abiertas |
| 9 | Verificación nativa en Windows (`npm run verify`, `npm run test:e2e`) | Usuario | Pendiente |

## 6. Evidencia y límites

| Qué | Resultado (entorno Linux, PostgreSQL 16 local) |
|---|---|
| `tsc --noEmit`, `eslint .`, `next build` | Sin errores |
| Vitest | **288/288** en 24 archivos (unitarias, integración y de seguridad) |
| Playwright | **44/44**: 39 en modo local + 5 en modo Supabase contra GoTrue **simulado** |
| Mutaciones (prueba de que las pruebas detectan fallos) | Quitar el control del último administrador (6 fallos); aceptar correo sin confirmar, identidad distinta de Supabase o perfil inactivo (1 fallo cada una) |
| Respaldo y restauración | Restauración real en base vacía: 18 tablas, 43 filas, 8 migraciones, 17 políticas, 35 funciones y RLS idénticos; 7 salvaguardas negativas verificadas |

**No verificado:** Supabase Auth real (forma exacta de las respuestas, `email_confirmed_at`, límites de tasa, registro deshabilitado, correo de confirmación/SMTP); `/usuarios` y la clave temporal contra Supabase, cabeceras en producción, restauración del respaldo de Supabase en un servidor PostgreSQL 17; ejecución nativa en Windows; PostgreSQL 17 como servidor de la restauración. La validación manual de la Iteración 2 en Supabase (`docs/22`) fue informada por el usuario («está bien todo») sin detalle por paso.
