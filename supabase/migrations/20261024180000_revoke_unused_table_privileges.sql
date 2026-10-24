-- Remove table privileges the app never uses from anon and authenticated.
--
-- Supabase's default privileges give anon and authenticated more than the
-- grants our migrations make, including TRUNCATE, REFERENCES and TRIGGER on
-- every new table in public. The Data API cannot use them, so this is hardening,
-- not a fix for a live hole. SELECT, INSERT and UPDATE grants and every
-- row level security policy are left exactly as they were. service_role keeps
-- its privileges.

do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, references, trigger on table %I.%I from anon, authenticated',
      t.schemaname, t.tablename
    );
  end loop;
end;
$$;

-- Tables created later by the role running migrations (postgres) stop
-- getting these three privileges by default.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
