-- Created with Claude Code (2026-11-19). The daily purge also deletes sign-in
-- attempt records, from an audit of the privacy policy against the code.
--
-- Before: auth_throttle_events (20261117120000_auth_throttle.sql) keeps a
-- SHA-256 of the email, of the email and IP, and of the IP for every counted
-- sign-in try. Old rows were deleted only inside the next claim_auth_attempt()
-- call, so with no sign-in traffic they stayed for ever.
--
-- Now purge_old_quota_rows(), which the daily reminders cron already calls
-- (web/src/lib/api/quota.ts, web/src/app/api/v1/cron/reminders/route.ts),
-- also deletes sign-in attempt records older than 1 day. No limit looks back
-- further than 1 day (the longest window is the daily cap on code checks), so
-- no limit changes. Everything it did before stays: Penny and confirmation
-- email counts older than 2 days are deleted too. It returns the total number
-- of rows deleted, and only the service role may call it, as before.
--
-- How long a row can stay: Vercel Cron runs the job once a day in the 13:00
-- UTC hour, at any point in that hour on the Hobby plan, so two runs can be up
-- to 25 hours apart. A row is deleted by the first run after it passes its
-- age (or sooner, by a claim), so, on days the job runs:
--   limit counts             2 days + up to 25 hours = 3 days and 1 hour
--   sign-in attempt records  1 day + up to 25 hours  = 2 days and 1 hour
--
-- Applied by hand in the Supabase SQL editor, after
-- 20261117110000_security_quotas.sql and 20261117120000_auth_throttle.sql:
-- cense-preview first, then production. Safe to run again. Either order with
-- the app code is safe: there is no app change, and the cron calls the same
-- function before and after.

-- Stop here if the sign-in limits table is missing: the function would still
-- be created, then fail every day, and take the limit count purge down with it.
do $$
begin
  if to_regclass('public.auth_throttle_events') is null then
    raise exception 'public.auth_throttle_events is missing: apply 20261117120000_auth_throttle.sql first';
  end if;
end;
$$;

-- Deletes limit counts older than two days and sign-in attempt records older
-- than one day, whether or not anyone claims, so a deleted student's id and
-- the hashes of an email or IP never outlive that. Run daily by the reminders
-- cron. Returns the number deleted.
create or replace function public.purge_old_quota_rows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asks integer;
  v_sends integer;
  v_auth integer;
begin
  delete from public.penny_asks where asked_at < now() - interval '2 days';
  get diagnostics v_asks = row_count;
  delete from public.confirmation_email_sends where sent_at < now() - interval '2 days';
  get diagnostics v_sends = row_count;
  delete from public.auth_throttle_events where at < now() - interval '1 day';
  get diagnostics v_auth = row_count;
  return v_asks + v_sends + v_auth;
end;
$$;

revoke execute on function public.purge_old_quota_rows() from public, anon, authenticated;
grant execute on function public.purge_old_quota_rows() to service_role;
