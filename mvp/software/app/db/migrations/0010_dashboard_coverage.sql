-- 0010 · Dashboard, cobertura de medición y «cero confirmado» (Iteración 3)
--
-- Calendarios de medición por contenedor (días fijos de la semana, versionados), confirmación de «cero»
-- (contenedor revisado, sin residuos: NO es un pesaje y no suma masa) y funciones de lectura para los indicadores.
--
-- Decisiones (docs/25, ADR-025/026):
--  · Las mediciones esperadas se DERIVAN de los calendarios (no hay filas por día ni tareas programadas): un día es
--    «esperado» si algún calendario del contenedor está vigente ese día y incluye su día de la semana.
--  · Un calendario no se edita hacia atrás: se crea desde hoy o después y se termina como máximo ayer; así el historial
--    de lo esperado nunca cambia retroactivamente.
--  · Estado de cada medición esperada (día calendario America/Santiago): realizado (hay ≥1 pesaje del contenedor ese día)
--    > cero_confirmado > omitido (el día ya pasó) | pendiente (hoy, sin pesaje ni cero). Sin pesaje ≠ cero.
--  · Los indicadores se calculan en funciones SECURITY INVOKER: la RLS del rol de aplicación sigue siendo la barrera de
--    lectura, y además cada línea se filtra por el ámbito del actor (ver hc._in_view).
--  · Movimientos «efectivos» = sin correcciones y sin los originales corregidos (el par se anula). Los períodos se
--    asignan por la fecha del propio movimiento (occurred_at); una corrección posterior cambia los períodos ya mostrados.

-- ---------------------------------------------------------------------------------------------------
-- Calendarios
-- ---------------------------------------------------------------------------------------------------
create table hc.measurement_schedules (
  id           uuid primary key default gen_random_uuid(),
  container_id uuid not null references hc.containers (id),
  weekdays     smallint[] not null
               check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),  -- ISO: 1 = lunes … 7 = domingo
  start_on     date not null,
  end_on       date null,                               -- inclusive; null = vigente sin fecha de término
  created_at   timestamptz not null default now(),
  created_by   uuid not null references hc.profiles (id),
  ended_at     timestamptz null,
  ended_by     uuid null references hc.profiles (id),
  data_origin  text not null check (data_origin in ('real', 'demo')),
  constraint measurement_schedules_range check (end_on is null or end_on >= start_on - 1),   -- start_on - 1 = calendario vacío (anulado antes de empezar)
  constraint measurement_schedules_end_pair check ((end_on is null) = (ended_by is null))
);
create index measurement_schedules_container_idx on hc.measurement_schedules (container_id, start_on);

-- Solo se puede terminar (end_on/ended_*); el resto es inmutable y no se borra.
create function hc.measurement_schedules_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'HC423', message = 'immutable_record',
      detail = 'Los calendarios de medición no se eliminan; se terminan.';
  end if;
  if old.end_on is not null
     or (new.id, new.container_id, new.weekdays, new.start_on, new.created_at, new.created_by, new.data_origin)
        is distinct from (old.id, old.container_id, old.weekdays, old.start_on, old.created_at, old.created_by, old.data_origin) then
    raise exception using errcode = 'HC423', message = 'immutable_record',
      detail = 'Un calendario solo puede terminarse una vez; no admite otros cambios.';
  end if;
  return new;
end $$;
create trigger measurement_schedules_immutable before update or delete on hc.measurement_schedules
  for each row execute function hc.measurement_schedules_guard();

-- «Cero confirmado»: revisión del contenedor sin residuos. Solo anexado; única por contenedor y día.
create table hc.measurement_zero_confirmations (
  id           uuid primary key default gen_random_uuid(),
  container_id uuid not null references hc.containers (id),
  expected_on  date not null,
  note         text null check (note is null or char_length(note) <= 500),
  confirmed_by uuid not null references hc.profiles (id),
  confirmed_at timestamptz not null default now(),
  data_origin  text not null check (data_origin in ('real', 'demo')),
  constraint measurement_zero_unique unique (container_id, expected_on)
);
create trigger measurement_zero_immutable before update or delete on hc.measurement_zero_confirmations
  for each row execute function hc.forbid_modification();

