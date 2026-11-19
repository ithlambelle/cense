-- Created with Claude Code (2026-11-17). Fixes from the external security
-- audit of commit a8fe7d4: the Ask Penny and confirmation email limits, the
-- deleted-account Plaid cleanup queue, and row level security on the plaid
-- schema.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production. Safe to run again. Either order with the app code is safe: the
-- new app code falls back to the old claim functions while this migration is
-- missing (web/src/lib/api/quota.ts), and with the old app code still live,
-- this migration only skips confirmation emails and turns typed Penny
-- questions off until the new code is deployed. Deploy the code first.
--
-- 1. Daily limits (penny_asks, confirmation_email_sends).
--    Before: the per-student day started at midnight in profiles.time_zone,
--    which the student can change, so switching to a zone that just passed
--    midnight reset the count. Both tables cascaded on account deletion, so
--    deleting the account reset the shared count too. And any signed-in
--    student could call the claim functions directly and use up the shared
--    allowance (300 typed questions, 100 emails) for everyone.
--    Now:
--    - every count is a rolling 24 hours (the last 24 hours, whoever asks and
--      wherever they are), so no setting moves the window;
--    - the rows keep only the student's id and the time, with no foreign key,
--      so they outlive the account and the shared count cannot be reset.
--      They are deleted once two days old: by each claim, and every day by
--      purge_old_quota_rows() from the reminders cron, so a deleted
--      student's id is gone within two days even when nobody asks or saves;
--    - the claims take the student's id as an argument and only the service
--      role may call them. The server passes the id from the verified session
--      (web/src/app/api/v1/penny/route.ts,
--      web/src/lib/reminders/send-confirmation.ts).
--    The limits are unchanged: 20 typed questions per student and 300 in all;
--    5 confirmation emails per student and 100 in all.
--
-- 2. Deleted-account Plaid cleanup (plaid.account_cleanup).
--    save_bank_link stored whatever ciphertext it was given, so a student
--    could save garbage and delete the account, leaving a row that can never
--    be decrypted and fails the cleanup check every day. Now the app tells
--    finish_plaid_account_cleanup why a removal failed (p_reason):
--    - 'undecryptable': the token does not open with the configured key.
--      Only these failures are counted (unreadable_failures); after 5 in a
--      row (about five days of daily retries, each one failing the cleanup
--      check) the row is given up (gave_up_at) and no longer claimed. The run
--      that gives it up still reports fail to the cleanup check, once, and
--      logs plaid_cleanup_gave_up;
--    - 'plaid_error' (Plaid refused or could not be reached) and
--      'not_configured' (no Plaid settings): retried every day for ever, and
--      the check keeps failing, as before. A token that opens proves the key
--      is right, so a plaid_error also resets the unreadable count;
--    - claims alone (a worker that crashed mid-lease) count nothing.
--    A given-up row is kept encrypted, never deleted. If a key was missing or
--    rotated when it was given up, retry it once the right key is set:
--    update plaid.account_cleanup set gave_up_at = null,
--    unreadable_failures = 0, retry_at = now() where id = '<id>';
--    save_bank_link also refuses a value that is not shaped like a sealed
--    token. That only stops obviously malformed input; it is not a defense,
--    since a student can send any well-formed garbage.
--
-- 3. Row level security on every plaid table, with no policies, as defense in
--    depth: the plaid schema is not served by the Data API and students have
--    no grants on it. The security definer functions that read these tables
--    run as the table owner, which row level security does not apply to
--    (it is not forced), so they work as before.

-- 1. Daily limits ------------------------------------------------------------

alter table public.penny_asks drop constraint if exists penny_asks_student_id_fkey;
alter table public.confirmation_email_sends drop constraint if exists confirmation_email_sends_student_id_fkey;

comment on column public.penny_asks.student_id is
  'The asking student''s id. No foreign key on purpose: the count outlives the account (20261117110000).';
comment on column public.confirmation_email_sends.student_id is
  'The student''s id. No foreign key on purpose: the count outlives the account (20261117110000).';

drop function if exists public.claim_penny_ask();

