-- Created with Claude Code (2026-11-19). Undoes
-- 20261119090000_purge_auth_attempts.sql: puts back purge_old_quota_rows() as
-- 20261117110000_security_quotas.sql made it, deleting only Penny and
-- confirmation email counts older than two days. Sign-in attempt records are
-- then deleted only by claim_auth_attempt() again, so with no sign-in traffic
-- they stay. No app change is needed either way. Safe to run again.

-- Deletes quota rows older than two days, whether or not anyone claims, so a
-- deleted student's id never outlives that. Run daily by the reminders cron.
-- Returns the number deleted.
create or replace function public.purge_old_quota_rows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asks integer;
  v_sends integer;
begin
  delete from public.penny_asks where asked_at < now() - interval '2 days';
  get diagnostics v_asks = row_count;
  delete from public.confirmation_email_sends where sent_at < now() - interval '2 days';
  get diagnostics v_sends = row_count;
  return v_asks + v_sends;
end;
$$;

revoke execute on function public.purge_old_quota_rows() from public, anon, authenticated;
grant execute on function public.purge_old_quota_rows() to service_role;