-- ---------------------------------------------------------------------------------------------------
-- Auxiliares de fecha y de ámbito (puras o de lectura)
-- ---------------------------------------------------------------------------------------------------
create function hc._today_cl() returns date
language sql stable set search_path = pg_temp as $$
  select (now() at time zone 'America/Santiago')::date
$$;

create function hc._local_day(p_ts timestamptz) returns date
language sql immutable set search_path = pg_temp as $$
  select (p_ts at time zone 'America/Santiago')::date
$$;

-- ¿La zona está dentro del ámbito del actor y, si hay filtro, dentro de la zona filtrada (o sus descendientes)?
create function hc._in_view(p_zone uuid, p_filter uuid) returns boolean
language sql stable set search_path = hc, pg_temp as $$
  select p_zone is not null and hc.actor_in_scope(p_zone) and (p_filter is null or hc.zone_within(p_zone, p_filter))
$$;

-- ¿Se espera una medición de este contenedor ese día?
create function hc.is_expected_on(p_container uuid, p_day date) returns boolean
language sql stable set search_path = hc, pg_temp as $$
  select exists (
    select 1 from hc.measurement_schedules s
     where s.container_id = p_container
       and p_day between s.start_on and coalesce(s.end_on, 'infinity'::date)
       and extract(isodow from p_day)::smallint = any (s.weekdays)
  )
$$;

-- ---------------------------------------------------------------------------------------------------
-- Escritura (solo vía funciones)
-- ---------------------------------------------------------------------------------------------------
create function hc.create_measurement_schedule(p_actor uuid, p_container_id uuid, p_weekdays integer[], p_start_on date)
returns table (o_schedule_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_days  integer[];
  v_today date := hc._today_cl();
  v_c     hc.containers%rowtype;
  v_id    uuid;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  select array_agg(distinct d order by d) into v_days from unnest(p_weekdays) d;
  if v_days is null or exists (select 1 from unnest(v_days) x where x is null or x not between 1 and 7) then
    raise exception using errcode = 'HC422', message = 'weekdays_invalid';
  end if;
  if p_start_on is null or p_start_on < v_today or p_start_on > v_today + 366 then
    raise exception using errcode = 'HC422', message = 'schedule_start_invalid';
  end if;
  select * into v_c from hc.containers c where c.id = p_container_id for update;   -- serializa calendarios del mismo contenedor
  if v_c.id is null then
    raise exception using errcode = 'HC404', message = 'container_not_found';
  end if;
  if not v_c.active then
    raise exception using errcode = 'HC422', message = 'container_inactive';
  end if;
  if exists (select 1 from hc.measurement_schedules s
              where s.container_id = v_c.id and coalesce(s.end_on, 'infinity'::date) >= p_start_on) then
    raise exception using errcode = 'HC409', message = 'schedule_overlap';
  end if;
  insert into hc.measurement_schedules (container_id, weekdays, start_on, created_by, data_origin)
  values (v_c.id, v_days::smallint[], p_start_on, p_actor, v_c.data_origin)
  returning id into v_id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'measurement_schedule', v_id::text, 'create',
          jsonb_build_object('containerCode', v_c.code, 'weekdays', v_days, 'startOn', p_start_on));
  return query select v_id;
end $$;

-- Termina un calendario (fecha inclusive). Como mínimo ayer: nunca se altera lo esperado de días ya transcurridos.
create function hc.end_measurement_schedule(p_actor uuid, p_schedule_id uuid, p_end_on date)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_today date := hc._today_cl();
  v_s     hc.measurement_schedules%rowtype;
  v_code  text;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  select * into v_s from hc.measurement_schedules s where s.id = p_schedule_id for update;
  if v_s.id is null then
    raise exception using errcode = 'HC404', message = 'schedule_not_found';
  end if;
  if v_s.end_on is not null then
    raise exception using errcode = 'HC409', message = 'schedule_already_ended';
  end if;
  if p_end_on is null or p_end_on < greatest(v_today - 1, v_s.start_on - 1) then
    raise exception using errcode = 'HC422', message = 'schedule_end_invalid';
  end if;
  update hc.measurement_schedules set end_on = p_end_on, ended_at = now(), ended_by = p_actor where id = v_s.id;
  select c.code into v_code from hc.containers c where c.id = v_s.container_id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'measurement_schedule', v_s.id::text, 'end',
          jsonb_build_object('containerCode', v_code, 'endOn', p_end_on));
