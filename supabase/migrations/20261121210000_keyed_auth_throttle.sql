-- Created with Claude Code (2026-11-21). Sign-in limit records keyed with a
-- secret the database never holds.
--
-- auth_throttle_events kept a plain SHA-256 of the email, of the email with
-- the IP, and of the IP. Anyone who could read the table and knew an email
-- could hash it and find that student's sign-in tries, and an IP hash could be
-- reversed by trying every IPv4 address (about 4 billion, seconds of work).
--
-- From now on the app's server computes each key as an HMAC-SHA256 with
-- AUTH_THROTTLE_KEY, a random secret kept only in Vercel's Sensitive settings
-- (web/src/lib/auth/throttle.ts), and passes only the 64-character hex results
-- here. The database never sees the email, the IP or the secret, so a copy of
-- this table is useless without the secret too. This is a "pepper": a keyed
-- hash whose key is stored apart from the data (OWASP; ENISA's guidance on
-- pseudonymising email addresses).
--
-- claim_auth_attempt_hashed() checks and counts exactly like
-- claim_auth_attempt() (20261117120000_auth_throttle.sql, which has the
-- limits table and the risk that is left); only the keys arrive ready-made.
-- p_email_ip_hash and p_email_hash are both given or both null (no email);
-- p_ip_hash is null when the IP is unknown, and the email + IP limits then
-- apply to the email alone, as before.
--
-- Applied by hand in the Supabase SQL editor BEFORE the app code that calls
-- it: cense-preview first, then production. Safe to run again. The old
-- function stays until 20261121210100_retire_unkeyed_auth_throttle.sql, which
-- runs AFTER the new code is deployed.

create or replace function public.claim_auth_attempt_hashed(
  p_action text,
  p_email_ip_hash text,
  p_email_hash text,
  p_ip_hash text
)
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_ten constant interval := interval '10 minutes';
  v_day constant interval := interval '1 day';
  v_buckets text[] := '{}';
  v_keys bytea[] := '{}';
  v_limits integer[] := '{}';
  v_windows interval[] := '{}';
  v_email_ip bytea;
  v_email_key bytea;
  v_ip_key bytea;
  v_lock bigint;
  v_count integer;
  v_oldest timestamptz;
  v_wait integer := 0;
  i integer;
begin
  if p_action is null or p_action not in ('send', 'verify', 'password', 'link') then
    raise exception 'claim_auth_attempt_hashed: unknown action' using errcode = '22023';
  end if;
  if (p_email_ip_hash is null) <> (p_email_hash is null) then
    raise exception 'claim_auth_attempt_hashed: give both email keys or neither' using errcode = '22023';
  end if;
  if p_email_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'claim_auth_attempt_hashed: a key is not a SHA-256 in hex' using errcode = '22023';
  end if;

  v_email_ip := decode(p_email_ip_hash, 'hex');
  v_email_key := decode(p_email_hash, 'hex');
  v_ip_key := decode(p_ip_hash, 'hex');

  if v_email_key is not null and p_action <> 'link' then
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

  if v_ip_key is not null then
    v_buckets := v_buckets || case when p_action = 'send' then 'send:ip' else 'check:ip' end;
    v_keys := v_keys || v_ip_key;
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

revoke execute on function public.claim_auth_attempt_hashed(text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_auth_attempt_hashed(text, text, text, text) to service_role;
