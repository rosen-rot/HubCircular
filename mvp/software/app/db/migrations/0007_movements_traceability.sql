-- 0007 · Trazabilidad (Iteración 2): movimientos, destinos, evidencia de respaldo, verificación y correcciones
-- Decisiones: ADR-005 (ubicación = zona, provisional · H-01), ADR-004 (saldo por lote y ubicación),
--             ADR-019 (movimientos), ADR-020 (evidencia como referencia de texto y verificación sin segunda salida · H-05).
-- Reglas: masas en gramos enteros; todo saldo >= 0; el neto captado NUNCA cambia por un traslado;
--         las tablas de esta migración son de solo anexado (excepto destinos, que se activan/desactivan);
--         la escritura se hace solo con funciones SECURITY DEFINER; un lote se bloquea (FOR UPDATE) durante cada movimiento.

-- ---------------------------------------------------------------------------------------------------
-- Destinos (gestor, reutilización, otro). `data_origin` impide usar un destino DEMO con un lote real y viceversa.
-- ---------------------------------------------------------------------------------------------------
create table hc.destinations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  type        text not null check (type in ('gestor', 'reutilizacion', 'otro')),
  active      boolean not null default true,
  data_origin text not null default 'real' check (data_origin in ('real', 'demo')),
  created_at  timestamptz not null default now(),
  created_by  uuid null references hc.profiles (id)
);
create unique index destinations_name_key on hc.destinations (lower(btrim(name)), data_origin);

-- ---------------------------------------------------------------------------------------------------
-- Movimientos. Cada fila describe el efecto sobre saldos: resta `quantity_g` en from_location_id (si existe)
-- y suma en to_location_id (si existe). Una corrección es otro movimiento con efecto inverso al original.
-- ---------------------------------------------------------------------------------------------------
create table hc.movements (
  id                   uuid primary key default gen_random_uuid(),
  ref_no               bigint generated always as identity unique,                -- referencia legible: M-000123
  batch_id             uuid not null references hc.batches (id),
  type                 text not null check (type in ('traslado', 'despacho', 'reutilizacion', 'rechazo', 'ajuste', 'correccion')),
  quantity_g           bigint not null check (quantity_g between 1 and 1000000),
  from_location_id     uuid null references hc.zones (id),                        -- ADR-005: la ubicación es una zona
  to_location_id       uuid null references hc.zones (id),
  destination_id       uuid null references hc.destinations (id),
  occurred_at          timestamptz not null,
  created_at           timestamptz not null default now(),
  created_by           uuid not null references hc.profiles (id),
  reason               text null check (reason is null or char_length(reason) between 1 and 500),
  corrects_movement_id uuid null references hc.movements (id),
  idempotency_key      uuid not null,
  data_origin          text not null check (data_origin in ('real', 'demo')),
  constraint movements_idempotency unique (created_by, idempotency_key),
  constraint movements_correction_ref check ((type = 'correccion') = (corrects_movement_id is not null)),
  constraint movements_shape check (
       (type = 'traslado' and from_location_id is not null and to_location_id is not null
          and from_location_id <> to_location_id and destination_id is null)
    or (type in ('despacho', 'reutilizacion') and from_location_id is not null and to_location_id is null
          and destination_id is not null)
    or (type = 'rechazo' and from_location_id is not null and to_location_id is null
          and destination_id is null and reason is not null)
    or (type = 'ajuste' and ((from_location_id is null) <> (to_location_id is null))
          and destination_id is null and reason is not null)
    or (type = 'correccion' and (from_location_id is not null or to_location_id is not null)
          and destination_id is null and reason is not null)
  )
);
create index movements_batch_idx on hc.movements (batch_id, occurred_at desc);
create index movements_from_idx on hc.movements (from_location_id);
create index movements_to_idx on hc.movements (to_location_id);
create unique index movements_one_correction on hc.movements (corrects_movement_id) where corrects_movement_id is not null;

