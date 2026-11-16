-- Created with Claude Code (2026-11-17). App-level limits on the sign-in
-- routes, from the external security audit of a8fe7d4.
--
-- Every route under web/src/app/api/v1/auth calls Supabase Auth from the
-- server, so Supabase's own per-IP limits see Vercel's addresses, which all
-- students share. These limits are counted here instead, per email and per
-- student IP (the address Vercel reports), over a sliding 10 minutes:
--
--   action     per email   per IP
--   send       5           300 (with the other sends)
--   verify     10          600 (with every check below)
--   password   10          600
--   link       none        600
--
-- send: an email code, a sign-up confirmation or a reset email. verify: an
-- emailed code. password: a password sign-in. link: opening a reset link.
-- A classroom of 40 on one campus address stays far under the IP limits; a
-- script on one email is stopped after 5 emails or 10 guesses.
--
-- auth_throttle_events: one row per counted try, holding only a SHA-256 of
-- the email or IP, the bucket and the time. Nobody but the function reads or
-- writes it: not students, not the anon key, not even the service role.
-- claim_auth_attempt() checks the limits and counts the try in one step, and
-- only the service role (the app's server) may call it. A refused try is not
-- counted, so the wait ends 10 minutes after the last counted one. Rows older
-- than 10 minutes are deleted as new ones arrive.
--
-- Applied by hand in the Supabase SQL editor before the app code that calls
-- it: cense-preview first, then production. Safe to run again.

create table if not exists public.auth_throttle_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key_hash bytea not null,
  at timestamptz not null default now()
);

create index if not exists auth_throttle_events_key_idx on public.auth_throttle_events (bucket, key_hash, at);
create index if not exists auth_throttle_events_at_idx on public.auth_throttle_events (at);

revoke all on table public.auth_throttle_events from public, anon, authenticated, service_role;
alter table public.auth_throttle_events enable row level security;

-- 0 when the try may go ahead (and it is now counted). Otherwise the seconds
-- until the next try is allowed (1 to 600), and nothing is counted.
-- p_email or p_ip may be null: that limit is then skipped.
create or replace function public.claim_auth_attempt(p_action text, p_email text, p_ip text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window constant interval := interval '10 minutes';
  v_email_limit integer;
  v_ip_bucket text;
  v_ip_limit integer;
  v_email_key bytea;
  v_ip_key bytea;
  v_count integer;
  v_oldest timestamptz;
  v_wait integer := 0;
begin
  case p_action
    when 'send' then v_email_limit := 5; v_ip_bucket := 'send:ip'; v_ip_limit := 300;
    when 'verify' then v_email_limit := 10; v_ip_bucket := 'check:ip'; v_ip_limit := 600;
    when 'password' then v_email_limit := 10; v_ip_bucket := 'check:ip'; v_ip_limit := 600;
    when 'link' then v_email_limit := null; v_ip_bucket := 'check:ip'; v_ip_limit := 600;
    else raise exception 'claim_auth_attempt: unknown action' using errcode = '22023';
  end case;

  if v_email_limit is not null and nullif(btrim(p_email), '') is not null then
    v_email_key := sha256(convert_to(lower(btrim(p_email)), 'UTF8'));
  end if;
  if nullif(btrim(p_ip), '') is not null then
    v_ip_key := sha256(convert_to(btrim(p_ip), 'UTF8'));
  end if;

  -- One claim at a time, so two tries together cannot both take the last place.
  perform pg_advisory_xact_lock(hashtext('public.claim_auth_attempt'));

  delete from public.auth_throttle_events where at <= now() - v_window;

  if v_email_key is not null then
    select count(*), min(at) into v_count, v_oldest from public.auth_throttle_events
      where bucket = p_action || ':email' and key_hash = v_email_key and at > now() - v_window;
    if v_count >= v_email_limit then
      v_wait := greatest(v_wait, ceil(extract(epoch from (v_oldest + v_window - now())))::integer);
    end if;
  end if;

  if v_ip_key is not null then
    select count(*), min(at) into v_count, v_oldest from public.auth_throttle_events
      where bucket = v_ip_bucket and key_hash = v_ip_key and at > now() - v_window;
    if v_count >= v_ip_limit then
      v_wait := greatest(v_wait, ceil(extract(epoch from (v_oldest + v_window - now())))::integer);
    end if;
  end if;

  if v_wait > 0 then
    return least(greatest(v_wait, 1), 600);
  end if;

  if v_email_key is not null then
    insert into public.auth_throttle_events (bucket, key_hash) values (p_action || ':email', v_email_key);
  end if;
  if v_ip_key is not null then
    insert into public.auth_throttle_events (bucket, key_hash) values (v_ip_bucket, v_ip_key);
  end if;
  return 0;
end;
$$;

revoke execute on function public.claim_auth_attempt(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_auth_attempt(text, text, text) to service_role;
