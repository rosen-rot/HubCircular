-- 0009 · Vínculo con Supabase Auth como segundo proveedor de identidad (ADR-021)
-- Supabase Auth SOLO verifica la identidad (correo + contraseña). La autorización (roles, zonas, RLS),
-- la sesión de la aplicación y la auditoría siguen siendo de HubCircular. No se usa service_role.

alter table hc.profiles add column auth_user_id uuid null;
create unique index profiles_auth_user_id_key on hc.profiles (auth_user_id) where auth_user_id is not null;
comment on column hc.profiles.auth_user_id is 'auth.users.id de Supabase Auth; se fija en el primer ingreso verificado (correo confirmado). No legible por hc_app (permisos por columna).';

-- Vincula (o reconoce) el perfil con la identidad verificada por Supabase Auth.
--  · Solo vincula perfiles que el administrador YA creó y que están activos: registrarse en Supabase no da acceso.
--  · Si el perfil ya está vinculado a OTRA identidad, no hay acceso (evita la toma de cuenta por homónimo de correo).
--  · Devuelve cero filas ante cualquier rechazo (respuesta uniforme para la aplicación).
create function hc.auth_link_supabase(p_email text, p_auth_user uuid)
returns table (o_user_id uuid)
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v hc.profiles%rowtype;
begin
  if p_auth_user is null then
    return;
  end if;
  select * into v from hc.profiles p where p.email = lower(btrim(coalesce(p_email, ''))) for update;
  if v.id is null or not v.active then
    return;
  end if;
  if v.auth_user_id is null then
    begin
      update hc.profiles set auth_user_id = p_auth_user where id = v.id;
    exception when unique_violation then
      return; -- esa identidad ya pertenece a otro perfil
    end;
    insert into hc.audit_logs (actor_id, entity, entity_id, action) values (v.id, 'auth', v.id::text, 'auth_linked_supabase');
  elsif v.auth_user_id <> p_auth_user then
    return;
  end if;
  return query select v.id;
end $$;

-- Alta sin contraseña local (modo Supabase Auth): el perfil se crea sin credencial local.
-- Misma función y firma de 0008; solo se relaja la exigencia de hash cuando es NULL.
create or replace function hc.admin_create_user(p_actor uuid, p_email text, p_name text, p_role text, p_zone_id uuid, p_password_hash text)
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
  if p_password_hash is not null and (p_password_hash not like 'scrypt$%' or char_length(p_password_hash) > 400) then
    raise exception using errcode = 'HC422', message = 'validation';
  end if;

  begin
    insert into hc.profiles (email, display_name) values (v_email, v_name) returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = 'HC409', message = 'user_exists';
  end;
  if p_password_hash is not null then
    insert into hc.local_credentials (user_id, password_hash, must_change_password) values (v_id, p_password_hash, true);
  end if;
  insert into hc.user_roles (user_id, role, zone_id) values (v_id, p_role, p_zone_id);
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_actor, 'user', v_id::text, 'create', jsonb_build_object('role', p_role, 'zoneId', p_zone_id));
  return query select v_id;
end $$;

revoke all on function hc.auth_link_supabase(text, uuid) from public, anon, authenticated;
grant execute on function hc.auth_link_supabase(text, uuid) to hc_app;