-- Respaldo documental de un despacho o reutilización: REFERENCIA de texto (sin archivos en esta iteración).
create table hc.movement_evidence (
  id          uuid primary key default gen_random_uuid(),
  movement_id uuid not null references hc.movements (id),
  kind        text not null check (kind in ('guia_despacho', 'certificado', 'correo', 'foto', 'otro')),
  reference   text not null check (char_length(btrim(reference)) between 1 and 200),
  note        text null check (note is null or char_length(note) <= 500),
  created_by  uuid not null references hc.profiles (id),
  created_at  timestamptz not null default now(),
  constraint movement_evidence_unique unique (movement_id, kind, reference)
);
create index movement_evidence_movement_idx on hc.movement_evidence (movement_id);

-- Verificación de valorización (H-05): decisión posterior sobre un despacho. NO es un movimiento y no toca saldos.
-- Sin filas = «pendiente de verificación». La vigente es la última; el historial se conserva.
create table hc.movement_verifications (
  id          uuid primary key default gen_random_uuid(),
  movement_id uuid not null references hc.movements (id),
  status      text not null check (status in ('confirmada', 'rechazada')),
  notes       text null check (notes is null or char_length(notes) <= 500),
  decided_by  uuid not null references hc.profiles (id),
  decided_at  timestamptz not null default now(),
  constraint movement_verifications_reject_needs_notes check (status = 'confirmada' or char_length(btrim(coalesce(notes, ''))) >= 5)
);
create index movement_verifications_movement_idx on hc.movement_verifications (movement_id, decided_at desc);

create trigger movements_immutable before update or delete on hc.movements
  for each row execute function hc.forbid_modification();
create trigger movement_evidence_immutable before update or delete on hc.movement_evidence
  for each row execute function hc.forbid_modification();
create trigger movement_verifications_immutable before update or delete on hc.movement_verifications
  for each row execute function hc.forbid_modification();

-- Defensa en profundidad: el movimiento debe coincidir con el origen de datos de su lote y de su destino.
create function hc.check_movement_consistency() returns trigger
language plpgsql as $$
declare b_origin text; d_origin text;
begin
  select b.data_origin into b_origin from hc.batches b where b.id = new.batch_id;
  if b_origin is null or b_origin <> new.data_origin then
    raise exception using errcode = 'HC422', message = 'movement_batch_mismatch',
      detail = 'El movimiento debe tener el mismo origen de datos que su lote.';
  end if;
  if new.destination_id is not null then
    select d.data_origin into d_origin from hc.destinations d where d.id = new.destination_id;
    if d_origin is distinct from new.data_origin then
      raise exception using errcode = 'HC422', message = 'destination_invalid',
        detail = 'No se pueden mezclar destinos DEMO con lotes reales ni viceversa.';
    end if;
  end if;
  return new;
end $$;
create trigger movements_consistency before insert on hc.movements
  for each row execute function hc.check_movement_consistency();

-- ---------------------------------------------------------------------------------------------------
-- Funciones de apoyo (internas)
-- ---------------------------------------------------------------------------------------------------
-- Valida identidad del actor (coincide con la transacción, activo) y que tenga alguno de los roles.
create function hc._require_actor(p_actor uuid, p_roles text[]) returns void
language plpgsql stable security definer set search_path = hc, pg_temp as $$
begin
  if p_actor is null or hc.current_actor() is distinct from p_actor
     or not exists (select 1 from hc.profiles p where p.id = p_actor and p.active) then
    raise exception using errcode = 'HC401', message = 'unauthenticated';
  end if;
  if not hc.actor_has_role(p_roles) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
end $$;

create function hc._same_movement_payload(
  m hc.movements, p_batch uuid, p_type text, p_qty bigint, p_from uuid, p_to uuid, p_dest uuid, p_reason text, p_occurred timestamptz
) returns boolean
language sql stable set search_path = hc, pg_temp as $$
  select m.batch_id = p_batch and m.type = p_type and m.quantity_g = p_qty
     and m.from_location_id is not distinct from p_from
     and m.to_location_id is not distinct from p_to
     and m.destination_id is not distinct from p_dest
     and m.reason is not distinct from p_reason
     and (p_occurred is null or m.occurred_at = p_occurred)
$$;

