-- 0008 · Gestión de usuarios (solo administrador) y cambio de contraseña
-- Autenticación LOCAL (ADR-002/014). Las claves se hashean en la aplicación (scrypt); la BD solo recibe y guarda el hash.
-- Todas las funciones son SECURITY DEFINER (search_path = hc, pg_temp), exigen que el actor de la transacción
-- coincida con p_actor (hc._require_actor, definida en 0007) y auditan sin guardar claves ni hashes.
-- Reglas: no se puede desactivar a uno mismo, ni quedar sin administradores activos con acceso a todas las zonas,
-- ni dejar a un usuario sin roles. Desactivar o restablecer la clave revoca las sesiones del usuario.

alter table hc.local_credentials add column must_change_password boolean not null default false;

-- Nueva versión de resolve_session: agrega must_change_password al final (los clientes con `select *` no se rompen).
drop function hc.auth_resolve_session(text);
create function hc.auth_resolve_session(p_token_hash text)
returns table (user_id uuid, email text, display_name text, roles jsonb, must_change_password boolean)
language plpgsql security definer set search_path = hc, pg_temp as $$
begin
  return query
  select p.id, p.email, p.display_name,
         coalesce((select jsonb_agg(jsonb_build_object('role', ur.role, 'zoneId', ur.zone_id) order by ur.role)
                     from hc.user_roles ur where ur.user_id = p.id), '[]'::jsonb),
         coalesce((select c.must_change_password from hc.local_credentials c where c.user_id = p.id), false)
    from hc.local_sessions s
    join hc.profiles p on p.id = s.user_id
   where s.token_hash = p_token_hash and s.expires_at > now() and p.active;
  update hc.local_sessions set last_seen_at = now() where token_hash = p_token_hash and expires_at > now();
end $$;

-- ¿Quedaría al menos un administrador activo con acceso a todas las zonas si se excluye este usuario / este rol?
create function hc._other_active_admins(p_exclude_user uuid, p_exclude_role uuid) returns bigint
language sql stable security definer set search_path = hc, pg_temp as $$
  select count(distinct ur.user_id)
    from hc.user_roles ur join hc.profiles p on p.id = ur.user_id and p.active
   where ur.role = 'administrador' and ur.zone_id is null
     and ur.user_id is distinct from p_exclude_user
     and ur.id is distinct from p_exclude_role
$$;

create function hc.admin_list_users(p_actor uuid)
returns table (user_id uuid, email text, display_name text, active boolean, must_change_password boolean,
               locked_until timestamptz, last_login_at timestamptz, roles jsonb)
language plpgsql stable security definer set search_path = hc, pg_temp as $$
begin
  perform hc._require_actor(p_actor, array['administrador']);
  return query
  select p.id, p.email, p.display_name, p.active,
         coalesce(c.must_change_password, false),
         case when c.locked_until > now() then c.locked_until end,
         (select max(a.occurred_at) from hc.audit_logs a where a.entity = 'auth' and a.action = 'login_ok' and a.entity_id = p.id::text),
         coalesce((select jsonb_agg(jsonb_build_object('id', ur.id, 'role', ur.role, 'zoneId', ur.zone_id, 'zoneName', z.name)
                                    order by ur.role, z.name)
                     from hc.user_roles ur left join hc.zones z on z.id = ur.zone_id where ur.user_id = p.id), '[]'::jsonb)
    from hc.profiles p
    left join hc.local_credentials c on c.user_id = p.id
   order by p.active desc, p.display_name, p.email;
end $$;

create function hc.admin_create_user(p_actor uuid, p_email text, p_name text, p_role text, p_zone_id uuid, p_password_hash text)
returns table (o_user_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'HC422', message = 'email_invalid';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  if p_role is null or p_role not in ('administrador', 'operador', 'lector') then
    raise exception using errcode = 'HC422', message = 'role_invalid';
  end if;
  if p_zone_id is not null and not exists (select 1 from hc.zones z where z.id = p_zone_id and z.active) then
    raise exception using errcode = 'HC422', message = 'zone_invalid';
  end if;
  if p_password_hash is null or p_password_hash not like 'scrypt$%' or char_length(p_password_hash) > 400 then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;

  begin
    insert into hc.profiles (email, display_name) values (v_email, v_name) returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'HC409', message = 'user_exists';
  end;
  insert into hc.local_credentials (user_id, password_hash, must_change_password) values (v_id, p_password_hash, true);
  insert into hc.user_roles (user_id, role, zone_id) values (v_id, p_role, p_zone_id);
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'user', v_id::text, 'create', jsonb_build_object('role', p_role, 'zoneId', p_zone_id));
  return query select v_id;
end $$;

create function hc.admin_set_user_active(p_actor uuid, p_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v hc.profiles%rowtype;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if p_active is null then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  select * into v from hc.profiles p where p.id = p_user_id for update;
  if v.id is null then
    raise exception using errcode = 'HC404', message = 'user_not_found';
  end if;
  if v.active = p_active then
    return;
  end if;
  if not p_active then
    if v.id = p_actor then
      raise exception using errcode = 'HC422', message = 'cannot_deactivate_self';
    end if;
    if exists (select 1 from hc.user_roles ur where ur.user_id = v.id and ur.role = 'administrador' and ur.zone_id is null)
       and hc._other_active_admins(v.id, null) = 0 then
      raise exception using errcode = 'HC422', message = 'last_admin';
    end if;
    delete from hc.local_sessions where user_id = v.id;
  end if;
  update hc.profiles set active = p_active where id = v.id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, old_summary, new_summary)
  values (p_actor, 'user', v.id::text, 'set_active', jsonb_build_object('active', v.active), jsonb_build_object('active', p_active));
