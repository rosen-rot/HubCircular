-- 0011 · Ingesta de telemetría IoT (Iteración 4) — contrato docs/04 v1
-- Reglas de diseño:
--   · La telemetría (peso/distancia/llenado del sensor) es un DATO DE SENSOR. NUNCA crea pesajes, lotes ni movimientos:
--     ninguna función de esta migración toca hc.weighings, hc.batches ni hc.movements.
--   · Cada dispositivo tiene un token propio, aleatorio y de alta entropía. La BD solo guarda su hash SHA-256
--     (calculado en la aplicación) y un prefijo no secreto para reconocerlo en pantalla. El token se muestra una sola vez.
--   · La autorización sale del registro del servidor (token → dispositivo), no del deviceId del JSON: si no coinciden, se rechaza.
--   · Las lecturas son de solo anexado. Idempotencia por (dispositivo, messageId): mismo contenido → duplicado sin segunda
--     inserción; contenido distinto → conflicto.
--   · data_origin del dispositivo = el del contenedor. Las lecturas de un simulador (firmware «sim-…») solo se aceptan
--     en dispositivos DEMO, para que lo simulado no se mezcle con datos reales.

-- ---------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------
create table hc.devices (
  id                  uuid primary key default gen_random_uuid(),
  device_code         text not null check (device_code ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),   -- p. ej. HUB-ESP32-001; NO es una credencial
  name                text not null check (char_length(name) between 1 and 120),
  container_id        uuid not null references hc.containers (id),
  token_hash          text not null check (token_hash ~ '^[0-9a-f]{64}$'),                   -- SHA-256 del token; el token nunca se guarda
  token_prefix        text not null check (char_length(token_prefix) between 4 and 12),      -- parte NO secreta, solo para identificarlo
  stale_after_minutes integer not null default 15 check (stale_after_minutes between 1 and 1440),
  data_origin         text not null check (data_origin in ('real', 'demo')),
  last_seen_at        timestamptz null,                                                       -- último mensaje ACEPTADO (incluye duplicados)
  last_reading_id     uuid null,
  revoked_at          timestamptz null,
  revoked_by          uuid null references hc.profiles (id),
  token_rotated_at    timestamptz null,
  created_by          uuid not null references hc.profiles (id),
  created_at          timestamptz not null default now()
);
create unique index devices_code_key on hc.devices (device_code);
create unique index devices_token_hash_key on hc.devices (token_hash);
create index devices_container_idx on hc.devices (container_id);

create table hc.sensor_readings (
  id               uuid primary key default gen_random_uuid(),
  device_id        uuid not null references hc.devices (id),
  container_id     uuid not null references hc.containers (id),   -- copiado del dispositivo al recibir: el historial no cambia si luego se reasigna
  message_id       uuid not null,
  schema_version   smallint not null check (schema_version = 1),
  measured_at      timestamptz not null,                          -- fecha informada por el dispositivo (puede ser poco fiable)
  received_at      timestamptz not null default now(),            -- fecha del servidor (siempre se asigna aquí)
  clock_ok         boolean not null,                              -- false = measured_at imposible (futuro/muy antiguo): se usa received_at
  effective_at     timestamptz not null,                          -- measured_at si clock_ok, si no received_at
  weight_g         bigint null check (weight_g is null or (weight_g >= 0 and weight_g <= 1000000)),
  distance_mm      integer null check (distance_mm is null or (distance_mm >= 0 and distance_mm <= 10000)),
  fill_percent     numeric(5, 2) null check (fill_percent is null or (fill_percent >= 0 and fill_percent <= 100)),
  quality          text not null check (quality in ('stable', 'unstable', 'uncalibrated', 'sensor_error')),
  firmware_version text null check (firmware_version is null or char_length(firmware_version) between 1 and 32),
  data_origin      text not null check (data_origin in ('real', 'demo')),
  -- Sin dato válido no se inventa un cero: sensor_error no lleva valores; sin calibrar no hay peso.
  constraint readings_sensor_error_nulls check (quality <> 'sensor_error' or (weight_g is null and distance_mm is null and fill_percent is null)),
  constraint readings_uncalibrated_no_weight check (quality <> 'uncalibrated' or weight_g is null),
  constraint readings_idempotency unique (device_id, message_id)
);
create index sensor_readings_container_idx on hc.sensor_readings (container_id, effective_at desc);
create index sensor_readings_device_idx on hc.sensor_readings (device_id, received_at desc);

