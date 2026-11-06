-- Plaid transactions for budgeting (US-14), from the US-09 data spec (#87),
-- agreed on Nov 6: keep a rolling 90 days of each student's transactions,
-- privately, so budgeting can run on what they actually spend. Link asks Plaid
-- for 180 days of history (#91); anything older than 90 days is never stored
-- and is purged daily.
--
-- What is stored, and nothing else: Plaid's transaction id and account id
-- (to apply Sync's modified and removed entries and to avoid counting a
-- pending item twice), the posted date, the amount in cents, whether it is
-- pending, Plaid's category, and the merchant name capped at 100 characters.
-- Never: raw descriptions, locations, counterparties, payment details, or any
-- Plaid response.
--
-- Who can do what:
-- - plaid.transactions lives in the plaid schema, which the Data API does not
--   serve, with no grants to students and row level security on with no
--   policies. Students never read a single transaction.
-- - apply_plaid_transactions_sync() writes the caller's own rows and their
--   sync cursor in one transaction; plaid_transactions_cursor() reads it back.
-- - spending_by_category() and income_by_month() return monthly totals of the
--   caller's own posted transactions, never the rows themselves.
-- - purge_old_plaid_transactions() deletes anything older than 90 days; it is
--   for the daily cron (service role) only.
-- Disconnecting (delete_bank_link) deletes plaid.items, and deleting the
-- account deletes it too; both cascade to plaid.transactions.
--
-- The connect screen's promise changes with this (lib/safe-to-spend/copy.ts):
-- "We keep totals, never transactions" no longer holds.
--
-- Applied by hand in the Supabase SQL editor, after
-- 20261025220000_profiles_analytics_opt_out.sql: cense-preview first, then
-- production. Safe to run again.

-- where the last finished sync stopped, so the next one only asks for changes
alter table plaid.items add column if not exists transactions_cursor text
  check (transactions_cursor is null or char_length(transactions_cursor) <= 2000);
alter table plaid.items add column if not exists transactions_synced_at timestamptz;

create table if not exists plaid.transactions (
  student_id uuid not null references plaid.items (student_id) on delete cascade,
  transaction_id text not null check (char_length(transaction_id) between 1 and 200),
  account_id text not null check (char_length(account_id) between 1 and 200),
  posted_on date not null,
  -- Plaid's sign: positive is money out of the account, negative is money in
  amount_cents bigint not null check (amount_cents between -100000000000 and 100000000000),
  pending boolean not null default false,
  -- Plaid's personal finance category, like FOOD_AND_DRINK and
  -- FOOD_AND_DRINK_RESTAURANT; null when Plaid gives none
  category text check (category ~ '^[A-Z_]{1,64}$'),
  category_detailed text check (category_detailed ~ '^[A-Z_]{1,100}$'),
  merchant_name text check (char_length(merchant_name) between 1 and 100),
  primary key (student_id, transaction_id)
);
create index if not exists transactions_student_posted_on on plaid.transactions (student_id, posted_on);

revoke all on table plaid.transactions from public, anon, authenticated;
alter table plaid.transactions enable row level security;

-- the caller's cursor, null before their first sync
create or replace function public.plaid_transactions_cursor()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.transactions_cursor from plaid.items i where i.student_id = auth.uid();
$$;

-- One finished Transactions Sync (every page) for the caller: added and
-- modified rows are saved, removed ids deleted, and the cursor moved, all at
-- once. Rows older than 90 days are skipped. When an id appears more than
-- once, the last modified entry wins. False when the caller has no linked
-- bank (it was disconnected while Plaid answered).
create or replace function public.apply_plaid_transactions_sync(
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
begin
  if v_student is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- held until the end, so a disconnect cannot land halfway through
  perform 1 from plaid.items where student_id = v_student for update;
  if not found then
    return false;
  end if;

  insert into plaid.transactions as t
    (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name)
  select distinct on (x.transaction_id)
    v_student, x.transaction_id, x.account_id, x.posted_on, x.amount_cents, coalesce(x.pending, false),
    x.category, x.category_detailed, nullif(left(x.merchant_name, 100), '')
  from (
    select r.*, 1 as source, e.ord
    from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text)
    union all
    select r.*, 2 as source, e.ord
    from jsonb_array_elements(coalesce(p_modified, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text)
  ) x
  where x.posted_on >= current_date - 90
  order by x.transaction_id, x.source desc, x.ord desc
  on conflict (student_id, transaction_id) do update set
    account_id = excluded.account_id,
    posted_on = excluded.posted_on,
    amount_cents = excluded.amount_cents,
    pending = excluded.pending,
    category = excluded.category,
    category_detailed = excluded.category_detailed,
    merchant_name = excluded.merchant_name;

  delete from plaid.transactions t
  where t.student_id = v_student
    and t.transaction_id in (select jsonb_array_elements_text(coalesce(p_removed, '[]'::jsonb)));

  update plaid.items
  set transactions_cursor = p_cursor, transactions_synced_at = now()
  where student_id = v_student;
  return true;
end;
$$;

-- The caller's spending by Plaid category for this month and the months
-- before it (1 to 3 in all, so never past the 90 days kept). Posted money out
-- only: pending items, money in, transfers between accounts and loan or card
-- payments are left out, so moving money around is not counted as spending.
create or replace function public.spending_by_category(p_months integer default 3)
returns table (month date, category text, spent_cents bigint, transaction_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', t.posted_on)::date,
         coalesce(t.category, 'OTHER'),
         sum(t.amount_cents)::bigint,
         count(*)::integer
  from plaid.transactions t
  where t.student_id = auth.uid()
    and not t.pending
    and t.amount_cents > 0
    and coalesce(t.category, '') not in ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')
    and t.posted_on >= (date_trunc('month', current_date)
                        - make_interval(months => greatest(1, least(coalesce(p_months, 3), 3)) - 1))::date
  group by 1, 2
  order by 1, 3 desc, 2;
$$;

-- The caller's income by month (Plaid's INCOME category, money in), same window.
create or replace function public.income_by_month(p_months integer default 3)
returns table (month date, income_cents bigint, transaction_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', t.posted_on)::date,
         (-sum(t.amount_cents))::bigint,
         count(*)::integer
  from plaid.transactions t
  where t.student_id = auth.uid()
    and not t.pending
    and t.amount_cents < 0
    and t.category = 'INCOME'
    and t.posted_on >= (date_trunc('month', current_date)
                        - make_interval(months => greatest(1, least(coalesce(p_months, 3), 3)) - 1))::date
  group by 1
  order by 1;
$$;

-- The daily cron's purge: every transaction older than 90 days, for every
-- student. The number deleted, for the job's log.
create or replace function public.purge_old_plaid_transactions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from plaid.transactions where posted_on < current_date - 90;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.plaid_transactions_cursor() from public, anon;
revoke execute on function public.apply_plaid_transactions_sync(jsonb, jsonb, jsonb, text) from public, anon;
revoke execute on function public.spending_by_category(integer) from public, anon;
revoke execute on function public.income_by_month(integer) from public, anon;
revoke execute on function public.purge_old_plaid_transactions() from public, anon, authenticated;
grant execute on function public.plaid_transactions_cursor() to authenticated;
grant execute on function public.apply_plaid_transactions_sync(jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.spending_by_category(integer) to authenticated;
grant execute on function public.income_by_month(integer) to authenticated;
grant execute on function public.purge_old_plaid_transactions() to service_role;