end $$;

-- «Cero confirmado» de HOY: el contenedor se revisó y no había residuos. No es un pesaje y no suma masa.
-- Solo si hoy hay medición esperada, aún no hay pesaje del contenedor hoy y el actor tiene ámbito en su zona.
create function hc.confirm_zero_measurement(p_actor uuid, p_container_id uuid, p_note text)
returns table (o_confirmation_id uuid, o_duplicate boolean)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_today date := hc._today_cl();
  v_c     hc.containers%rowtype;
  v_id    uuid;
begin
  perform hc._require_actor(p_actor, array['administrador', 'operador']);
  if v_note is not null and char_length(v_note) > 500 then
    raise exception using errcode = 'HC422', message = 'notes_too_long';
  end if;
  select * into v_c from hc.containers c where c.id = p_container_id for update;
  if v_c.id is null then
    raise exception using errcode = 'HC404', message = 'container_not_found';
  end if;
  if not hc.user_in_scope(p_actor, hc.station_zone(v_c.station_id), array['administrador', 'operador']) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
  if not hc.is_expected_on(v_c.id, v_today) then
    raise exception using errcode = 'HC422', message = 'not_expected_today';
  end if;
  select z.id into v_id from hc.measurement_zero_confirmations z where z.container_id = v_c.id and z.expected_on = v_today;
  if v_id is not null then
    return query select v_id, true;
    return;
  end if;
  if exists (select 1 from hc.weighings w where w.container_id = v_c.id and hc._local_day(w.occurred_at) = v_today) then
    raise exception using errcode = 'HC422', message = 'weighing_exists';
  end if;
  insert into hc.measurement_zero_confirmations (container_id, expected_on, note, confirmed_by, data_origin)
  values (v_c.id, v_today, v_note, p_actor, v_c.data_origin)
  returning id into v_id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'measurement_zero', v_id::text, 'confirm',
          jsonb_build_object('containerCode', v_c.code, 'expectedOn', v_today));
  return query select v_id, false;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Lectura para indicadores (SECURITY INVOKER: la RLS de hc_app sigue aplicando)
-- ---------------------------------------------------------------------------------------------------

-- Movimientos efectivos: sin correcciones y sin los originales corregidos (el par se anula).
create function hc.effective_movements() returns setof hc.movements
language sql stable set search_path = hc, pg_temp as $$
  select m.* from hc.movements m
   where m.type <> 'correccion'
     and not exists (select 1 from hc.movements c where c.corrects_movement_id = m.id)
$$;

-- Saldo reconstruido del libro (lotes + movimientos efectivos) con occurred_at < p_at. p_at = 'infinity' ⇒ actual.
-- Invariante probado: con 'infinity' coincide con hc.batch_location_balances.
create function hc.inventory_at(p_at timestamptz, p_zone uuid, p_material uuid, p_origin text)
returns table (o_zone_id uuid, o_material_id uuid, o_balance_g bigint)
language sql stable set search_path = hc, pg_temp as $$
  with lines as (
    select b.origin_zone_id as zone_id, b.material_id as material_id, b.initial_g as qty
      from hc.batches b join hc.weighings w on w.id = b.weighing_id
     where w.occurred_at < p_at and b.data_origin = p_origin
    union all
    select m.to_location_id, b.material_id, m.quantity_g
      from hc.effective_movements() m join hc.batches b on b.id = m.batch_id
     where m.to_location_id is not null and m.occurred_at < p_at and m.data_origin = p_origin
    union all
    select m.from_location_id, b.material_id, -m.quantity_g
      from hc.effective_movements() m join hc.batches b on b.id = m.batch_id
     where m.from_location_id is not null and m.occurred_at < p_at and m.data_origin = p_origin
  )
  select l.zone_id, l.material_id, sum(l.qty)::bigint
    from lines l
   where hc._in_view(l.zone_id, p_zone) and (p_material is null or l.material_id = p_material)
   group by l.zone_id, l.material_id