alter table hc.devices add constraint devices_last_reading_fk foreign key (last_reading_id) references hc.sensor_readings (id);

-- Las lecturas no se modifican ni se borran; los dispositivos no se borran (se revocan).
create trigger sensor_readings_no_update_delete before update or delete on hc.sensor_readings
  for each row execute function hc.forbid_modification();
create trigger sensor_readings_no_truncate before truncate on hc.sensor_readings
  for each statement execute function hc.forbid_modification();
create trigger devices_no_delete before delete on hc.devices
  for each row execute function hc.forbid_modification();
create trigger devices_no_truncate before truncate on hc.devices
  for each statement execute function hc.forbid_modification();

-- ---------------------------------------------------------------------------------------------------
-- Administración de dispositivos (solo administrador). La aplicación genera el token y entrega solo su hash.
-- ---------------------------------------------------------------------------------------------------
create function hc.admin_create_device(
  p_actor uuid, p_code text, p_name text, p_container_id uuid, p_token_hash text, p_token_prefix text, p_stale_minutes integer
) returns table (o_device_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_name   text := btrim(coalesce(p_name, ''));
  v_stale  integer := coalesce(p_stale_minutes, 15);
  v_c      hc.containers%rowtype;
  v_id     uuid;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,63}$' or char_length(v_name) not between 1 and 120
     or v_stale not between 1 and 1440
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_token_prefix is null or char_length(p_token_prefix) not between 4 and 12 then
    raise exception using errcode = 'HC422', message = 'device_invalid';
  end if;
  select * into v_c from hc.containers c where c.id = p_container_id;
  if v_c.id is null then
    raise exception using errcode = 'HC404', message = 'container_not_found';
  end if;
  if not v_c.active then
    raise exception using errcode = 'HC422', message = 'container_inactive';
  end if;
  begin
    insert into hc.devices (device_code, name, container_id, token_hash, token_prefix, stale_after_minutes, data_origin, created_by)
    values (v_code, v_name, v_c.id, p_token_hash, p_token_prefix, v_stale, v_c.data_origin, p_actor)
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'HC409', message = 'device_exists';
  end;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'device', v_id::text, 'create',
          jsonb_build_object('deviceCode', v_code, 'containerId', v_c.id, 'dataOrigin', v_c.data_origin, 'staleAfterMinutes', v_stale));
  return query select v_id;
end $$;

-- Rotar el token: el anterior deja de servir de inmediato. Si el dispositivo estaba revocado, queda reactivado.
create function hc.admin_rotate_device_token(p_actor uuid, p_device_id uuid, p_token_hash text, p_token_prefix text)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v hc.devices%rowtype;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_token_prefix is null or char_length(p_token_prefix) not between 4 and 12 then
    raise exception using errcode = 'HC422', message = 'device_invalid';
  end if;
  select * into v from hc.devices d where d.id = p_device_id for update;
  if v.id is null then
    raise exception using errcode = 'HC404', message = 'device_not_found';
  end if;
  begin
    update hc.devices
       set token_hash = p_token_hash, token_prefix = p_token_prefix, token_rotated_at = now(),
           revoked_at = null, revoked_by = null
     where id = v.id;
  exception when unique_violation then
    raise exception using errcode = 'HC422', message = 'device_invalid';
  end;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, old_summary)
  values (p_actor, 'device', v.id::text, 'rotate_token', jsonb_build_object('wasRevoked', v.revoked_at is not null));
end $$;

