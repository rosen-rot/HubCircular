-- 0003 · Pesajes, lotes y saldos por ubicación + función transaccional de registro
-- Reglas: gramos enteros; neto = bruto − tara calculado por la BD (columna generada); pesaje y lote nacen
-- en la misma transacción; pesajes y lotes son inmutables (correcciones: iteración 2, con referencia al original).

create table hc.weighings (
  id                     uuid primary key default gen_random_uuid(),
  ref_no                 bigint generated always as identity unique,   -- referencia legible: P-000123
  container_id           uuid not null references hc.containers (id),
  material_id            uuid not null references hc.materials (id),
  zone_id                uuid not null references hc.zones (id),       -- zona de origen al momento del pesaje (instantánea)
  gross_g                bigint not null,
  tare_g                 bigint not null,
  net_g                  bigint generated always as (gross_g - tare_g) stored,
  source                 text not null default 'manual' check (source in ('manual', 'iot_confirmed')),
  occurred_at            timestamptz not null,
  created_at             timestamptz not null default now(),
  created_by             uuid not null references hc.profiles (id),
  notes                  text null check (notes is null or char_length(notes) <= 500),
  contamination_observed boolean not null default false,
  idempotency_key        uuid not null,
  data_origin            text not null check (data_origin in ('real', 'demo')),
  constraint weighings_mass_valid check (gross_g > 0 and tare_g >= 0 and tare_g < gross_g and gross_g <= 1000000),
  constraint weighings_idempotency unique (created_by, idempotency_key)
);
create index weighings_zone_time_idx on hc.weighings (zone_id, occurred_at desc);
create index weighings_material_idx on hc.weighings (material_id);
create index weighings_container_idx on hc.weighings (container_id);
create index weighings_created_by_idx on hc.weighings (created_by);

create table hc.batches (
  id             uuid primary key default gen_random_uuid(),
  ref_no         bigint generated always as identity unique,           -- referencia legible: L-000123
  weighing_id    uuid not null unique references hc.weighings (id),    -- 1 pesaje → 1 lote (MVP)
  origin_zone_id uuid not null references hc.zones (id),
  material_id    uuid not null references hc.materials (id),
  initial_g      bigint not null check (initial_g > 0),
  created_at     timestamptz not null default now(),
  data_origin    text not null check (data_origin in ('real', 'demo'))
);

-- Saldo por lote y ubicación (ADR-004). Solo se modifica desde funciones transaccionales (iteración 2).
create table hc.batch_location_balances (
  batch_id   uuid not null references hc.batches (id),
  zone_id    uuid not null references hc.zones (id),
  balance_g  bigint not null check (balance_g >= 0),
  updated_at timestamptz not null default now(),
  primary key (batch_id, zone_id)
);

create trigger weighings_immutable before update or delete on hc.weighings
  for each row execute function hc.forbid_modification();
create trigger batches_immutable before update or delete on hc.batches
  for each row execute function hc.forbid_modification();

-- El lote debe coincidir exactamente con el neto de su pesaje (defensa ante inserciones directas erróneas).
create function hc.check_batch_matches_weighing() returns trigger
language plpgsql as $$
declare w hc.weighings%rowtype;
begin
  select * into w from hc.weighings where id = new.weighing_id;
  if w.id is null or w.net_g <> new.initial_g or w.material_id <> new.material_id
     or w.zone_id <> new.origin_zone_id or w.data_origin <> new.data_origin then
    raise exception using errcode = 'HC422', message = 'batch_weighing_mismatch',
      detail = 'El lote debe coincidir con el neto, material, zona y origen de datos de su pesaje.';
  end if;
  return new;
end $$;
create trigger batches_match_weighing before insert on hc.batches
  for each row execute function hc.check_batch_matches_weighing();

-- Comparación de carga útil para idempotencia (misma clave + mismos datos ⇒ reintento legítimo).
create function hc._same_weighing_payload(
  w hc.weighings, p_code text, p_gross bigint, p_tare bigint, p_notes text, p_contam boolean, p_occurred timestamptz
) returns boolean
language sql stable set search_path = hc, pg_temp as $$
  select (select c.code from hc.containers c where c.id = w.container_id) = p_code
     and w.gross_g = p_gross
     and w.tare_g = p_tare
     and w.notes is not distinct from p_notes
     and w.contamination_observed = p_contam
     and (p_occurred is null or w.occurred_at = p_occurred)
$$;

-- Registro atómico de un pesaje manual: valida, calcula, crea pesaje + lote + saldo inicial + auditoría.
create function hc.register_weighing(
  p_actor            uuid,
  p_container_code   text,
  p_gross_g          bigint,
  p_tare_g           bigint,
  p_occurred_at      timestamptz,
  p_notes            text,
  p_contamination    boolean,
  p_idempotency_key  uuid
) returns table (
  o_weighing_id uuid, o_batch_id uuid, o_net_g bigint, o_duplicate boolean,
  o_weighing_ref bigint, o_batch_ref bigint
)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_code     text := upper(btrim(coalesce(p_container_code, '')));
  v_notes    text := nullif(btrim(coalesce(p_notes, '')), '');
  v_contam   boolean := coalesce(p_contamination, false);
  v_now      timestamptz := now();
  v_occurred timestamptz;
  v_c        record;
  v_w        hc.weighings%rowtype;
  v_b        hc.batches%rowtype;
