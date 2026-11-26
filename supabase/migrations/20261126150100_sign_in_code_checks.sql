-- Created with Claude Code (2026-11-26). A sign-in code dies after 5 wrong
-- tries, and one address can make only so many wrong tries, from the
-- testathon report that the emailed 6-digit code could be guessed at about
-- 29 tries a second.
--
-- The time limits (claim_auth_attempt_hashed(),
-- 20261121210000_keyed_auth_throttle.sql) still apply first. This adds, for
-- every code check (/auth/email/verify and /auth/password/signup/confirm):
--
--   bucket            key     limit  window   cleared
--   code:email:day    email   5      1 day    when a new code is sent
--   code:ip           IP      60     10 min   a right code does not count
--
-- The email key is the email lowercased and trimmed with its +tag KEPT
-- (label code_email in web/src/lib/auth/throttle.ts): Supabase treats
-- ana+1@x.com as its own account with its own code, so a code sent to it must
-- never restart ana@x.com's count. There is no daily IP cap: a prankster on a
-- shared network (Demo Day WiFi) could otherwise lock everyone on it out for
-- a day. The per-code limit is the real protection.
--
-- Per email: after 5 checks since the last code was sent, every check is
-- refused, even with the right code, until the student asks for a new one.
-- The window is a day, longer than any code can last (Supabase allows at most
-- 86400 seconds), so the count never runs out before the code does. Counted
-- by the email alone, whether or not it has an account, so the answer never
-- says which.
--
-- Per IP: only wrong codes count. Each check reserves a place before the code
-- is checked; a right code gives its own place back, so a room of students
-- signing in together uses almost none, and someone guessing codes for many
-- emails from one address is stopped after 60 wrong ones in 10 minutes. Off
-- Vercel the IP is unknown and this is skipped.
--
-- Places are taken before Supabase checks the code, with the keys locked, so
-- requests sent in parallel cannot all slip past the count: the sixth of 50
-- parallel guesses is already refused.
--
-- What is left: someone who knows a student's email can make 5 wrong tries
-- and kill that student's code; the student asks for a new one (Resend
-- email). A new code clears only checks claimed before its send began, so
-- guesses made while it was being sent still count against it; checks
-- claimed just before and still in flight (at most 5) can reach it. The
-- per-email cap of 50 code checks a day still bounds all of it. These limits
-- cover the app's routes only: Supabase Auth's /auth/v1/verify can be called
-- directly with the public key, which only the hosted Auth settings limit
-- (README, "Supabase Auth settings").
--
-- auth_code_check(step, email_hash, ip_hash, send_ms), keys made by the app's server
-- with AUTH_THROTTLE_KEY exactly as for claim_auth_attempt_hashed():
--   'claim'     before a code check: 0 go ahead (place taken), -1 this code
--               has had 5 tries (ask for a new one), or the seconds to wait
--               when the IP is over its limit. A refused check takes no place.
--   'passed'    after a right code: gives that check's IP place back.
--   'new_code'  after a new code is sent: clears the email's checks claimed
--               before the send began, send_ms milliseconds ago.
-- Rows live in auth_throttle_events like every other sign-in count, so the
-- daily purge deletes them after a day. Only the service role may call it.
--
-- Applied by hand in the Supabase SQL editor BEFORE the app code that calls
-- it (cense-preview first, then production): without it, that code refuses
-- code checks with 503 sign_in_busy. Safe to run again.
-- Rollback: supabase/rollbacks/20261126150100_sign_in_code_checks.down.sql,
-- after rolling back the app.

create or replace function public.auth_code_check(p_step text, p_email_hash text, p_ip_hash text, p_send_ms integer)
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_ten constant interval := interval '10 minutes';
  v_day constant interval := interval '1 day';
  v_email bytea;
  v_ip bytea;
  v_buckets text[] := '{}';
  v_keys bytea[] := '{}';
  v_lock bigint;
  v_count integer;
  v_oldest timestamptz;
  v_wait integer := 0;
begin
  if p_step is null or p_step not in ('claim', 'passed', 'new_code') then
    raise exception 'auth_code_check: unknown step' using errcode = '22023';
  end if;
  if p_email_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'auth_code_check: a key is not a SHA-256 in hex' using errcode = '22023';
  end if;
  v_email := decode(p_email_hash, 'hex');
  v_ip := decode(p_ip_hash, 'hex');

  if v_email is not null and p_step in ('claim', 'new_code') then
    v_buckets := v_buckets || 'code:email:day'::text;
    v_keys := v_keys || v_email;
  end if;
  if v_ip is not null and p_step in ('claim', 'passed') then
    v_buckets := v_buckets || 'code:ip'::text;
    v_keys := v_keys || v_ip;
  end if;
  if coalesce(array_length(v_buckets, 1), 0) = 0 then
    return 0;
  end if;

  -- The same locks, in the same order, as claim_auth_attempt_hashed(), on
  -- this step's own keys only.
  for v_lock in
    select distinct hashtextextended(b || ':' || encode(k, 'hex'), 0)
    from unnest(v_buckets, v_keys) as t(b, k)
    order by 1
  loop
    perform pg_advisory_xact_lock(v_lock);
  end loop;

  if p_step = 'new_code' then
    -- Checks claimed since the send began may already have met the new code.
    delete from public.auth_throttle_events
      where bucket = 'code:email:day' and key_hash = v_email
        and at < now() - make_interval(secs => greatest(coalesce(p_send_ms, 0), 0) / 1000.0);
    return 0;
  end if;

  if p_step = 'passed' then
    delete from public.auth_throttle_events where id = (
      select id from public.auth_throttle_events
      where bucket = 'code:ip' and key_hash = v_ip
      order by at desc, id desc limit 1
    );
    return 0;
  end if;

  if v_ip is not null then
    select count(*), min(at) into v_count, v_oldest from public.auth_throttle_events
      where bucket = 'code:ip' and key_hash = v_ip and at > now() - v_ten;
    if v_count >= 60 then
      v_wait := greatest(v_wait, ceil(extract(epoch from (v_oldest + v_ten - now())))::integer);
    end if;
    if v_wait > 0 then
      return least(greatest(v_wait, 1), 86400);
    end if;
  end if;

  if v_email is not null then
    select count(*) into v_count from public.auth_throttle_events
      where bucket = 'code:email:day' and key_hash = v_email and at > now() - v_day;
    if v_count >= 5 then
      return -1;
    end if;
  end if;

  insert into public.auth_throttle_events (bucket, key_hash)
    select b, k from unnest(v_buckets, v_keys) as t(b, k);
  return 0;
end;
$$;

revoke execute on function public.auth_code_check(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.auth_code_check(text, text, text, integer) to service_role;