end $$;

create function hc.admin_add_role(p_actor uuid, p_user_id uuid, p_role text, p_zone_id uuid)
returns table (o_role_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v_id uuid;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if not exists (select 1 from hc.profiles p where p.id = p_user_id) then
    raise exception using errcode = 'HC404', message = 'user_not_found';
  end if;
  if p_role is null or p_role not in ('administrador', 'operador', 'lector') then
    raise exception using errcode = 'HC422', message = 'role_invalid';
  end if;
  if p_zone_id is not null and not exists (select 1 from hc.zones z where z.id = p_zone_id and z.active) then
    raise exception using errcode = 'HC422', message = 'zone_invalid';
  end if;
  begin
    insert into hc.user_roles (user_id, role, zone_id) values (p_user_id, p_role, p_zone_id) returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'HC409', message = 'role_exists';
  end;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'user', p_user_id::text, 'add_role', jsonb_build_object('role', p_role, 'zoneId', p_zone_id));
  return query select v_id;
end $$;

create function hc.admin_remove_role(p_actor uuid, p_role_id uuid)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare r hc.user_roles%rowtype;
begin
  perform hc._require_actor(p_actor, array['administrador']);
  select * into r from hc.user_roles ur where ur.id = p_role_id for update;
  if r.id is null then
    raise exception using errcode = 'HC404', message = 'role_not_found';
  end if;
  perform 1 from hc.profiles p where p.id = r.user_id for update;
  if (select count(*) from hc.user_roles ur where ur.user_id = r.user_id) <= 1 then
    raise exception using errcode = 'HC422', message = 'last_role';
  end if;
  if r.role = 'administrador' and r.zone_id is null and hc._other_active_admins(null, r.id) = 0
     and exists (select 1 from hc.profiles p where p.id = r.user_id and p.active) then
    raise exception using errcode = 'HC422', message = 'last_admin';
  end if;
  delete from hc.user_roles where id = r.id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, old_summary)
  values (p_actor, 'user', r.user_id::text, 'remove_role', jsonb_build_object('role', r.role, 'zoneId', r.zone_id));
end $$;

create function hc.admin_reset_password(p_actor uuid, p_user_id uuid, p_password_hash text)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
begin
  perform hc._require_actor(p_actor, array['administrador']);
  if p_password_hash is null or p_password_hash not like 'scrypt$%' or char_length(p_password_hash) > 400 then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  if p_user_id = p_actor then
    raise exception using errcode = 'HC422', message = 'cannot_reset_self';
  end if;
  perform 1 from hc.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception using errcode = 'HC404', message = 'user_not_found';
  end if;
  insert into hc.local_credentials (user_id, password_hash, must_change_password)
  values (p_user_id, p_password_hash, true)
  on conflict (user_id) do update
    set password_hash = excluded.password_hash, must_change_password = true,
        failed_attempts = 0, locked_until = null, updated_at = now();
  delete from hc.local_sessions where user_id = p_user_id;
  insert into hc.audit_logs (actor_id, entity, entity_id, action)
  values (p_actor, 'user', p_user_id::text, 'reset_password');
end $$;

-- Cambio de la propia clave. La aplicación ya verificó la clave actual; se cierran las demás sesiones del usuario.
create function hc.auth_change_password(p_actor uuid, p_new_hash text, p_keep_token_hash text)
returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
begin
  perform hc._require_actor(p_actor, array['administrador', 'operador', 'lector']);
  if p_new_hash is null or p_new_hash not like 'scrypt$%' or char_length(p_new_hash) > 400 then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  update hc.local_credentials
     set password_hash = p_new_hash, must_change_password = false, failed_attempts = 0, locked_until = null, updated_at = now()
   where user_id = p_actor;
  if not found then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;
  delete from hc.local_sessions where user_id = p_actor and token_hash is distinct from p_keep_token_hash;
  insert into hc.audit_logs (actor_id, entity, entity_id, action)
  values (p_actor, 'user', p_actor::text, 'change_password');
end $$;

revoke all on function
  hc.auth_resolve_session(text),
  hc._other_active_admins(uuid, uuid),
  hc.admin_list_users(uuid),
  hc.admin_create_user(uuid, text, text, text, uuid, text),
  hc.admin_set_user_active(uuid, uuid, boolean),
  hc.admin_add_role(uuid, uuid, text, uuid),
  hc.admin_remove_role(uuid, uuid),
  hc.admin_reset_password(uuid, uuid, text),
  hc.auth_change_password(uuid, text, text)
  from public, anon, authenticated;

grant execute on function
  hc.auth_resolve_session(text),
  hc.admin_list_users(uuid),
  hc.admin_create_user(uuid, text, text, text, uuid, text),
  hc.admin_set_user_active(uuid, uuid, boolean),
  hc.admin_add_role(uuid, uuid, text, uuid),
  hc.admin_remove_role(uuid, uuid),
  hc.admin_reset_password(uuid, uuid, text),
  hc.auth_change_password(uuid, text, text)
  to hc_app;