-- ---------------------------------------------------------------------------------------------------
-- Destinos: alta y activación (solo administrador)
-- ---------------------------------------------------------------------------------------------------
create function hc.create_destination(p_actor uuid, p_name text, p_type text, p_demo boolean)
returns table (o_destination_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_origin text := case when coalesce(p_demo, false) then 'demo' else 'real' end;
  v_id     uuid;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if char_length(v_name) < 2 or char_length(v_name) > 120 or p_type is null or p_type not in ('gestor', 'reutilizacion', 'otro') then
    raise exception using errcode = 'HC422', message = 'destination_invalid';
  end if;
  insert into hc.destinations (name, type, data_origin, created_by)
  values (v_name, p_type, v_origin, p_actor)
  on conflict (lower(btrim(name)), data_origin) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception using errcode = 'HC409', message = 'destination_exists';
  end if;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'destination', v_id::text, 'create', jsonb_build_object('name', v_name, 'type', p_type, 'dataOrigin', v_origin));
  return query select v_id;
end $$;

create function hc.set_destination_active(p_actor uuid, p_destination_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v hc.destinations%rowtype;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  select * into v from hc.destinations d where d.id = p_destination_id for update;
  if v.id is null then
    raise exception using errcode = 'HC404', message = 'destination_not_found';
  end if;
  if p_active is null then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  if v.active is distinct from p_active then
    update hc.destinations set active = p_active where id = v.id;
    insert into hc.audit_logs (actor_id, entity, entity_id, action, old_summary, new_summary)
    values (p_actor, 'destination', v.id::text, 'set_active', jsonb_build_object('active', v.active), jsonb_build_object('active', p_active));
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Registro atómico de un movimiento (traslado, despacho, reutilización, rechazo, ajuste)
-- ---------------------------------------------------------------------------------------------------
create function hc.register_movement(
  p_actor           uuid,
  p_batch_id        uuid,
  p_type            text,
  p_quantity_g      bigint,
  p_from_location   uuid,
  p_to_location     uuid,
  p_destination_id  uuid,
  p_occurred_at     timestamptz,
  p_reason          text,
  p_idempotency_key uuid
) returns table (o_movement_id uuid, o_movement_ref bigint, o_duplicate boolean)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_type     text := lower(btrim(coalesce(p_type, '')));
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_roles    text[];
  v_now      timestamptz := now();
  v_occurred timestamptz;
  v_batch    hc.batches%rowtype;
  v_w_at     timestamptz;
  v_dest     hc.destinations%rowtype;
  v_m        hc.movements%rowtype;
  v_bal      bigint;
  v_ok       boolean;
begin
  -- 1. Identidad, tipo y rol (el ajuste es exclusivo del administrador).
  if v_type not in ('traslado', 'despacho', 'reutilizacion', 'rechazo', 'ajuste') then
    raise exception using errcode = 'HC422', message = 'invalid_movement_type';
  end if;
  v_roles := case when v_type = 'ajuste' then array['administrador'] else array['administrador', 'operador'] end;
  perform hc._require_actor(p_actor, v_roles);
  if p_idempotency_key is null then
    raise exception using errcode = 'HC422', message = 'idempotency_key_required';
  end if;

  -- 2. Reintento legítimo: devuelve el resultado original sin crear nada.
  select * into v_m from hc.movements m where m.created_by = p_actor and m.idempotency_key = p_idempotency_key;
  if v_m.id is not null then
    if not hc._same_movement_payload(v_m, p_batch_id, v_type, p_quantity_g, p_from_location, p_to_location, p_destination_id, v_reason, p_occurred_at) then
      raise exception using errcode = 'HC409', message = 'idempotency_conflict';
    end if;
    return query select v_m.id, v_m.ref_no, true;
    return;
  end if;

  -- 3. Lote (se bloquea: serializa todos los movimientos del mismo lote y evita interbloqueos entre traslados cruzados).
  select * into v_batch from hc.batches b where b.id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'HC404', message = 'batch_not_found';
  end if;

  -- 4. Forma del movimiento según su tipo.
  v_ok := case v_type
    when 'traslado' then p_from_location is not null and p_to_location is not null
                         and p_from_location <> p_to_location and p_destination_id is null
    when 'despacho' then p_from_location is not null and p_to_location is null and p_destination_id is not null
    when 'reutilizacion' then p_from_location is not null and p_to_location is null and p_destination_id is not null
    when 'rechazo' then p_from_location is not null and p_to_location is null and p_destination_id is null
    when 'ajuste' then (p_from_location is null) <> (p_to_location is null) and p_destination_id is null
    else false end;
  if not v_ok then
    raise exception using errcode = 'HC422', message = 'invalid_movement_shape';
  end if;
  if v_type in ('rechazo', 'ajuste') and (v_reason is null or char_length(v_reason) < 5) then
    raise exception using errcode = 'HC422', message = 'reason_required';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception using errcode = 'HC422', message = 'notes_too_long';
  end if;
  if p_quantity_g is null or p_quantity_g <= 0 then
    raise exception using errcode = 'HC422', message = 'invalid_mass';
  end if;
  if p_quantity_g > 1000000 then
    raise exception using errcode = 'HC422', message = 'mass_too_large';
  end if;

  -- 5. Ámbito y zonas activas.
  if p_from_location is not null and not hc.user_in_scope(p_actor, p_from_location, v_roles) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
  if p_from_location is null and not hc.user_in_scope(p_actor, p_to_location, v_roles) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
  if (p_from_location is not null and not exists (select 1 from hc.zones z where z.id = p_from_location and z.active))
     or (p_to_location is not null and not exists (select 1 from hc.zones z where z.id = p_to_location and z.active)) then
    raise exception using errcode = 'HC422', message = 'zone_invalid';
  end if;

  -- 6. Destino: debe existir, estar activo, ser del mismo origen de datos y del tipo adecuado.
  if p_destination_id is not null then
    select * into v_dest from hc.destinations d where d.id = p_destination_id;
    if v_dest.id is null or v_dest.data_origin <> v_batch.data_origin
       or (v_type = 'despacho' and v_dest.type not in ('gestor', 'otro'))
       or (v_type = 'reutilizacion' and v_dest.type <> 'reutilizacion') then
      raise exception using errcode = 'HC422', message = 'destination_invalid';
    end if;
    if not v_dest.active then
      raise exception using errcode = 'HC422', message = 'destination_inactive';
    end if;
  end if;

  -- 7. Fecha: no futura y no anterior al pesaje del lote.
  v_occurred := coalesce(p_occurred_at, v_now);
  if v_occurred > v_now + interval '5 minutes' then
    raise exception using errcode = 'HC422', message = 'occurred_in_future';
  end if;
  select w.occurred_at into v_w_at from hc.weighings w where w.id = v_batch.weighing_id;
  if v_occurred < v_w_at then
    raise exception using errcode = 'HC422', message = 'occurred_before_batch';
  end if;

  -- 8. Saldo suficiente en la ubicación de origen (fila bloqueada) y descuento.
  if p_from_location is not null then
    select l.balance_g into v_bal from hc.batch_location_balances l
     where l.batch_id = p_batch_id and l.zone_id = p_from_location for update;
    if v_bal is null or v_bal < p_quantity_g then
      raise exception using errcode = 'HC422', message = 'insufficient_balance',
        detail = format('Saldo disponible: %s g; solicitado: %s g.', coalesce(v_bal, 0), p_quantity_g);
    end if;
  end if;

  -- 9. Inserción; ON CONFLICT cubre la carrera de dos envíos simultáneos con la misma clave.
  insert into hc.movements (batch_id, type, quantity_g, from_location_id, to_location_id, destination_id,
                            occurred_at, created_by, reason, idempotency_key, data_origin)
  values (p_batch_id, v_type, p_quantity_g, p_from_location, p_to_location, p_destination_id,
          v_occurred, p_actor, v_reason, p_idempotency_key, v_batch.data_origin)
  on conflict (created_by, idempotency_key) do nothing
  returning * into v_m;

  if v_m.id is null then
    select * into v_m from hc.movements m where m.created_by = p_actor and m.idempotency_key = p_idempotency_key;
    if not hc._same_movement_payload(v_m, p_batch_id, v_type, p_quantity_g, p_from_location, p_to_location, p_destination_id, v_reason, p_occurred_at) then
      raise exception using errcode = 'HC409', message = 'idempotency_conflict';
    end if;
    return query select v_m.id, v_m.ref_no, true;
    return;
  end if;

  if p_from_location is not null then
    update hc.batch_location_balances set balance_g = balance_g - p_quantity_g, updated_at = v_now
     where batch_id = p_batch_id and zone_id = p_from_location;
  end if;
  if p_to_location is not null then
    insert into hc.batch_location_balances (batch_id, zone_id, balance_g)
    values (p_batch_id, p_to_location, p_quantity_g)
    on conflict (batch_id, zone_id) do update set balance_g = hc.batch_location_balances.balance_g + excluded.balance_g, updated_at = v_now;
  end if;

  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'movement', v_m.id::text, 'create', jsonb_build_object(
    'movementRef', v_m.ref_no, 'batchRef', v_batch.ref_no, 'type', v_type, 'quantityG', p_quantity_g,
    'fromLocationId', p_from_location, 'toLocationId', p_to_location, 'destinationId', p_destination_id,
    'dataOrigin', v_m.data_origin));

  return query select v_m.id, v_m.ref_no, false;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Corrección (RF-08): movimiento nuevo con efecto inverso al original; conserva actor, motivo, hora y referencia.