-- 'ok' when the question may go to the model (and it is now counted),
-- 'student_limit' or 'daily_limit' when it may not.
create or replace function public.claim_penny_ask(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_student_id is null then
    raise exception 'claim_penny_ask needs a student id' using errcode = '22004';
  end if;

  -- One claim at a time, so two questions sent together cannot both take the
  -- last place.
  perform pg_advisory_xact_lock(hashtext('public.claim_penny_ask'));

  delete from public.penny_asks where asked_at < now() - interval '2 days';

  if (
    select count(*) from public.penny_asks
    where student_id = p_student_id and asked_at > now() - interval '24 hours'
  ) >= 20 then
    return 'student_limit';
  end if;

  if (select count(*) from public.penny_asks where asked_at > now() - interval '24 hours') >= 300 then
    return 'daily_limit';
  end if;

  insert into public.penny_asks (student_id) values (p_student_id);
  return 'ok';
end;
$$;

revoke execute on function public.claim_penny_ask(uuid) from public, anon, authenticated;
grant execute on function public.claim_penny_ask(uuid) to service_role;

drop function if exists public.claim_confirmation_email();

-- true when the email may go out (and it is now counted), false when not.
create or replace function public.claim_confirmation_email(p_student_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_student_id is null then
    raise exception 'claim_confirmation_email needs a student id' using errcode = '22004';
  end if;

  -- One claim at a time, so two saves together cannot both take the last place.
  perform pg_advisory_xact_lock(hashtext('public.claim_confirmation_email'));

  delete from public.confirmation_email_sends where sent_at < now() - interval '2 days';

  if (select count(*) from public.confirmation_email_sends
      where student_id = p_student_id and sent_at > now() - interval '24 hours') >= 5 then
    return false;
  end if;
  if (select count(*) from public.confirmation_email_sends where sent_at > now() - interval '24 hours') >= 100 then
    return false;
  end if;

  insert into public.confirmation_email_sends (student_id) values (p_student_id);
  return true;
end;
$$;

revoke execute on function public.claim_confirmation_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_confirmation_email(uuid) to service_role;

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

-- 2. Deleted-account Plaid cleanup -------------------------------------------

alter table plaid.account_cleanup add column if not exists gave_up_at timestamptz;
-- Failures because the token did not open with the configured key, in a row.
-- attempts still counts claims, as before, and is informational only.
alter table plaid.account_cleanup add column if not exists unreadable_failures integer not null default 0;

-- How many unreadable failures in a row before a queued row is given up.
create or replace function plaid.account_cleanup_max_unreadable()
returns integer language sql immutable set search_path = '' as $$ select 5 $$;
revoke all on function plaid.account_cleanup_max_unreadable() from public, anon, authenticated, service_role;

-- As before, never claiming a given-up row, plus gives_up_if_unreadable: true
-- when one more unreadable failure gives the row up, so the app can log it
-- once and report it. The return type changes, so the function is dropped
-- and made again.
drop function if exists public.claim_plaid_account_cleanup();
create function public.claim_plaid_account_cleanup()
returns table (id uuid, student_id uuid, item_id text, token_ciphertext text, claim_id uuid, gives_up_if_unreadable boolean)
language sql security definer set search_path = '' as $$
  with due as (
    select q.id from plaid.account_cleanup q
    where q.retry_at <= now() and q.gave_up_at is null
    order by q.retry_at, q.id limit 5 for update skip locked
  )
  update plaid.account_cleanup q
  set claim_id = gen_random_uuid(), retry_at = now() + interval '15 minutes', attempts = attempts + 1
  from due where q.id = due.id
  returning q.id, q.student_id, q.item_id, q.token_ciphertext, q.claim_id,
    q.unreadable_failures + 1 >= plaid.account_cleanup_max_unreadable();
$$;

-- A stale worker cannot acknowledge a newer claim. A failed row is retried a
-- day later. p_reason says why it failed: only 'undecryptable' counts toward
-- giving up; anything else ('plaid_error', 'not_configured', or none, as the
-- app sent before this migration) is retried for ever. The parameter is new,
-- so the three-argument function is dropped; calls with three arguments still
-- reach this one through the default.
drop function if exists public.finish_plaid_account_cleanup(uuid, uuid, boolean);
create or replace function public.finish_plaid_account_cleanup(p_id uuid, p_claim_id uuid, p_removed boolean, p_reason text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_removed then
    delete from plaid.account_cleanup where id = p_id and claim_id = p_claim_id;
  elsif p_reason = 'undecryptable' then
    update plaid.account_cleanup
    set claim_id = null, retry_at = now() + interval '1 day',
      unreadable_failures = unreadable_failures + 1,
      gave_up_at = case when unreadable_failures + 1 >= plaid.account_cleanup_max_unreadable() then now() end
    where id = p_id and claim_id = p_claim_id;
  else
    -- p_reason = 'plaid_error' means the token opened, so the key is right.
    update plaid.account_cleanup
    set claim_id = null, retry_at = now() + interval '1 day',
      unreadable_failures = case when p_reason = 'plaid_error' then 0 else unreadable_failures end
    where id = p_id and claim_id = p_claim_id;
  end if;
  return found;
end;
$$;

revoke all on function public.claim_plaid_account_cleanup() from public, anon, authenticated;
revoke all on function public.finish_plaid_account_cleanup(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_plaid_account_cleanup() to service_role;
grant execute on function public.finish_plaid_account_cleanup(uuid, uuid, boolean, text) to service_role;

-- link a bank for the caller: the item, the token ciphertext and the bank's
-- name. Fails with unique_violation (23505) when the caller already has one;
-- the app then removes the new Item at Plaid. A value not shaped like a
-- sealed token (web/src/lib/plaid/token-box.ts: "v1." then base64url of the
-- 12-byte IV, the 16-byte tag and the ciphertext) fails with 22023. That
-- check only stops obviously malformed input. It is not a defense: a student
-- can still send well-formed garbage, which the cleanup gives up on after 5
-- unreadable tries.
create or replace function public.save_bank_link(p_item_id text, p_token_ciphertext text, p_institution_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
begin
  if v_student is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_token_ciphertext is null or p_token_ciphertext !~ '^v1\.[A-Za-z0-9_-]{39,}$' then
    raise exception 'not a sealed token' using errcode = '22023';
  end if;
  insert into plaid.items (student_id, item_id, token_ciphertext)
  values (v_student, p_item_id, p_token_ciphertext);
  -- a bank_links row left without a token (never expected) is replaced
  delete from public.bank_links where student_id = v_student;
  insert into public.bank_links (student_id, institution_name)
  values (v_student, p_institution_name);
end;
$$;

revoke execute on function public.save_bank_link(text, text, text) from public, anon;
grant execute on function public.save_bank_link(text, text, text) to authenticated;

-- 3. Row level security on the plaid schema ----------------------------------

do $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as name from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'plaid' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', t.name);
  end loop;
end;
$$;