$$;

-- Resumen de indicadores del período [p_from, p_to] (días locales inclusive), con cierre contable.
-- cierre = apertura + captación + ajustes(+) − ajustes(−) − despachos − reutilización − rechazo + traslados entrantes − salientes
create function hc.kpi_summary(p_from date, p_to date, p_zone uuid, p_material uuid, p_origin text)
returns table (
  o_captured_g bigint, o_weighings integer, o_contaminated integer,
  o_dispatched_g bigint, o_dispatched_confirmed_g bigint, o_dispatched_rejected_g bigint,
  o_dispatched_pending_g bigint, o_dispatched_pending_no_evidence_g bigint,
  o_reused_g bigint, o_reused_backed_g bigint, o_rejected_g bigint,
  o_adjust_in_g bigint, o_adjust_out_g bigint, o_transfer_in_g bigint, o_transfer_out_g bigint,
  o_opening_g bigint, o_closing_g bigint, o_current_g bigint
)
language sql stable set search_path = hc, pg_temp as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Santiago') as t0,
           ((p_to + 1)::timestamp at time zone 'America/Santiago') as t1
  ),
  wk as (
    select coalesce(sum(w.net_g), 0)::bigint as captured,
           count(*)::int as n,
           (count(*) filter (where w.contamination_observed))::int as contaminated
      from hc.weighings w, bounds b
     where w.occurred_at >= b.t0 and w.occurred_at < b.t1 and w.data_origin = p_origin
       and hc._in_view(w.zone_id, p_zone)
       and (p_material is null or w.material_id = p_material)
  ),
  mv as (
    select m.type, m.quantity_g, m.from_location_id, m.to_location_id,
           (select v.status from hc.movement_verifications v
             where v.movement_id = m.id order by v.decided_at desc, v.id desc limit 1) as last_status,
           exists (select 1 from hc.movement_evidence e where e.movement_id = m.id) as has_evidence
      from hc.effective_movements() m
      join hc.batches bt on bt.id = m.batch_id, bounds b
     where m.occurred_at >= b.t0 and m.occurred_at < b.t1 and m.data_origin = p_origin
       and (p_material is null or bt.material_id = p_material)
  ),
  agg as (
    select
      coalesce(sum(quantity_g) filter (where type = 'despacho' and hc._in_view(from_location_id, p_zone)), 0)::bigint as dispatched,
      coalesce(sum(quantity_g) filter (where type = 'despacho' and hc._in_view(from_location_id, p_zone) and last_status = 'confirmada'), 0)::bigint as dispatched_confirmed,
      coalesce(sum(quantity_g) filter (where type = 'despacho' and hc._in_view(from_location_id, p_zone) and last_status = 'rechazada'), 0)::bigint as dispatched_rejected,
      coalesce(sum(quantity_g) filter (where type = 'despacho' and hc._in_view(from_location_id, p_zone) and last_status is null), 0)::bigint as dispatched_pending,
      coalesce(sum(quantity_g) filter (where type = 'despacho' and hc._in_view(from_location_id, p_zone) and last_status is null and not has_evidence), 0)::bigint as dispatched_pending_no_evidence,
      coalesce(sum(quantity_g) filter (where type = 'reutilizacion' and hc._in_view(from_location_id, p_zone)), 0)::bigint as reused,
      coalesce(sum(quantity_g) filter (where type = 'reutilizacion' and hc._in_view(from_location_id, p_zone) and has_evidence), 0)::bigint as reused_backed,
      coalesce(sum(quantity_g) filter (where type = 'rechazo' and hc._in_view(from_location_id, p_zone)), 0)::bigint as rejected,
      coalesce(sum(quantity_g) filter (where type = 'ajuste' and to_location_id is not null and hc._in_view(to_location_id, p_zone)), 0)::bigint as adjust_in,
      coalesce(sum(quantity_g) filter (where type = 'ajuste' and from_location_id is not null and hc._in_view(from_location_id, p_zone)), 0)::bigint as adjust_out,
      coalesce(sum(quantity_g) filter (where type = 'traslado' and hc._in_view(to_location_id, p_zone)), 0)::bigint as transfer_in,
      coalesce(sum(quantity_g) filter (where type = 'traslado' and hc._in_view(from_location_id, p_zone)), 0)::bigint as transfer_out
    from mv
  )
  select wk.captured, wk.n, wk.contaminated,
         agg.dispatched, agg.dispatched_confirmed, agg.dispatched_rejected, agg.dispatched_pending, agg.dispatched_pending_no_evidence,
         agg.reused, agg.reused_backed, agg.rejected,
         agg.adjust_in, agg.adjust_out, agg.transfer_in, agg.transfer_out,
         (select coalesce(sum(i.o_balance_g), 0)::bigint from hc.inventory_at((select t0 from bounds), p_zone, p_material, p_origin) i),
         (select coalesce(sum(i.o_balance_g), 0)::bigint from hc.inventory_at((select t1 from bounds), p_zone, p_material, p_origin) i),
         (select coalesce(sum(i.o_balance_g), 0)::bigint from hc.inventory_at('infinity', p_zone, p_material, p_origin) i)
    from wk, agg
