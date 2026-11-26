-- 0012 · Capacidad de contenedores (revisión de diseño con datos simulados, Iteración 4)
-- Reglas de diseño:
--   · La capacidad es un dato de CATÁLOGO opcional (litros). Sin capacidad configurada la interfaz NO muestra llenado:
--     un porcentaje del sensor sin saber el tamaño del contenedor no se puede interpretar (docs/04: «fillPercent» es una
--     estimación geométrica, no kilogramos ni volumen exacto).
--   · Solo el administrador con ámbito sobre la zona del contenedor la fija o la borra (NULL), y queda en auditoría.
--   · No cambia pesajes, lotes, movimientos ni lecturas: la telemetría sigue sin crear captación.

alter table hc.containers
  add column capacity_l integer null check (capacity_l is null or (capacity_l between 1 and 10000));

comment on column hc.containers.capacity_l is
  'Capacidad nominal en litros (opcional). Sin ella no se muestra llenado del sensor. No es captación ni masa.';

create function hc.admin_set_container_capacity(p_actor uuid, p_container_id uuid, p_capacity_l integer)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v hc.containers%rowtype;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if p_capacity_l is not null and p_capacity_l not between 1 and 10000 then
    raise exception using errcode = 'HC422', message = 'capacity_invalid';
  end if;
  select * into v from hc.containers c where c.id = p_container_id for update;
  if v.id is null then
    raise exception using errcode = 'HC404', message = 'container_not_found';
  end if;
  if not hc.user_in_scope(p_actor, hc.station_zone(v.station_id), array['administrador']) then
    raise exception using errcode = 'HC403', message = 'forbidden';
  end if;
  if v.capacity_l is not distinct from p_capacity_l then
    return;
  end if;
  update hc.containers set capacity_l = p_capacity_l where id = v.id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, old_summary, new_summary)
  values (p_actor, 'container', v.id::text, 'set_capacity',
          jsonb_build_object('capacityL', v.capacity_l), jsonb_build_object('capacityL', p_capacity_l));
end $$;

revoke execute on function hc.admin_set_container_capacity(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function hc.admin_set_container_capacity(uuid, uuid, integer) to hc_app;