begin
  -- 1. Identidad y permiso (defensa en profundidad: el servidor también valida).
  if p_actor is null or hc.current_actor() is distinct from p_actor
     or not exists (select 1 from hc.profiles p where p.id = p_actor and p.active) then
    raise exception using errcode = 'HC401', message = 'unauthenticated';
  end if;
  if not hc.actor_has_role(array['administrador', 'operador']) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'HC422', message = 'idempotency_key_required';
  end if;
  if v_code = '' then
    raise exception using errcode = 'HC422', message = 'container_required';
  end if;

  -- 2. Reintento legítimo: devuelve el resultado original sin crear nada.
  select * into v_w from hc.weighings w where w.created_by = p_actor and w.idempotency_key = p_idempotency_key;
  if v_w.id is not null then
    if not hc._same_weighing_payload(v_w, v_code, p_gross_g, p_tare_g, v_notes, v_contam, p_occurred_at) then
      raise exception using errcode = 'HC409', message = 'idempotency_conflict';
    end if;
    select * into v_b from hc.batches b where b.weighing_id = v_w.id;
    return query select v_w.id, v_b.id, v_w.net_g, true, v_w.ref_no, v_b.ref_no;
    return;
  end if;

  -- 3. Contenedor, estado y ámbito.
  select c.id as container_id, c.material_id, c.data_origin, c.active as c_active,
         s.active as s_active, s.zone_id, z.active as z_active, m.active as m_active
    into v_c
    from hc.containers c
    join hc.stations s on s.id = c.station_id
    join hc.zones z on z.id = s.zone_id
    join hc.materials m on m.id = c.material_id
   where c.code = v_code;
  if v_c.container_id is null then
    raise exception using errcode = 'HC404', message = 'container_not_found';
  end if;
  if not hc.user_in_scope(p_actor, v_c.zone_id, array['administrador', 'operador']) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
  if not (v_c.c_active and v_c.s_active and v_c.z_active) then
    raise exception using errcode = 'HC422', message = 'container_inactive';
  end if;
  if not v_c.m_active then
    raise exception using errcode = 'HC422', message = 'material_inactive';
  end if;

  -- 4. Validación de masas (gramos enteros).
  if p_gross_g is null or p_tare_g is null or p_gross_g <= 0 or p_tare_g < 0 then
    raise exception using errcode = 'HC422', message = 'invalid_mass';
  end if;
  if p_tare_g >= p_gross_g then
    raise exception using errcode = 'HC422', message = 'tare_not_less_than_gross';
  end if;
  if p_gross_g > 1000000 then
    raise exception using errcode = 'HC422', message = 'mass_too_large';
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception using errcode = 'HC422', message = 'notes_too_long';
  end if;
  v_occurred := coalesce(p_occurred_at, v_now);
  if v_occurred > v_now + interval '5 minutes' then
    raise exception using errcode = 'HC422', message = 'occurred_in_future';
  end if;

  -- 5. Inserción atómica; ON CONFLICT cubre la carrera de dos envíos simultáneos con la misma clave.
  insert into hc.weighings (container_id, material_id, zone_id, gross_g, tare_g, source, occurred_at,
                            created_by, notes, contamination_observed, idempotency_key, data_origin)
  values (v_c.container_id, v_c.material_id, v_c.zone_id, p_gross_g, p_tare_g, 'manual', v_occurred,
          p_actor, v_notes, v_contam, p_idempotency_key, v_c.data_origin)
  on conflict (created_by, idempotency_key) do nothing
  returning * into v_w;

  if v_w.id is null then
    select * into v_w from hc.weighings w where w.created_by = p_actor and w.idempotency_key = p_idempotency_key;
    if not hc._same_weighing_payload(v_w, v_code, p_gross_g, p_tare_g, v_notes, v_contam, p_occurred_at) then
      raise exception using errcode = 'HC409', message = 'idempotency_conflict';
    end if;
    select * into v_b from hc.batches b where b.weighing_id = v_w.id;
    return query select v_w.id, v_b.id, v_w.net_g, true, v_w.ref_no, v_b.ref_no;
    return;
  end if;

  insert into hc.batches (weighing_id, origin_zone_id, material_id, initial_g, data_origin)
  values (v_w.id, v_w.zone_id, v_w.material_id, v_w.net_g, v_w.data_origin)
  returning * into v_b;

  insert into hc.batch_location_balances (batch_id, zone_id, balance_g)
  values (v_b.id, v_w.zone_id, v_w.net_g);

  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'weighing', v_w.id::text, 'create', jsonb_build_object(
    'weighingRef', v_w.ref_no, 'batchRef', v_b.ref_no, 'containerCode', v_code,
    'grossG', v_w.gross_g, 'tareG', v_w.tare_g, 'netG', v_w.net_g,
    'source', v_w.source, 'dataOrigin', v_w.data_origin));

  return query select v_w.id, v_b.id, v_w.net_g, false, v_w.ref_no, v_b.ref_no;
end $$;