$$;

-- Captación semanal por material (semana ISO local, inicia lunes). Las semanas de los extremos pueden ser parciales.
create function hc.kpi_weekly(p_from date, p_to date, p_zone uuid, p_material uuid, p_origin text)
returns table (o_week_start date, o_material_id uuid, o_captured_g bigint, o_weighings integer)
language sql stable set search_path = hc, pg_temp as $$
  select date_trunc('week', w.occurred_at at time zone 'America/Santiago')::date,
         w.material_id,
         sum(w.net_g)::bigint,
         count(*)::int
    from hc.weighings w
   where w.occurred_at >= (p_from::timestamp at time zone 'America/Santiago')
     and w.occurred_at <  ((p_to + 1)::timestamp at time zone 'America/Santiago')
     and w.data_origin = p_origin
     and hc._in_view(w.zone_id, p_zone)
     and (p_material is null or w.material_id = p_material)
   group by 1, 2
   order by 1, 2
$$;

-- Mediciones esperadas del período con su estado (hasta hoy; no se listan días futuros).
create function hc.coverage_occurrences(p_from date, p_to date, p_zone uuid, p_material uuid, p_origin text)
returns table (
  o_container_id uuid, o_schedule_id uuid, o_expected_on date, o_status text,
  o_weighings integer, o_zero_note text, o_zero_by uuid, o_zero_at timestamptz
)
language sql stable set search_path = hc, pg_temp as $$
  with days as (
    select s.container_id, s.id as schedule_id, d::date as expected_on
      from hc.measurement_schedules s
      join hc.containers c on c.id = s.container_id
      join hc.stations st on st.id = c.station_id
     cross join lateral generate_series(
            greatest(p_from, s.start_on)::timestamp,
            least(p_to, coalesce(s.end_on, p_to), hc._today_cl())::timestamp,
            interval '1 day') d
     where s.data_origin = p_origin
       and extract(isodow from d)::smallint = any (s.weekdays)
       and hc._in_view(st.zone_id, p_zone)
       and (p_material is null or c.material_id = p_material)
  )
  select dd.container_id, dd.schedule_id, dd.expected_on,
         case when coalesce(wc.n, 0) > 0 then 'realizado'
              when z.id is not null then 'cero_confirmado'
              when dd.expected_on < hc._today_cl() then 'omitido'
              else 'pendiente' end,
         coalesce(wc.n, 0)::int, z.note, z.confirmed_by, z.confirmed_at
    from days dd
    left join lateral (
      select count(*) as n from hc.weighings w
       where w.container_id = dd.container_id and hc._local_day(w.occurred_at) = dd.expected_on
    ) wc on true
    left join hc.measurement_zero_confirmations z
      on z.container_id = dd.container_id and z.expected_on = dd.expected_on
   order by dd.expected_on, dd.container_id
