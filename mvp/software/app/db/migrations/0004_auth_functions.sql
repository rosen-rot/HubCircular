-- 0004 · Funciones de autenticación local (SECURITY DEFINER)
-- El rol de la aplicación NO tiene acceso directo a hc.local_credentials ni hc.local_sessions.
-- Reemplazable por Supabase Auth (ADR-002) sin tocar el resto del modelo.

create function hc.auth_get_credentials(p_email text)
returns table (user_id uuid, active boolean, password_hash text, failed_attempts integer, locked_until timestamptz)
language sql stable security definer set search_path = hc, pg_temp as $$
  select p.id, p.active, c.password_hash, c.failed_attempts, c.locked_until
    from hc.profiles p
    join hc.local_credentials c on c.user_id = p.id
   where p.email = lower(btrim(p_email))
$$;

-- Registra un fallo; bloquea la cuenta p_lock tras p_max fallos consecutivos. Devuelve locked_until (o NULL).
create function hc.auth_record_failure(p_user uuid, p_max integer, p_lock interval)
returns timestamptz
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v_until timestamptz;
begin
  update hc.local_credentials c
     set failed_attempts = case when c.failed_attempts + 1 >= p_max then 0 else c.failed_attempts + 1 end,
         locked_until    = case when c.failed_attempts + 1 >= p_max then now() + p_lock else c.locked_until end,
         updated_at      = now()
   where c.user_id = p_user
   returning c.locked_until into v_until;
  insert into hc.audit_logs (actor_id, entity, entity_id, action, new_summary)
  values (p_user, 'auth', p_user::text, case when v_until is not null and v_until > now() then 'login_locked' else 'login_failed' end, null);
  return v_until;
end $$;

create function hc.auth_record_success(p_user uuid) returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
begin
  update hc.local_credentials set failed_attempts = 0, locked_until = null, updated_at = now() where user_id = p_user;
  insert into hc.audit_logs (actor_id, entity, entity_id, action) values (p_user, 'auth', p_user::text, 'login_ok');
end $$;

create function hc.auth_create_session(p_user uuid, p_token_hash text, p_ttl interval)
returns timestamptz
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v_exp timestamptz := now() + p_ttl;
begin
  delete from hc.local_sessions where expires_at <= now();
  insert into hc.local_sessions (user_id, token_hash, expires_at) values (p_user, p_token_hash, v_exp);
  return v_exp;
end $$;

-- Devuelve el usuario y sus roles si la sesión es válida (no expirada, usuario activo).
create function hc.auth_resolve_session(p_token_hash text)
returns table (user_id uuid, email text, display_name text, roles jsonb)
language plpgsql security definer set search_path = hc, pg_temp as $$
begin
  return query
  select p.id, p.email, p.display_name,
         coalesce((select jsonb_agg(jsonb_build_object('role', ur.role, 'zoneId', ur.zone_id) order by ur.role)
                     from hc.user_roles ur where ur.user_id = p.id), '[]'::jsonb)
    from hc.local_sessions s
    join hc.profiles p on p.id = s.user_id
   where s.token_hash = p_token_hash and s.expires_at > now() and p.active;
  update hc.local_sessions set last_seen_at = now() where token_hash = p_token_hash and expires_at > now();
end $$;

create function hc.auth_delete_session(p_token_hash text) returns void
language plpgsql security definer set search_path = hc, pg_temp as $$
declare v_user uuid;
begin
  delete from hc.local_sessions where token_hash = p_token_hash returning user_id into v_user;
  if v_user is not null then
    insert into hc.audit_logs (actor_id, entity, entity_id, action) values (v_user, 'auth', v_user::text, 'logout');
  end if;
end $$;

-- Intento fallido con correo desconocido: se audita SIN almacenar el valor ingresado.
create function hc.auth_record_unknown_attempt() returns void
language sql security definer set search_path = hc, pg_temp as $$
  insert into hc.audit_logs (actor_id, entity, action) values (null, 'auth', 'login_unknown_user')
$$;
