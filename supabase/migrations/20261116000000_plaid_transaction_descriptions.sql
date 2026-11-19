-- Created with Claude Code (2026-11-15). Keep the bank's own description of a
-- transaction and which payment app carried it, so money sent by a person
-- through an app is told apart from the student moving their own money.
--
-- Why: on the Testathon test bank (Nov 15) Plaid sent a parent's monthly
-- Zelle as TRANSFER_IN_TRANSFER_IN_FROM_APPS and Venmo and Zelle payments out
-- as TRANSFER_OUT_..._FROM_APPS, all with no merchant name. Our rules read
-- the merchant name only, so the parent's $1,150 left This month's Income
-- (D34) and the payments out left spending (D43), while a payment app
-- cash-out must still not count as income (D38). With only categories and no
-- name, a parent's Zelle and a student's own cash-out look the same. The
-- description tells them apart: "ZELLE PAYMENT FROM DAVID ROSS" against
-- "VENMO CASHOUT". Ben chose to store it (Nov 15, option 3 of 3).
--
-- What this does:
-- 1. plaid.transactions gets `description` (Plaid's `name`, the bank's line,
--    up to 200 characters) and `payment_app` (venmo, zelle, cash_app, paypal
--    or apple_cash, from Plaid's counterparties or the description). Both stay
--    in the private plaid schema, kept 180 days and deleted with the bank
--    link, like the rest of the row. The description can name the person on
--    the other side; students only ever see their own.
-- 2. plaid.is_income(row) and plaid.is_spending(row): the one place the rules
--    live. income_by_month() and spending_by_detailed_category() now call
--    them, so the transaction list (my_transactions, PR #115) can call the
--    same ones and never disagree with the totals.
-- 3. apply_plaid_transactions_sync() saves the two new fields.
-- 4. Every linked bank's sync cursor is cleared, so the next sync reads the
--    180 days again and fills the descriptions in (rows are updated in
--    place; nothing is lost if a sync never runs, the rules fall back to the
--    merchant name as before).
--
-- The rules (D34, D37, D38, D43; supabase/tests/database/transfer_rules.test.sql):
-- Income, money in (negative amounts):
--   - INCOME counts.
--   - TRANSFER_IN counts unless it is to or from savings, investments, loans
--     or a cash advance, or the same amount left another of the student's
--     linked accounts within 3 days (their own move), and then only when:
--     it is a deposit, named or not (D37); or the description says it came
--     from someone ("... FROM DAVID ROSS"), and is not a cash-out or a move
--     from one of the student's own accounts ("FROM CHK 1234"); or, with no
--     usable description, the merchant name names a sender who is not a
--     payment app (the rule before this migration), or says Zelle on a
--     general account transfer (Yunho, Nov 15).
--   - A payment app cash-out never counts (D38).
-- Spending, money out (TRANSFER_OUT; every other category is grouped as
-- before and mapped in web/src/lib/budget/categories.ts):
--   - never a move to savings or investments, or money that arrives in
--     another of the student's linked accounts within 3 days;
--   - otherwise counts when it is cash taken out, any payment app payment
--     (D43, named or not), a payment the description says went to someone
--     ("... TO MAYA PATEL", not "TO CHK 1234"), or one with a merchant name
--     that is not a general account transfer (the rule before).
--
-- Applied by hand in the Supabase SQL editor after
-- 20261114120000_income_counts_family_money.sql: cense-preview first, then
-- production. Either order with the app code is safe: the old sync function
-- ignores the new fields, and this one saves missing fields as empty. Safe to
-- run again.

-- 1. The two fields.
alter table plaid.transactions add column if not exists description text;
alter table plaid.transactions add column if not exists payment_app text;
alter table plaid.transactions drop constraint if exists transactions_description_check;
alter table plaid.transactions add constraint transactions_description_check
  check (char_length(description) between 1 and 200);
alter table plaid.transactions drop constraint if exists transactions_payment_app_check;
alter table plaid.transactions add constraint transactions_payment_app_check
  check (payment_app in ('venmo', 'zelle', 'cash_app', 'paypal', 'apple_cash'));

-- 2. The rules, in one place.

-- The payment app a row went through, from what was stored or read from its
-- merchant name or description, or null.
create or replace function plaid.payment_app_of(t plaid.transactions)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    t.payment_app,
    case
      when concat_ws(' ', t.merchant_name, t.description) ~* '\mzelle\M' then 'zelle'
      when concat_ws(' ', t.merchant_name, t.description) ~* '\mvenmo\M' then 'venmo'
      when concat_ws(' ', t.merchant_name, t.description) ~* '\m(cash ?app|square cash)\M' then 'cash_app'
      when concat_ws(' ', t.merchant_name, t.description) ~* '\mpay ?pal\M' then 'paypal'
      when concat_ws(' ', t.merchant_name, t.description) ~* '\mapple cash\M' then 'apple_cash'
    end
  );
$$;

-- The student's own accounts as banks write them: "FROM CHK 1234",
-- "TO SAVINGS", "TO ACCT ...", "FROM BROKERAGE".
create or replace function plaid.names_own_account(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text ~* '\m(from|to)\s+(my\s+)?(chk|checking|sav|savings|acct|account|brokerage|x+\d|\*+\d|#\d)', false);
$$;

-- A payment app moving the student's own money: a cash-out to the bank or a
-- transfer between the app and the bank.
create or replace function plaid.is_cash_out(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text ~* '\m(cash[ -]?out|cashout|instant transfer|standard transfer|transfer to bank|bank transfer|add money|top ?up)\M', false);
$$;

create or replace function plaid.is_income(t plaid.transactions)
returns boolean
language sql
stable
set search_path = ''
as $$
  select t.amount_cents < 0
    and (
      t.category = 'INCOME'
      or (
        t.category = 'TRANSFER_IN'
        and coalesce(t.category_detailed, '') not in (
          'TRANSFER_IN_SAVINGS',
          'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
          'TRANSFER_IN_CASH_ADVANCES_AND_LOANS'
        )
        and not exists (
          select 1
          from plaid.transactions o
          where o.student_id = t.student_id
            and o.account_id <> t.account_id
            and not o.pending
            and o.category = 'TRANSFER_OUT'
            and o.amount_cents = -t.amount_cents
            and o.posted_on between t.posted_on - 3 and t.posted_on + 3
        )
        and not plaid.is_cash_out(concat_ws(' ', t.merchant_name, t.description))
        and (
          -- a deposit, with or without a name (D37)
          t.category_detailed = 'TRANSFER_IN_DEPOSIT'
          -- the bank says who sent it, and it is not one of their own accounts
          or (
            t.description ~* '\mfrom\s+[a-z]'
            and not plaid.names_own_account(t.description)
          )
          -- no usable description: the rule before, by merchant name
          or (
            coalesce(t.category_detailed, '') not in ('TRANSFER_IN_ACCOUNT_TRANSFER', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS')
            and nullif(btrim(t.merchant_name), '') is not null
            and btrim(t.merchant_name) !~* '^(venmo|cash ?app|pay ?pal)$'
            and btrim(t.merchant_name) !~* '\m(venmo|cash ?app|pay ?pal)\M.*\mtransfer\M'
          )
          or (
            t.category_detailed = 'TRANSFER_IN_ACCOUNT_TRANSFER'
            and t.merchant_name ~* '\mzelle\M'
          )
        )
      )
    );
$$;

create or replace function plaid.is_spending(t plaid.transactions)
returns boolean
language sql
stable
set search_path = ''
as $$
  select t.category is distinct from 'TRANSFER_OUT'
    or (
      coalesce(t.category_detailed, '') not in (
        'TRANSFER_OUT_SAVINGS',
        'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS'
      )
      and not exists (
        select 1
        from plaid.transactions i
        where i.student_id = t.student_id
          and i.account_id <> t.account_id
          and not i.pending
          and i.category = 'TRANSFER_IN'
          and i.amount_cents = -t.amount_cents
          and i.posted_on between t.posted_on - 3 and t.posted_on + 3
      )
      and (
        -- cash taken out
        t.category_detailed = 'TRANSFER_OUT_WITHDRAWAL'
        -- any payment app payment, named or not (D43)
        or plaid.payment_app_of(t) is not null
        or t.category_detailed like 'TRANSFER\_OUT\_%FROM\_APPS'
        -- the bank says who got it, and it is not one of their own accounts
        or (
          t.description ~* '\mto\s+[a-z]'
          and not plaid.names_own_account(t.description)
        )
        -- a merchant name on anything but a general account transfer (the rule before)
        or (
          coalesce(t.category_detailed, '') <> 'TRANSFER_OUT_ACCOUNT_TRANSFER'
          and nullif(btrim(t.merchant_name), '') is not null
        )
      )
    );
$$;

-- Internal: only the totals functions (and later the transaction list) call these.
revoke execute on function plaid.payment_app_of(plaid.transactions) from public, anon, authenticated;
revoke execute on function plaid.names_own_account(text) from public, anon, authenticated;
revoke execute on function plaid.is_cash_out(text) from public, anon, authenticated;
revoke execute on function plaid.is_income(plaid.transactions) from public, anon, authenticated;
revoke execute on function plaid.is_spending(plaid.transactions) from public, anon, authenticated;

-- The two totals, now on the shared rules. Same signatures and columns.
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
    and plaid.is_income(t)
    and t.posted_on >= (date_trunc('month', current_date)
                        - make_interval(months => greatest(1, least(coalesce(p_months, 3), 3)) - 1))::date
  group by 1
  order by 1;
$$;

revoke execute on function public.income_by_month(integer) from public, anon;
grant execute on function public.income_by_month(integer) to authenticated;

create or replace function public.spending_by_detailed_category(p_month date)
returns table (
  category text,
  category_detailed text,
  out_cents bigint,
  in_cents bigint,
  transaction_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.category,
         t.category_detailed,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::bigint,
         coalesce(-sum(t.amount_cents) filter (where t.amount_cents < 0), 0)::bigint,
         count(*)::integer
  from plaid.transactions t
  where t.student_id = auth.uid()
    and not t.pending
    and p_month is not null
    and t.posted_on >= date_trunc('month', p_month)::date
    and t.posted_on < (date_trunc('month', p_month) + interval '1 month')::date
    and plaid.is_spending(t)
  group by t.category, t.category_detailed
  order by 3 desc, 1, 2;
$$;

revoke execute on function public.spending_by_detailed_category(date) from public, anon;
grant execute on function public.spending_by_detailed_category(date) to authenticated;

-- 3. The sync saves the two new fields (everything else as in 20261113000000).
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
     description, payment_app)
  select distinct on (x.transaction_id)
    v_student, x.transaction_id, x.account_id, x.posted_on, x.amount_cents, coalesce(x.pending, false),
    x.category, x.category_detailed, nullif(left(x.merchant_name, 100), ''),
    nullif(left(x.description, 200), ''),
    case when x.payment_app in ('venmo', 'zelle', 'cash_app', 'paypal', 'apple_cash') then x.payment_app end
  from (
    select r.*, 1 as source, e.ord
    from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text, description text, payment_app text)
    union all
    select r.*, 2 as source, e.ord
    from jsonb_array_elements(coalesce(p_modified, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text, description text, payment_app text)
  ) x
  where x.posted_on >= current_date - 180
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
    payment_app = coalesce(excluded.payment_app, t.payment_app);

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

-- 4. Read the 180 days again on the next sync, to fill the descriptions in.
-- Only rows saved before this migration lack one; running this again only
-- costs one fuller sync per bank.
update plaid.items set transactions_cursor = null
where exists (select 1 from plaid.transactions t where t.student_id = plaid.items.student_id and t.description is null);
