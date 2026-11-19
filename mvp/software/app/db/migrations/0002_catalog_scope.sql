-- 0002 · Catálogo (edificios, zonas, estaciones, materiales, contenedores) y funciones de ámbito
-- `data_origin` separa datos 'demo' de 'real' (ADR-007). Las ubicaciones de inventario son zonas (ADR-005).

create table hc.buildings (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  active      boolean not null default true,
  data_origin text not null default 'real' check (data_origin in ('real', 'demo')),
  created_at  timestamptz not null default now()
);

create table hc.zones (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references hc.buildings (id),
  parent_id   uuid null references hc.zones (id),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  active      boolean not null default true,
  data_origin text not null default 'real' check (data_origin in ('real', 'demo')),
  created_at  timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index zones_parent_idx on hc.zones (parent_id);

create table hc.stations (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid not null references hc.zones (id),
  code        text not null check (code = upper(btrim(code)) and char_length(code) between 2 and 64),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  active      boolean not null default true,
  data_origin text not null default 'real' check (data_origin in ('real', 'demo')),
  created_at  timestamptz not null default now()
);
create unique index stations_code_key on hc.stations (code);

create table hc.materials (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (code = upper(btrim(code)) and char_length(code) between 2 and 32),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  unit        text not null default 'g' check (unit = 'g'),
  active      boolean not null default true,
  data_origin text not null default 'real' check (data_origin in ('real', 'demo')),
  created_at  timestamptz not null default now()
);
create unique index materials_code_key on hc.materials (code);

create table hc.containers (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references hc.stations (id),
  material_id uuid not null references hc.materials (id),
  code        text not null check (code = upper(btrim(code)) and char_length(code) between 2 and 64),  -- el QR codifica este código; NO es una credencial
  tare_g      bigint null check (tare_g is null or (tare_g >= 0 and tare_g <= 1000000)),             -- tara nominal sugerida; el operador puede corregirla
  active      boolean not null default true,
  data_origin text not null default 'real' check (data_origin in ('real', 'demo')),
  created_at  timestamptz not null default now()
);
create unique index containers_code_key on hc.containers (code);
create index containers_station_idx on hc.containers (station_id);

alter table hc.user_roles
  add constraint user_roles_zone_fk foreign key (zone_id) references hc.zones (id);

-- ¿La zona p_zone es p_root o descendiente de p_root? (UNION deduplica y evita bucles ante datos corruptos)
create function hc.zone_within(p_zone uuid, p_root uuid) returns boolean
language sql stable security definer set search_path = hc, pg_temp as $$
  with recursive up as (
    select z.id, z.parent_id from hc.zones z where z.id = p_zone
    union
    select z.id, z.parent_id from hc.zones z join up on z.id = up.parent_id
  )
  select exists (select 1 from up where up.id = p_root)
$$;

-- ¿El usuario p_user, activo, tiene alguno de p_roles con ámbito que cubre p_zone?
create function hc.user_in_scope(p_user uuid, p_zone uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = hc, pg_temp as $$
  select p_user is not null and exists (
    select 1
    from hc.user_roles ur
    join hc.profiles p on p.id = ur.user_id
    where ur.user_id = p_user
      and p.active
      and ur.role = any (p_roles)
      and (ur.zone_id is null or hc.zone_within(p_zone, ur.zone_id))
  )
$$;

create function hc.actor_in_scope(p_zone uuid, p_roles text[] default array['administrador', 'operador', 'lector']) returns boolean
language sql stable security definer set search_path = hc, pg_temp as $$
  select hc.user_in_scope(hc.current_actor(), p_zone, p_roles)
$$;

create function hc.actor_has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = hc, pg_temp as $$
  select hc.current_actor() is not null and exists (
    select 1 from hc.user_roles ur join hc.profiles p on p.id = ur.user_id
    where ur.user_id = hc.current_actor() and p.active and ur.role = any (p_roles)
  )
$$;

create function hc.actor_is_active() returns boolean
language sql stable security definer set search_path = hc, pg_temp as $$
  select hc.current_actor() is not null
     and exists (select 1 from hc.profiles p where p.id = hc.current_actor() and p.active)
$$;

create function hc.station_zone(p_station uuid) returns uuid
language sql stable security definer set search_path = hc, pg_temp as $$
  select s.zone_id from hc.stations s where s.id = p_station
$$;