-- Solo administrador. No se puede corregir una corrección ni un despacho con valorización confirmada.
-- ---------------------------------------------------------------------------------------------------
create function hc.correct_movement(p_actor uuid, p_movement_id uuid, p_reason text, p_idempotency_key uuid)
returns table (o_movement_id uuid, o_movement_ref bigint, o_duplicate boolean)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now    timestamptz := now();
  v_orig   hc.movements%rowtype;
  v_batch  hc.batches%rowtype;
  v_m      hc.movements%rowtype;
  v_bal    bigint;
  v_last   text;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if p_idempotency_key is null then
    raise exception using errcode = 'HC422', message = 'idempotency_key_required';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception using errcode = 'HC422', message = 'reason_required';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'HC422', message = 'notes_too_long';
  end if;

  select * into v_m from hc.movements m where m.created_by = p_actor and m.idempotency_key = p_idempotency_key;
  if v_m.id is not null then
    if v_m.corrects_movement_id is distinct from p_movement_id or v_m.reason is distinct from v_reason then
      raise exception using errcode = 'HC409', message = 'idempotency_conflict';
    end if;
    return query select v_m.id, v_m.ref_no, true;
    return;
  end if;

  select * into v_orig from hc.movements m where m.id = p_movement_id;
  if v_orig.id is null then
    raise exception using errcode = 'HC404', message = 'movement_not_found';
  end if;
  select * into v_batch from hc.batches b where b.id = v_orig.batch_id for update;   -- serializa con otros movimientos del lote

  if v_orig.type = 'correccion' then
    raise exception using errcode = 'HC422', message = 'cannot_correct_correction';
  end if;
  if exists (select 1 from hc.movements c where c.corrects_movement_id = v_orig.id) then
    raise exception using errcode = 'HC422', message = 'already_corrected';
  end if;
  select v.status into v_last from hc.movement_verifications v
   where v.movement_id = v_orig.id order by v.decided_at desc, v.id desc limit 1;
  if v_last = 'confirmada' then
    raise exception using errcode = 'HC422', message = 'verification_blocks_correction';
  end if;

  -- Efecto inverso: lo que el original restó de una ubicación se devuelve y viceversa (debe quedar saldo >= 0).
  if v_orig.to_location_id is not null then
    select l.balance_g into v_bal from hc.batch_location_balances l
     where l.batch_id = v_orig.batch_id and l.zone_id = v_orig.to_location_id for update;
    if v_bal is null or v_bal < v_orig.quantity_g then
      raise exception using errcode = 'HC422', message = 'insufficient_balance',
        detail = format('No se puede revertir: saldo disponible %s g; a revertir %s g.', coalesce(v_bal, 0), v_orig.quantity_g);
    end if;
  end if;

  insert into hc.movements (batch_id, type, quantity_g, from_location_id, to_location_id, destination_id,
                            occurred_at, created_by, reason, corrects_movement_id, idempotency_key, data_origin)
  values (v_orig.batch_id, 'correccion', v_orig.quantity_g, v_orig.to_location_id, v_orig.from_location_id, null,
          v_now, p_actor, v_reason, v_orig.id, p_idempotency_key, v_orig.data_origin)
  on conflict (created_by, idempotency_key) do nothing
  returning * into v_m;

  if v_m.id is null then
    select * into v_m from hc.movements m where m.created_by = p_actor and m.idempotency_key = p_idempotency_key;
    if v_m.corrects_movement_id is distinct from p_movement_id or v_m.reason is distinct from v_reason then
      raise exception using errcode = 'HC409', message = 'idempotency_conflict';
    end if;
    return query select v_m.id, v_m.ref_no, true;
    return;
  end if;

  if v_orig.to_location_id is not null then
    update hc.batch_location_balances set balance_g = balance_g - v_orig.quantity_g, updated_at = v_now
     where batch_id = v_orig.batch_id and zone_id = v_orig.to_location_id;
  end if;
  if v_orig.from_location_id is not null then
    insert into hc.batch_location_balances (batch_id, zone_id, balance_g)
    values (v_orig.batch_id, v_orig.from_location_id, v_orig.quantity_g)
    on conflict (batch_id, zone_id) do update set balance_g = hc.batch_location_balances.balance_g + excluded.balance_g, updated_at = v_now;
  end if;

  insert into hc.audit_logs (actor_id, entity, entity_id, action, old_summary, new_summary)
  values (p_actor, 'movement', v_m.id::text, 'correct',
    jsonb_build_object('correctedMovementId', v_orig.id, 'correctedRef', v_orig.ref_no, 'type', v_orig.type, 'quantityG', v_orig.quantity_g),
    jsonb_build_object('movementRef', v_m.ref_no, 'batchRef', v_batch.ref_no, 'reason', v_reason));

  return query select v_m.id, v_m.ref_no, false;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Evidencia (referencia de texto) y verificación de valorización (H-05). Ninguna crea ni modifica movimientos ni saldos.
