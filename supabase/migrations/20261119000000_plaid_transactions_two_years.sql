-- Created with Claude Code (2026-11-19). Keep 2 years of bank transactions
-- instead of 180 days, and make room for the other party's name and the
-- place of each one.
--
-- Why: the team decided on Nov 18 to keep 2 years (Ben, after the call with
-- Aditya on Nov 17). 180 days misses twice-a-year bills like insurance and
-- never covers a full school year. The other party's name and the city and
-- state help name merchants Plaid leaves blank and tell a trip from a normal
-- week. The bank consent line already says "up to 2 years" (#125).
--
-- What this does:
-- 1. plaid.transactions gets `counterparty_name` (Plaid's counterparty name,
--    up to 100 characters), `location_city` (up to 100) and `location_state`
--    (Plaid's region, up to 50). All three stay in the private plaid schema,
--    are empty until the app sends them (Mabelle's change to the sync and to
--    the link), and are deleted with the bank link like the rest of the row.
-- 2. apply_plaid_transactions_sync() keeps rows up to 730 days old (was 180)
--    and saves the three new fields; a sync that does not send them never
--    wipes ones already saved. Everything else as in 20261116000000.
-- 3. purge_old_plaid_transactions() deletes only what is older than 730 days.
--
-- Banks linked before the app asks Plaid for 730 days still only have the
-- 180 days Plaid fetched when they were linked: Plaid sets that once per
-- link. Nothing older than 180 days is deleted from the day this runs.
--
-- Applied by hand in the Supabase SQL editor after
-- 20261116000000_plaid_transaction_descriptions.sql: cense-preview first,
-- then production. Either order with the app code is safe: the app drops
-- rows older than its own window before sending, and this function ignores
-- fields it is not sent. Safe to run again. Undo:
-- supabase/rollbacks/20261119000000_plaid_transactions_two_years.down.sql.

-- 1. The three fields.
alter table plaid.transactions add column if not exists counterparty_name text;
alter table plaid.transactions add column if not exists location_city text;
alter table plaid.transactions add column if not exists location_state text;
alter table plaid.transactions drop constraint if exists transactions_counterparty_name_check;
alter table plaid.transactions add constraint transactions_counterparty_name_check
  check (char_length(counterparty_name) between 1 and 100);
alter table plaid.transactions drop constraint if exists transactions_location_city_check;
alter table plaid.transactions add constraint transactions_location_city_check
  check (char_length(location_city) between 1 and 100);
alter table plaid.transactions drop constraint if exists transactions_location_state_check;
alter table plaid.transactions add constraint transactions_location_state_check
  check (char_length(location_state) between 1 and 50);

-- 2. The sync keeps 730 days and saves the three fields.
create or replace function public.apply_plaid_transactions_sync(
  p_item_id text,
  p_start_cursor text,
  p_added jsonb,
  p_modified jsonb,
  p_removed jsonb,
  p_cursor text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_item text;
  v_cursor text;
  v_kept integer;
begin
  if v_student is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- held until the end, so a disconnect cannot land halfway through, and two
  -- syncs for the same student check the cursor and count rows one at a time
  select i.item_id, i.transactions_cursor into v_item, v_cursor
  from plaid.items i where i.student_id = v_student for update;
  if not found or v_item is distinct from p_item_id then
    return false;
  end if;
  if nullif(v_cursor, '') is distinct from nullif(p_start_cursor, '') then
    return false;
  end if;

  insert into plaid.transactions as t
    (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name,
     description, payment_app, counterparty_name, location_city, location_state)
  select distinct on (x.transaction_id)
    v_student, x.transaction_id, x.account_id, x.posted_on, x.amount_cents, coalesce(x.pending, false),
    x.category, x.category_detailed, nullif(left(x.merchant_name, 100), ''),
    nullif(left(x.description, 200), ''),
    case when x.payment_app in ('venmo', 'zelle', 'cash_app', 'paypal', 'apple_cash') then x.payment_app end,
    nullif(left(x.counterparty_name, 100), ''), nullif(left(x.location_city, 100), ''), nullif(left(x.location_state, 50), '')
  from (
    select r.*, 1 as source, e.ord
    from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text, description text, payment_app text,
        counterparty_name text, location_city text, location_state text)
    union all
    select r.*, 2 as source, e.ord
    from jsonb_array_elements(coalesce(p_modified, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text, description text, payment_app text,
        counterparty_name text, location_city text, location_state text)
  ) x
  where x.posted_on >= current_date - 730
  order by x.transaction_id, x.source desc, x.ord desc
  on conflict (student_id, transaction_id) do update set
    account_id = excluded.account_id,
    posted_on = excluded.posted_on,
    amount_cents = excluded.amount_cents,
    pending = excluded.pending,
    category = excluded.category,
    category_detailed = excluded.category_detailed,
    merchant_name = excluded.merchant_name,
    -- an older app that sends no description never wipes one already saved
    description = coalesce(excluded.description, t.description),
    payment_app = coalesce(excluded.payment_app, t.payment_app),
    -- the same for the other party and the place, until the app sends them
    counterparty_name = coalesce(excluded.counterparty_name, t.counterparty_name),
    location_city = coalesce(excluded.location_city, t.location_city),
    location_state = coalesce(excluded.location_state, t.location_state);

  delete from plaid.transactions t
  where t.student_id = v_student
    and t.transaction_id in (select jsonb_array_elements_text(coalesce(p_removed, '[]'::jsonb)));

  -- counted after the removals, so ids sent again (already kept) never count twice
  select count(*) into v_kept from plaid.transactions where student_id = v_student;
  if v_kept > 10000 then
    raise exception 'too many transactions kept' using errcode = '54000';
  end if;

  update plaid.items
  set transactions_cursor = p_cursor, transactions_synced_at = now()
  where student_id = v_student and item_id = p_item_id;
  return true;
end;
$$;

revoke execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) to authenticated;

-- 3. The daily purge, run by the reminders cron (service role): every
-- transaction older than 730 days, for every student, including students who
-- stopped syncing. Returns the number deleted.
create or replace function public.purge_old_plaid_transactions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from plaid.transactions where posted_on < current_date - 730;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.purge_old_plaid_transactions() from public, anon, authenticated;
grant execute on function public.purge_old_plaid_transactions() to service_role;
