-- 0006 · Endurecimiento para PostgreSQL gestionado (Supabase) — Iteración 1.5
-- Idempotente y sin cambios de datos. Objetivos:
--   1. Fallar de forma explícita si el rol que migra no puede usar SET ROLE hc_app (0001 solo avisaba).
--   2. Garantizar que `anon`, `authenticated` y PUBLIC no tengan NINGÚN privilegio sobre el esquema hc,
--      aunque la plataforma (Supabase) aplique privilegios por defecto a objetos nuevos.
--   3. Documentar el esquema para quien lo vea en el panel.

do $$
begin
  if not (select rolsuper from pg_roles where rolname = current_user)
     and not pg_has_role(current_user, 'hc_app', 'MEMBER') then
    raise exception 'El rol de migración (%) no es miembro de hc_app: la aplicación no podrá hacer SET ROLE. Ejecute GRANT hc_app TO <rol>;', current_user;
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema hc from %I', r);
      execute format('revoke all on all tables in schema hc from %I', r);
      execute format('revoke all on all sequences in schema hc from %I', r);
      execute format('revoke all on all functions in schema hc from %I', r);
      execute format('alter default privileges in schema hc revoke all on tables from %I', r);
      execute format('alter default privileges in schema hc revoke all on sequences from %I', r);
      execute format('alter default privileges in schema hc revoke all on functions from %I', r);
    end if;
  end loop;
end $$;

revoke all on all tables in schema hc from public;
revoke all on all sequences in schema hc from public;
revoke all on all functions in schema hc from public;
alter default privileges in schema hc revoke all on functions from public;

comment on schema hc is 'HubCircular: esquema privado de la aplicación. No exponer en la Data API de Supabase. Acceso solo vía rol hc_app (RLS + funciones SECURITY DEFINER).';
