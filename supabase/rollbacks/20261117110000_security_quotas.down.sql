-- Created with Claude Code (2026-11-17). Undoes
-- 20261117110000_security_quotas.sql and puts back the functions and
-- settings of 20261025160000_penny_asks.sql,
-- 20261116090000_confirmation_email_limit.sql,
-- 20261109160000_plaid_account_cleanup.sql and
-- 20261025210000_bank_link_safe_to_spend.sql.
--
-- The app code from the same change keeps working after this rollback: it
-- falls back to the old claim functions (web/src/lib/api/quota.ts).
-- Given-up Plaid cleanup rows become claimable again (they are retried, never
-- dropped). Quota rows of deleted accounts are deleted, because the foreign
-- keys that come back require a live account.

begin;

-- 1. Daily limits

drop function if exists public.claim_penny_ask(uuid);
drop function if exists public.claim_confirmation_email(uuid);

delete from public.penny_asks a where not exists (select 1 from auth.users u where u.id = a.student_id);
delete from public.confirmation_email_sends s where not exists (select 1 from auth.users u where u.id = s.student_id);

alter table public.penny_asks drop constraint if exists penny_asks_student_id_fkey;
alter table public.penny_asks add constraint penny_asks_student_id_fkey
  foreign key (student_id) references auth.users (id) on delete cascade;
alter table public.confirmation_email_sends drop constraint if exists confirmation_email_sends_student_id_fkey;
alter table public.confirmation_email_sends add constraint confirmation_email_sends_student_id_fkey
  foreign key (student_id) references auth.users (id) on delete cascade;
comment on column public.penny_asks.student_id is null;
comment on column public.confirmation_email_sends.student_id is null;

create or replace function public.claim_penny_ask()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_tz text;
  v_student_day_start timestamptz;
  v_team_day_start timestamptz;
begin
  if v_student_id is null then
    raise exception 'claim_penny_ask needs a signed-in student' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.claim_penny_ask'));

  delete from public.penny_asks where asked_at < now() - interval '2 days';

  select time_zone into v_tz from public.profiles where student_id = v_student_id;
  v_tz := public.reminder_safe_tz(v_tz);
  v_student_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_team_day_start := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';

  if (
    select count(*) from public.penny_asks
    where student_id = v_student_id and asked_at >= v_student_day_start
  ) >= 20 then
    return 'student_limit';
  end if;

  if (select count(*) from public.penny_asks where asked_at >= v_team_day_start) >= 300 then
    return 'daily_limit';
  end if;

  insert into public.penny_asks (student_id) values (v_student_id);
  return 'ok';
end;
$$;

revoke execute on function public.claim_penny_ask() from public, anon;
grant execute on function public.claim_penny_ask() to authenticated;

create or replace function public.claim_confirmation_email()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_day_start timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
begin
  if v_student_id is null then
    raise exception 'claim_confirmation_email needs a signed-in student' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.claim_confirmation_email'));

  delete from public.confirmation_email_sends where sent_at < now() - interval '2 days';

  if (select count(*) from public.confirmation_email_sends
      where student_id = v_student_id and sent_at >= v_day_start) >= 5 then
    return false;
  end if;
  if (select count(*) from public.confirmation_email_sends where sent_at >= v_day_start) >= 100 then
    return false;
  end if;

  insert into public.confirmation_email_sends (student_id) values (v_student_id);
  return true;
end;
$$;

revoke execute on function public.claim_confirmation_email() from public, anon;
grant execute on function public.claim_confirmation_email() to authenticated;

-- 2. Deleted-account Plaid cleanup

drop function if exists public.claim_plaid_account_cleanup();
create function public.claim_plaid_account_cleanup()
returns table (id uuid, student_id uuid, item_id text, token_ciphertext text, claim_id uuid)
language sql security definer set search_path = '' as $$
  with due as (
    select q.id from plaid.account_cleanup q where q.retry_at <= now()
    order by q.retry_at, q.id limit 5 for update skip locked
  )
  update plaid.account_cleanup q
  set claim_id = gen_random_uuid(), retry_at = now() + interval '15 minutes', attempts = attempts + 1
  from due where q.id = due.id
  returning q.id, q.student_id, q.item_id, q.token_ciphertext, q.claim_id;
$$;

create or replace function public.finish_plaid_account_cleanup(p_id uuid, p_claim_id uuid, p_removed boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_removed then
    delete from plaid.account_cleanup where id = p_id and claim_id = p_claim_id;
  else
    update plaid.account_cleanup set claim_id = null, retry_at = now() + interval '1 day'
    where id = p_id and claim_id = p_claim_id;
  end if;
  return found;
end;
$$;

revoke all on function public.claim_plaid_account_cleanup() from public, anon, authenticated;
revoke all on function public.finish_plaid_account_cleanup(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_plaid_account_cleanup() to service_role;
grant execute on function public.finish_plaid_account_cleanup(uuid, uuid, boolean) to service_role;

drop function if exists plaid.account_cleanup_max_attempts();
alter table plaid.account_cleanup drop column if exists gave_up_at;

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
  insert into plaid.items (student_id, item_id, token_ciphertext)
  values (v_student, p_item_id, p_token_ciphertext);
  delete from public.bank_links where student_id = v_student;
  insert into public.bank_links (student_id, institution_name)
  values (v_student, p_institution_name);
end;
$$;

-- 3. Row level security: plaid.items had none before; plaid.transactions and
-- plaid.account_cleanup had it from their own migrations and keep it.
alter table plaid.items disable row level security;

commit;