$$;

-- Pesajes en días sin medición esperada, de contenedores que tienen calendario («no previstos»; informativo).
create function hc.unplanned_weighings(p_from date, p_to date, p_zone uuid, p_material uuid, p_origin text)
returns table (o_weighing_id uuid, o_container_id uuid, o_day date)
language sql stable set search_path = hc, pg_temp as $$
  select w.id, w.container_id, hc._local_day(w.occurred_at)
    from hc.weighings w
   where w.occurred_at >= (p_from::timestamp at time zone 'America/Santiago')
     and w.occurred_at <  ((p_to + 1)::timestamp at time zone 'America/Santiago')
     and w.data_origin = p_origin
     and hc._in_view(w.zone_id, p_zone)
     and (p_material is null or w.material_id = p_material)
     and exists (select 1 from hc.measurement_schedules s where s.container_id = w.container_id)
     and not hc.is_expected_on(w.container_id, hc._local_day(w.occurred_at))
   order by w.occurred_at
$$;

-- ---------------------------------------------------------------------------------------------------
-- RLS y privilegios (mismo modelo que 0005/0007)
-- ---------------------------------------------------------------------------------------------------
alter table hc.measurement_schedules          enable row level security;
alter table hc.measurement_zero_confirmations enable row level security;

revoke all on hc.measurement_schedules, hc.measurement_zero_confirmations from public, anon, authenticated;
grant select on hc.measurement_schedules, hc.measurement_zero_confirmations to hc_app;

-- Visible si el contenedor es visible (la RLS de hc.containers aplica dentro de la subconsulta).
create policy measurement_schedules_read on hc.measurement_schedules for select to hc_app
  using (exists (select 1 from hc.containers c where c.id = container_id));
create policy measurement_zero_read on hc.measurement_zero_confirmations for select to hc_app
  using (exists (select 1 from hc.containers c where c.id = container_id));

revoke execute on function
  hc.measurement_schedules_guard(),
  hc._today_cl(), hc._local_day(timestamptz), hc._in_view(uuid, uuid), hc.is_expected_on(uuid, date),
  hc.create_measurement_schedule(uuid, uuid, integer[], date),
  hc.end_measurement_schedule(uuid, uuid, date),
  hc.confirm_zero_measurement(uuid, uuid, text),
  hc.effective_movements(),
  hc.inventory_at(timestamptz, uuid, uuid, text),
  hc.kpi_summary(date, date, uuid, uuid, text),
  hc.kpi_weekly(date, date, uuid, uuid, text),
  hc.coverage_occurrences(date, date, uuid, uuid, text),
  hc.unplanned_weighings(date, date, uuid, uuid, text)
  from public, anon, authenticated;

-- La función del trigger no se concede; el resto sí (las de lectura necesitan ser ejecutables por el rol de la aplicación).
grant execute on function
  hc._today_cl(), hc._local_day(timestamptz), hc._in_view(uuid, uuid), hc.is_expected_on(uuid, date),
  hc.create_measurement_schedule(uuid, uuid, integer[], date),
  hc.end_measurement_schedule(uuid, uuid, date),
  hc.confirm_zero_measurement(uuid, uuid, text),
  hc.effective_movements(),
  hc.inventory_at(timestamptz, uuid, uuid, text),
  hc.kpi_summary(date, date, uuid, uuid, text),
  hc.kpi_weekly(date, date, uuid, uuid, text),
  hc.coverage_occurrences(date, date, uuid, uuid, text),
  hc.unplanned_weighings(date, date, uuid, uuid, text)
  to hc_app;