create function hc.admin_revoke_device(p_actor uuid, p_device_id uuid)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v hc.devices%rowtype;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  select * into v from hc.devices d where d.id = p_device_id for update;
  if v.id is null then
    raise exception using errcode = 'HC404', message = 'device_not_found';
  end if;
  if v.revoked_at is not null then
    return;
  end if;
  update hc.devices set revoked_at = now(), revoked_by = p_actor where id = v.id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action)
  values (p_actor, 'device', v.id::text, 'revoke');
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Ingesta (sin actor humano: autentica el token del dispositivo). Solo inserta en hc.sensor_readings y actualiza
-- el último contacto del dispositivo. Los rechazos no se guardan (no hay escritura que un atacante pueda forzar).
-- ---------------------------------------------------------------------------------------------------
create function hc._same_reading_payload(
  r hc.sensor_readings, p_schema integer, p_measured timestamptz, p_weight bigint, p_distance integer, p_fill numeric,
  p_quality text, p_firmware text
) returns boolean
language sql stable set search_path = hc, pg_temp as $$
  select r.schema_version = p_schema
     and r.measured_at = p_measured
     and r.weight_g is not distinct from p_weight
     and r.distance_mm is not distinct from p_distance
     and r.fill_percent is not distinct from p_fill
     and r.quality = p_quality
     and r.firmware_version is not distinct from p_firmware
$$;

create function hc.iot_ingest_reading(
  p_token_hash text, p_device_code text, p_message_id uuid, p_schema_version integer, p_measured_at timestamptz,
  p_weight_g bigint, p_distance_mm integer, p_fill_percent numeric, p_quality text, p_firmware text
) returns table (o_reading_id uuid, o_duplicate boolean)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_dev    hc.devices%rowtype;
  v_old    hc.sensor_readings%rowtype;
  v_fill   numeric := round(p_fill_percent, 2);
  v_clock  boolean;
  v_eff    timestamptz;
  v_id     uuid;
  v_recent integer;
begin
  -- 1) Autenticación: el token (por su hash) identifica al dispositivo. Se bloquea la fila para serializar sus mensajes.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'HC401', message = 'device_token_invalid';
  end if;
  select * into v_dev from hc.devices d where d.token_hash = p_token_hash for update;
  if v_dev.id is null then
    raise exception using errcode = 'HC401', message = 'device_token_invalid';
  end if;
  if v_dev.revoked_at is not null then
    raise exception using errcode = 'HC403', message = 'device_revoked';
  end if;
  -- 2) Autorización: el deviceId del mensaje debe ser el del dispositivo dueño del token.
  if p_device_code is distinct from v_dev.device_code then
    raise exception using errcode = 'HC403', message = 'device_mismatch';
  end if;
  -- 3) Validación (respaldo de la validación de la API).
  if p_message_id is null or p_schema_version is distinct from 1 or p_measured_at is null
     or p_quality is null or p_quality not in ('stable', 'unstable', 'uncalibrated', 'sensor_error')
     or (p_weight_g is not null and (p_weight_g < 0 or p_weight_g > 1000000))
     or (p_distance_mm is not null and (p_distance_mm < 0 or p_distance_mm > 10000))
     or (v_fill is not null and (v_fill < 0 or v_fill > 100))
     or (p_firmware is not null and char_length(p_firmware) not between 1 and 32)
     or (p_quality = 'sensor_error' and (p_weight_g is not null or p_distance_mm is not null or v_fill is not null))
     or (p_quality = 'uncalibrated' and p_weight_g is not null) then
    raise exception using errcode = 'HC422', message = 'reading_invalid';
  end if;
  -- 4) Lo simulado solo entra en dispositivos DEMO.
  if p_firmware like 'sim-%' and v_dev.data_origin <> 'demo' then
    raise exception using errcode = 'HC403', message = 'simulation_not_allowed';
  end if;
  -- 5) Idempotencia: misma clave con mismo contenido = duplicado; con contenido distinto = conflicto.
  select * into v_old from hc.sensor_readings r where r.device_id = v_dev.id and r.message_id = p_message_id;
  if v_old.id is not null then
    if not hc._same_reading_payload(v_old, p_schema_version, p_measured_at, p_weight_g, p_distance_mm, v_fill, p_quality, p_firmware) then
      raise exception using errcode = 'HC409', message = 'message_conflict';
    end if;
    update hc.devices set last_seen_at = now() where id = v_dev.id;
    return query select v_old.id, true;
    return;
  end if;
  -- 6) Frecuencia: máximo 60 lecturas nuevas por minuto por dispositivo.
  select count(*) into v_recent from hc.sensor_readings r
   where r.device_id = v_dev.id and r.received_at > now() - interval '1 minute';
  if v_recent >= 60 then
    raise exception using errcode = 'HC429', message = 'rate_limited';
  end if;
  -- 7) Reloj del dispositivo: si es imposible (más de 5 min en el futuro o más de 7 días atrás) se conserva lo informado,
  --    se marca clock_ok = false y el momento efectivo pasa a ser la hora del servidor.
  v_clock := p_measured_at <= now() + interval '5 minutes' and p_measured_at >= now() - interval '7 days';
  v_eff := case when v_clock then p_measured_at else now() end;

  insert into hc.sensor_readings (device_id, container_id, message_id, schema_version, measured_at, clock_ok, effective_at,
                                  weight_g, distance_mm, fill_percent, quality, firmware_version, data_origin)
  values (v_dev.id, v_dev.container_id, p_message_id, p_schema_version, p_measured_at, v_clock, v_eff,
          p_weight_g, p_distance_mm, v_fill, p_quality, p_firmware, v_dev.data_origin)
  returning id into v_id;
  update hc.devices set last_seen_at = now(), last_reading_id = v_id where id = v_dev.id;
  return query select v_id, false;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- RLS y privilegios (mismo modelo que 0005/0007/0010)
