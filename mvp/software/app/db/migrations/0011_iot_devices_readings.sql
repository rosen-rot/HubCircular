-- 0011 · IoT: dispositivos (ESP32 / simulador) y lecturas de sensor — Iteración 4, contrato docs/04 v1
-- Reglas (docs/04 «Reglas de negocio de enlace»):
--   · Una lectura es TELEMETRÍA: nunca crea pesajes, lotes ni movimientos. La captación solo cambia cuando un
--     operador confirma un pesaje (el formulario puede precargar el peso bruto desde la última lectura).
--   · Cada dispositivo tiene un token propio; la BD guarda solo su hash SHA-256 (como las sesiones).
--     El contenedor y el tipo (sensor/simulador) salen del registro del dispositivo, nunca del mensaje.
--   · Las lecturas son inmutables y únicas por (dispositivo, messageId): un reintento no duplica.
--   · El rol de la aplicación no puede leer los hashes de token ni escribir directamente: solo vía
--     hc.iot_ingest_reading (SECURITY DEFINER). El alta/rotación de dispositivos la hace el dueño del
--     esquema con `npm run iot:device` (docs/27).

create table hc.devices (
  id           uuid primary key default gen_random_uuid(),
  code         text not null check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),
  container_id uuid not null references hc.containers (id),
  kind         text not null check (kind in ('sensor', 'simulator')),
  token_hash   text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  active       boolean not null default true,
  notes        text null check (notes is null or char_length(notes) <= 200),
  created_at   timestamptz not null default now(),
  token_set_at timestamptz not null default now(),
  last_seen_at timestamptz null
);
create unique index devices_code_key on hc.devices (code);
create unique index devices_token_hash_key on hc.devices (token_hash);
create index devices_container_idx on hc.devices (container_id);

create table hc.sensor_readings (
  id               uuid primary key default gen_random_uuid(),
  device_id        uuid not null references hc.devices (id),
  container_id     uuid not null references hc.containers (id),   -- instantánea del contenedor al recibir
  simulated        boolean not null,                               -- instantánea de devices.kind = 'simulator'
  message_id       uuid not null,
  measured_at      timestamptz null,                               -- reloj del dispositivo (null si no es plausible)
  received_at      timestamptz not null default now(),             -- reloj del servidor: el que se usa para auditar
  weight_g         integer null check (weight_g is null or weight_g between 0 and 1000000),
  distance_mm      integer null check (distance_mm is null or distance_mm between 0 and 10000),
  fill_percent     numeric(4, 1) null check (fill_percent is null or fill_percent between 0 and 100),
  quality          text not null check (quality in ('stable', 'unstable', 'uncalibrated', 'sensor_error')),
  rssi_dbm         smallint null check (rssi_dbm is null or rssi_dbm between -127 and 0),
  firmware_version text null check (firmware_version is null or char_length(firmware_version) <= 32),
  payload_hash     text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint sensor_readings_message_unique unique (device_id, message_id)
);
create index sensor_readings_device_time_idx on hc.sensor_readings (device_id, received_at desc);
create index sensor_readings_container_time_idx on hc.sensor_readings (container_id, received_at desc);

create trigger sensor_readings_immutable before update or delete on hc.sensor_readings
  for each row execute function hc.forbid_modification();

comment on table hc.devices is 'Dispositivos IoT (ESP32 real o simulador). token_hash = SHA-256 del token Bearer; no legible por hc_app.';
comment on table hc.sensor_readings is 'Telemetría cruda e inmutable. NO es captación: no crea pesajes, lotes ni movimientos.';

