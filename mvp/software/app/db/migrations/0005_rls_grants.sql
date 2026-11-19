-- 0005 · RLS y privilegios (deny-by-default)
-- Modelo: el navegador NUNCA habla con la BD. La aplicación (servidor) usa el rol hc_app, que:
--   · solo puede LEER tablas de negocio, filtradas por RLS según el actor de la transacción (hc.actor_id);
--   · escribe únicamente mediante funciones SECURITY DEFINER (hc.register_weighing, hc.auth_*);
--   · no tiene acceso alguno a credenciales ni sesiones.
-- anon/authenticated (API de datos de Supabase) no reciben USAGE sobre el esquema ni privilegios sobre tablas.

alter table hc.profiles                 enable row level security;
alter table hc.user_roles               enable row level security;
alter table hc.local_credentials        enable row level security;
alter table hc.local_sessions           enable row level security;
alter table hc.audit_logs               enable row level security;
alter table hc.buildings                enable row level security;
alter table hc.zones                    enable row level security;
alter table hc.stations                 enable row level security;
alter table hc.materials                enable row level security;
alter table hc.containers               enable row level security;
alter table hc.weighings                enable row level security;
alter table hc.batches                  enable row level security;
alter table hc.batch_location_balances  enable row level security;

revoke all on all tables in schema hc from public, anon, authenticated;
revoke all on all sequences in schema hc from public, anon, authenticated;
revoke execute on all functions in schema hc from public, anon, authenticated;

grant select on hc.user_roles, hc.buildings, hc.zones, hc.stations, hc.materials,
                hc.containers, hc.weighings, hc.batches, hc.batch_location_balances, hc.audit_logs
  to hc_app;
-- Perfiles: acceso por columnas. El correo NO es legible por el rol de aplicación (solo vía funciones de auth).
grant select (id, display_name, active, created_at) on hc.profiles to hc_app;

-- Funciones que usan las políticas y el servidor.
grant execute on function
  hc.current_actor(), hc.zone_within(uuid, uuid), hc.user_in_scope(uuid, uuid, text[]),
  hc.actor_in_scope(uuid, text[]), hc.actor_has_role(text[]), hc.actor_is_active(), hc.station_zone(uuid),
  hc.register_weighing(uuid, text, bigint, bigint, timestamptz, text, boolean, uuid),
  hc.auth_get_credentials(text), hc.auth_record_failure(uuid, integer, interval),
  hc.auth_record_success(uuid), hc.auth_create_session(uuid, text, interval),
  hc.auth_resolve_session(text), hc.auth_delete_session(text), hc.auth_record_unknown_attempt()
  to hc_app;

-- Políticas (todas TO hc_app; sin políticas para otros roles ⇒ denegado).
-- Cualquier usuario activo puede ver nombres visibles de colegas (necesario para mostrar «registrado por»).
create policy profiles_read on hc.profiles for select to hc_app using (hc.actor_is_active());
create policy user_roles_read on hc.user_roles for select to hc_app
  using (user_id = hc.current_actor() or hc.actor_has_role(array['administrador']));

create policy buildings_read on hc.buildings for select to hc_app using (hc.actor_is_active());
create policy materials_read on hc.materials for select to hc_app using (hc.actor_is_active());
create policy zones_read on hc.zones for select to hc_app using (hc.actor_in_scope(id));
create policy stations_read on hc.stations for select to hc_app using (hc.actor_in_scope(zone_id));
create policy containers_read on hc.containers for select to hc_app using (hc.actor_in_scope(hc.station_zone(station_id)));

create policy weighings_read on hc.weighings for select to hc_app using (hc.actor_in_scope(zone_id));
create policy batches_read on hc.batches for select to hc_app using (hc.actor_in_scope(origin_zone_id));
create policy balances_read on hc.batch_location_balances for select to hc_app using (hc.actor_in_scope(zone_id));

create policy audit_logs_read on hc.audit_logs for select to hc_app using (hc.actor_has_role(array['administrador']));

-- Convención para migraciones futuras: toda función nueva en hc debe revocar EXECUTE a PUBLIC y
-- otorgarlo explícitamente a hc_app solo si corresponde.
