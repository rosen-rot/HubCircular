-- 0001 · Identidad, sesiones locales y auditoría
-- Esquema privado `hc`: NO se expone por la API de datos de Supabase (que solo publica `public`).
-- Nada aquí contiene datos de demostración (ver db/seed).

create schema if not exists hc;

-- Roles de plataforma. En Supabase `anon` y `authenticated` ya existen; en un PostgreSQL local se crean sin privilegios.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  -- Rol de la aplicación (servidor Next.js): privilegios mínimos, sin escritura directa en tablas de negocio.
  if not exists (select 1 from pg_roles where rolname = 'hc_app') then create role hc_app nologin; end if;
end $$;

-- Permite al dueño de la migración usar SET ROLE hc_app (en PG16 el creador no queda como miembro automáticamente).
do $$
begin
  begin
    execute format('grant hc_app to %I', current_user);
  exception when others then
    raise notice 'No se pudo otorgar hc_app a %: %', current_user, sqlerrm;
  end;
end $$;

revoke all on schema hc from public;
grant usage on schema hc to hc_app;

-- Códigos de error de negocio (SQLSTATE personalizados; el mensaje es un código legible por máquina):
--   HC401 no autenticado/inactivo · HC403 sin permiso · HC404 no encontrado
--   HC409 conflicto (idempotencia) · HC422 validación · HC423 registro inmutable

create table hc.profiles (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index profiles_email_key on hc.profiles (email);

create table hc.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references hc.profiles (id) on delete restrict,
  role       text not null check (role in ('administrador', 'operador', 'lector')),
  zone_id    uuid null,   -- NULL = todas las zonas; la FK a hc.zones se agrega en 0002
  created_at timestamptz not null default now()
);
create unique index user_roles_unique on hc.user_roles (user_id, role, coalesce(zone_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_roles_user_idx on hc.user_roles (user_id);

-- Proveedor de autenticación LOCAL (ADR-002). Se reemplazará/desactivará al integrar Supabase Auth.
create table hc.local_credentials (
  user_id         uuid primary key references hc.profiles (id) on delete cascade,
  password_hash   text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz null,
  updated_at      timestamptz not null default now()
);

create table hc.local_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references hc.profiles (id) on delete cascade,
  token_hash   text not null unique,       -- SHA-256 del token; el token en claro solo vive en la cookie
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index local_sessions_user_idx on hc.local_sessions (user_id);
create index local_sessions_expiry_idx on hc.local_sessions (expires_at);

-- Auditoría append-only. Nunca almacenar secretos ni contraseñas en old/new_summary.
create table hc.audit_logs (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid null references hc.profiles (id),
  entity      text not null,
  entity_id   text null,
  action      text not null,
  old_summary jsonb null,
  new_summary jsonb null
);
create index audit_logs_entity_idx on hc.audit_logs (entity, entity_id);
create index audit_logs_time_idx on hc.audit_logs (occurred_at desc);

create function hc.forbid_modification() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = 'HC423', message = 'immutable_record',
    detail = format('La tabla %s es de solo anexado; no admite %s.', tg_table_name, tg_op);
end $$;

create trigger audit_logs_no_update_delete before update or delete on hc.audit_logs
  for each row execute function hc.forbid_modification();
create trigger audit_logs_no_truncate before truncate on hc.audit_logs
  for each statement execute function hc.forbid_modification();

-- Actor de la transacción actual (lo fija el servidor con set_config('hc.actor_id', ..., true)).
create function hc.current_actor() returns uuid
language sql stable as $$
  select nullif(current_setting('hc.actor_id', true), '')::uuid
$$;
