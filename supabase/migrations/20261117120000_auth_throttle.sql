-- Created with Claude Code (2026-11-17). App-level limits on the sign-in
-- routes, from the external security audit of a8fe7d4.
--
-- Every route under web/src/app/api/v1/auth calls Supabase Auth from the
-- server, so Supabase's own per-IP limits see Vercel's addresses, which all
-- students share. These limits are counted here instead.
--
--   action     email + IP    email alone     IP alone
--   send       5 / 10 min    30 / 10 min     300 / 10 min (sends)
--   verify     10 / 10 min   50 / day        600 / 10 min (all checks)
--              20 / day
--   password   10 / 10 min   50 / 10 min     600 / 10 min (all checks)
--   link       none          none            600 / 10 min (all checks)
--
-- send: an email code, a sign-up confirmation or a reset email. verify: an
-- emailed code. password: a password sign-in. link: opening a reset link.
-- Windows slide; "day" is the last 24 hours.
--
-- The tight limits are per email AND IP, so they count the asker's own tries:
-- a script on one address is stopped after 5 emails or 10 guesses, but cannot
-- use up a student's tries from somewhere else. The looser per-email ceilings
-- stop a guessing attack spread over many addresses. A 6-digit code lasts 10
-- minutes (otp_expiry), and with at most 50 checks per email a day the chance
-- of guessing one is about 1 in 20,000 a day per email: small, not zero.
--
-- What is left (residual risk): an attacker with many addresses can still
-- reach the per-email ceilings and block that email for a while (emails and
-- password tries for up to 10 minutes; code checks for up to a day, which
-- takes at least 3 addresses since one can spend only 20 of the 50). Google
-- sign-in is never blocked. A whole campus behind one address shares the IP
-- limits, which a class of 40 signing up together stays far under.
--
-- Emails are counted lowercased, trimmed and without a +tag in the local
-- part, so a+1@x.com and a+2@x.com share a count. The app groups IPv6
-- addresses by their /64 before they get here (web/src/lib/auth/throttle.ts).
-- When the IP is unknown (off Vercel), the email + IP limits apply to the
-- email alone.
--
-- auth_throttle_events: one row per counted try per limit, holding only a
-- SHA-256 of the key, the bucket and the time. Nobody but the function reads
-- or writes it: not students, not the anon key, not even the service role.
-- claim_auth_attempt() checks every limit and counts the try in one step, and
-- only the service role (the app's server) may call it. A refused try is not
-- counted. Each claim locks only its own keys, so a flood on one key never
-- holds up anyone else; a lock wait over 2 seconds fails the call, and the
-- app then refuses code and password checks (503) and lets emails through.
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

-- The email as counted: lowercased, trimmed, any +tag dropped from the local
-- part. Null for an empty value.
create or replace function public.auth_throttle_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_email, ''))), '^([^+@]*)\+[^@]*@', '\1@'), '');
$$;

revoke execute on function public.auth_throttle_email(text) from public, anon, authenticated;

-- 0 when the try may go ahead (and it is now counted). Otherwise the seconds
-- until the next try is allowed (1 to 86400), and nothing is counted.
-- p_email or p_ip may be null: the limits that need it are then skipped.
create or replace function public.claim_auth_attempt(p_action text, p_email text, p_ip text)
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_email text := public.auth_throttle_email(p_email);
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_ten constant interval := interval '10 minutes';
  v_day constant interval := interval '1 day';
  v_buckets text[] := '{}';
  v_keys bytea[] := '{}';
  v_limits integer[] := '{}';
  v_windows interval[] := '{}';
  v_email_ip bytea;
  v_email_key bytea;
  v_lock bigint;
  v_count integer;
  v_oldest timestamptz;
  v_wait integer := 0;
  i integer;
begin
  if p_action is null or p_action not in ('send', 'verify', 'password', 'link') then
    raise exception 'claim_auth_attempt: unknown action' using errcode = '22023';
  end if;

  if v_email is not null and p_action <> 'link' then
    v_email_ip := sha256(convert_to(v_email || '|' || coalesce(v_ip, ''), 'UTF8'));
    v_email_key := sha256(convert_to(v_email, 'UTF8'));
    if p_action = 'send' then
      v_buckets := v_buckets || array['send:email_ip', 'send:email'];
      v_keys := v_keys || array[v_email_ip, v_email_key];
      v_limits := v_limits || array[5, 30];
      v_windows := v_windows || array[v_ten, v_ten];
    elsif p_action = 'verify' then
      v_buckets := v_buckets || array['verify:email_ip', 'verify:email_ip:day', 'verify:email:day'];
      v_keys := v_keys || array[v_email_ip, v_email_ip, v_email_key];
      v_limits := v_limits || array[10, 20, 50];
      v_windows := v_windows || array[v_ten, v_day, v_day];
    else
      v_buckets := v_buckets || array['password:email_ip', 'password:email'];
      v_keys := v_keys || array[v_email_ip, v_email_key];
      v_limits := v_limits || array[10, 50];
      v_windows := v_windows || array[v_ten, v_ten];
    end if;
  end if;

  if v_ip is not null then
    v_buckets := v_buckets || case when p_action = 'send' then 'send:ip' else 'check:ip' end;
    v_keys := v_keys || sha256(convert_to(v_ip, 'UTF8'));
    v_limits := v_limits || case when p_action = 'send' then 300 else 600 end;
    v_windows := v_windows || v_ten;
  end if;

  if coalesce(array_length(v_buckets, 1), 0) = 0 then
    return 0;
  end if;

  -- Only this claim's own keys are locked, always in the same order, so two
  -- tries on one key cannot both take its last place and nothing deadlocks.
  for v_lock in
    select distinct hashtextextended(b || ':' || encode(k, 'hex'), 0)
    from unnest(v_buckets, v_keys) as t(b, k)
    order by 1
  loop
    perform pg_advisory_xact_lock(v_lock);
  end loop;

  -- Old rows go a few at a time; rows another claim is deleting are skipped.
  delete from public.auth_throttle_events where id in (
    select id from public.auth_throttle_events
    where at <= now() - v_ten and (bucket not like '%:day' or at <= now() - v_day)
    order by at
    limit 500
    for update skip locked
  );

  for i in 1 .. array_length(v_buckets, 1) loop
    select count(*), min(at) into v_count, v_oldest from public.auth_throttle_events
      where bucket = v_buckets[i] and key_hash = v_keys[i] and at > now() - v_windows[i];
    if v_count >= v_limits[i] then
      v_wait := greatest(v_wait, ceil(extract(epoch from (v_oldest + v_windows[i] - now())))::integer);
    end if;
  end loop;

  if v_wait > 0 then
    return least(greatest(v_wait, 1), 86400);
  end if;

  insert into public.auth_throttle_events (bucket, key_hash)
    select b, k from unnest(v_buckets, v_keys) as t(b, k);
  return 0;
end;
$$;

revoke execute on function public.claim_auth_attempt(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_auth_attempt(text, text, text) to service_role;