-- ---------------------------------------------------------------------------------------------------
create function hc.add_movement_evidence(p_actor uuid, p_movement_id uuid, p_kind text, p_reference text, p_note text)
returns table (o_evidence_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_ref  text := btrim(coalesce(p_reference, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_m    hc.movements%rowtype;
  v_id   uuid;
begin
  perform hc._require_actor(p_actor, array['administrador', 'operador']);
  select * into v_m from hc.movements m where m.id = p_movement_id;
  if v_m.id is null then
    raise exception using errcode = 'HC404', message = 'movement_not_found';
  end if;
  if not hc.user_in_scope(p_actor, v_m.from_location_id, array['administrador', 'operador']) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
  if v_m.type not in ('despacho', 'reutilizacion') then
    raise exception using errcode = 'HC422', message = 'movement_not_verifiable';
  end if;
  if exists (select 1 from hc.movements c where c.corrects_movement_id = v_m.id) then
    raise exception using errcode = 'HC422', message = 'already_corrected';
  end if;
  if p_kind is null or p_kind not in ('guia_despacho', 'certificado', 'correo', 'foto', 'otro')
     or char_length(v_ref) < 1 or char_length(v_ref) > 200 or (v_note is not null and char_length(v_note) > 500) then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  insert into hc.movement_evidence (movement_id, kind, reference, note, created_by)
  values (v_m.id, p_kind, v_ref, v_note, p_actor)
  on conflict (movement_id, kind, reference) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception using errcode = 'HC409', message = 'evidence_duplicate';
  end if;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'movement_evidence', v_id::text, 'create',
    jsonb_build_object('movementRef', v_m.ref_no, 'kind', p_kind, 'reference', v_ref));
  return query select v_id;
end $$;

create function hc.verify_movement(p_actor uuid, p_movement_id uuid, p_status text, p_notes text)
returns table (o_verification_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_m     hc.movements%rowtype;
  v_last  text;
  v_id    uuid;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if p_status is null or p_status not in ('confirmada', 'rechazada') or (v_notes is not null and char_length(v_notes) > 500) then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  select * into v_m from hc.movements m where m.id = p_movement_id for update;   -- serializa decisiones sobre el mismo despacho
  if v_m.id is null then
    raise exception using errcode = 'HC404', message = 'movement_not_found';
  end if;
  if v_m.type <> 'despacho' then
    raise exception using errcode = 'HC422', message = 'movement_not_verifiable';
  end if;
  if exists (select 1 from hc.movements c where c.corrects_movement_id = v_m.id) then
    raise exception using errcode = 'HC422', message = 'already_corrected';
  end if;
  if p_status = 'confirmada' and not exists (select 1 from hc.movement_evidence e where e.movement_id = v_m.id) then
    raise exception using errcode = 'HC422', message = 'evidence_required';
  end if;
  if p_status = 'rechazada' and (v_notes is null or char_length(v_notes) < 5) then
    raise exception using errcode = 'HC422', message = 'reason_required';
  end if;
  select v.status into v_last from hc.movement_verifications v
   where v.movement_id = v_m.id order by v.decided_at desc, v.id desc limit 1;
  if v_last is not distinct from p_status then
    raise exception using errcode = 'HC409', message = 'verification_unchanged';
  end if;
  insert into hc.movement_verifications (movement_id, status, notes, decided_by)
  values (v_m.id, p_status, v_notes, p_actor) returning id into v_id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, old_summary, new_summary)
  values (p_actor, 'movement_verification', v_id::text, 'decide',
    jsonb_build_object('previous', v_last),
    jsonb_build_object('movementRef', v_m.ref_no, 'status', p_status));
  return query select v_id;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- RLS y privilegios (mismo modelo que 0005: lectura filtrada por actor; escritura solo vía funciones)
-- ---------------------------------------------------------------------------------------------------
alter table hc.destinations            enable row level security;
alter table hc.movements               enable row level security;
alter table hc.movement_evidence       enable row level security;
alter table hc.movement_verifications  enable row level security;

revoke all on hc.destinations, hc.movements, hc.movement_evidence, hc.movement_verifications from public, anon, authenticated;

grant select on hc.destinations, hc.movements, hc.movement_evidence, hc.movement_verifications to hc_app;

create policy destinations_read on hc.destinations for select to hc_app using (hc.actor_is_active());
create policy movements_read on hc.movements for select to hc_app
  using (hc.actor_in_scope(from_location_id) or hc.actor_in_scope(to_location_id));
create policy movement_evidence_read on hc.movement_evidence for select to hc_app
  using (exists (select 1 from hc.movements m where m.id = movement_id));
create policy movement_verifications_read on hc.movement_verifications for select to hc_app
  using (exists (select 1 from hc.movements m where m.id = movement_id));

-- Un lote trasladado a otra zona debe ser visible para quien tiene ámbito en esa zona (y su pesaje de origen).
create policy batches_read_by_location on hc.batches for select to hc_app
  using (exists (select 1 from hc.batch_location_balances l where l.batch_id = batches.id and hc.actor_in_scope(l.zone_id)));
create policy weighings_read_via_batch on hc.weighings for select to hc_app
  using (exists (select 1 from hc.batches b where b.weighing_id = weighings.id));

-- Funciones: EXECUTE solo para hc_app (las internas `_*` no se exponen).
revoke execute on function
  hc._require_actor(uuid, text[]),
  hc._same_movement_payload(hc.movements, uuid, text, bigint, uuid, uuid, uuid, text, timestamptz),
  hc.check_movement_consistency(),
  hc.create_destination(uuid, text, text, boolean),
  hc.set_destination_active(uuid, uuid, boolean),
  hc.register_movement(uuid, uuid, text, bigint, uuid, uuid, uuid, timestamptz, text, uuid),
  hc.correct_movement(uuid, uuid, text, uuid),
  hc.add_movement_evidence(uuid, uuid, text, text, text),
  hc.verify_movement(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function
  hc.create_destination(uuid, text, text, boolean),
  hc.set_destination_active(uuid, uuid, boolean),
  hc.register_movement(uuid, uuid, text, bigint, uuid, uuid, uuid, timestamptz, text, uuid),
  hc.correct_movement(uuid, uuid, text, uuid),
  hc.add_movement_evidence(uuid, uuid, text, text, text),
  hc.verify_movement(uuid, uuid, text, text)
  to hc_app;