-- ---------------------------------------------------------------------------------------------------
-- Ingesta: autentica por hash de token, valida coherencia y es idempotente por (dispositivo, messageId).
-- Errores (SQLSTATE HCxxx, traducidos por mapDbError):
--   device_unauthenticated (401) · device_inactive / device_mismatch (403) · reading_conflict (409) · rate_limited (429)
-- ---------------------------------------------------------------------------------------------------
create function hc.iot_ingest_reading(
  p_token_hash   text,
  p_device_code  text,
  p_message_id   uuid,
  p_measured_at  timestamptz,
  p_weight_g     integer,
  p_distance_mm  integer,
  p_fill_percent numeric,
  p_quality      text,
  p_rssi_dbm     integer,
  p_firmware     text,
  p_payload_hash text
) returns table (o_reading_id uuid, o_duplicate boolean, o_received_at timestamptz, o_simulated boolean)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_d        hc.devices%rowtype;
  v_r        hc.sensor_readings%rowtype;
  v_now      timestamptz := now();
  v_measured timestamptz := p_measured_at;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'HC401', message = 'device_unauthenticated';
  end if;
  select * into v_d from hc.devices d where d.token_hash = p_token_hash for update;
  if v_d.id is null then
    raise exception using errcode = 'HC401', message = 'device_unauthenticated';
  end if;
  -- El token pertenece a OTRO dispositivo que el declarado en el mensaje: no se acepta.
  if v_d.code is distinct from upper(btrim(coalesce(p_device_code, ''))) then
    raise exception using errcode = 'HC403', message = 'device_mismatch';
  end if;
  if not v_d.active then
    raise exception using errcode = 'HC403', message = 'device_inactive';
  end if;
  if p_message_id is null or p_quality is null or p_payload_hash is null then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;

  -- Reintento: mismo contenido → éxito sin insertar; contenido distinto → conflicto explícito.
  select * into v_r from hc.sensor_readings r where r.device_id = v_d.id and r.message_id = p_message_id;
  if v_r.id is not null then
    if v_r.payload_hash <> p_payload_hash then
      raise exception using errcode = 'HC409', message = 'reading_conflict';
    end if;
    return query select v_r.id, true, v_r.received_at, v_r.simulated;
    return;
  end if;

  -- Cuota simple por dispositivo (el firmware envía como máximo ~1 lectura cada 2 s más un latido de 30 s).
  if (select count(*) from hc.sensor_readings r
       where r.device_id = v_d.id and r.received_at > v_now - interval '1 minute') >= 60 then
    raise exception using errcode = 'HC429', message = 'rate_limited';
  end if;

  -- Reloj del dispositivo: se conserva solo si es plausible; el servidor siempre registra received_at.
  if v_measured is not null and (v_measured > v_now + interval '5 minutes' or v_measured < v_now - interval '7 days') then
    v_measured := null;
  end if;

  insert into hc.sensor_readings (device_id, container_id, simulated, message_id, measured_at, received_at,
                                  weight_g, distance_mm, fill_percent, quality, rssi_dbm, firmware_version, payload_hash)
  values (v_d.id, v_d.container_id, v_d.kind = 'simulator', p_message_id, v_measured, v_now,
          p_weight_g, p_distance_mm, p_fill_percent, p_quality, p_rssi_dbm, nullif(btrim(p_firmware), ''), p_payload_hash)
  returning * into v_r;

  update hc.devices set last_seen_at = v_now where id = v_d.id;
  return query select v_r.id, false, v_r.received_at, v_r.simulated;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- RLS y privilegios (misma convención que 0005/0010: deny-by-default, lectura según contenedor visible).
-- ---------------------------------------------------------------------------------------------------
alter table hc.devices         enable row level security;
alter table hc.sensor_readings enable row level security;

revoke all on hc.devices, hc.sensor_readings from public, anon, authenticated;
-- Sin token_hash: el rol de la aplicación no puede leer los hashes.
grant select (id, code, container_id, kind, active, notes, created_at, token_set_at, last_seen_at) on hc.devices to hc_app;
grant select on hc.sensor_readings to hc_app;

create policy devices_read on hc.devices for select to hc_app
  using (exists (select 1 from hc.containers c where c.id = container_id));
create policy sensor_readings_read on hc.sensor_readings for select to hc_app
  using (exists (select 1 from hc.containers c where c.id = container_id));

revoke execute on function
  hc.iot_ingest_reading(text, text, uuid, timestamptz, integer, integer, numeric, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function
  hc.iot_ingest_reading(text, text, uuid, timestamptz, integer, integer, numeric, text, integer, text, text)
  to hc_app;