-- ---------------------------------------------------------------------------------------------------
alter table hc.devices         enable row level security;
alter table hc.sensor_readings enable row level security;

revoke all on hc.devices, hc.sensor_readings from public, anon, authenticated;
-- El hash del token NO es legible por el rol de aplicación: acceso por columnas.
grant select (id, device_code, name, container_id, token_prefix, stale_after_minutes, data_origin, last_seen_at,
              last_reading_id, revoked_at, revoked_by, token_rotated_at, created_by, created_at)
  on hc.devices to hc_app;
grant select on hc.sensor_readings to hc_app;

-- Visibles si el contenedor lo es (la RLS de hc.containers aplica dentro de la subconsulta).
create policy devices_read on hc.devices for select to hc_app
  using (exists (select 1 from hc.containers c where c.id = container_id));
create policy sensor_readings_read on hc.sensor_readings for select to hc_app
  using (exists (select 1 from hc.containers c where c.id = container_id));

revoke execute on function
  hc.admin_create_device(uuid, text, text, uuid, text, text, integer),
  hc.admin_rotate_device_token(uuid, uuid, text, text),
  hc.admin_revoke_device(uuid, uuid),
  hc._same_reading_payload(hc.sensor_readings, integer, timestamptz, bigint, integer, numeric, text, text),
  hc.iot_ingest_reading(text, text, uuid, integer, timestamptz, bigint, integer, numeric, text, text)
  from public, anon, authenticated;

grant execute on function
  hc.admin_create_device(uuid, text, text, uuid, text, text, integer),
  hc.admin_rotate_device_token(uuid, uuid, text, text),
  hc.admin_revoke_device(uuid, uuid),
  hc._same_reading_payload(hc.sensor_readings, integer, timestamptz, bigint, integer, numeric, text, text),
  hc.iot_ingest_reading(text, text, uuid, integer, timestamptz, bigint, integer, numeric, text, text)
  to hc_app;

comment on table hc.devices is 'Dispositivos IoT registrados. El token solo existe como hash SHA-256.';
comment on table hc.sensor_readings is 'Telemetría de sensores (solo anexado). NO es captación: no crea pesajes ni movimientos.';
