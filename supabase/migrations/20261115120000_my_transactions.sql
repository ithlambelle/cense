-- Created with Claude Code (2026-11-15). A student's own transactions for one
-- month, so a number on Your money, This month can open the payments behind
-- it ("how does it know my income is $1,221?", Ben, Nov 15). The screen
-- waits on design (T1, Figma 663:2250); this is its data, so the screen is a
-- front end change when the frame is approved.
--
-- my_transactions(p_month): the caller's posted transactions in one calendar
-- month, newest first, with two flags that say which of This month's numbers
-- each one is part of:
-- - in_income: counted by income_by_month() (20261114120000), the same rule
--   word for word (D34, D37, D38);
-- - in_spending: counted by spending_by_detailed_category() (20261113120000),
--   the same rule word for word (D43). The app then maps each row's detailed
--   category to Cense's line with web/src/lib/budget/categories.ts, exactly as
--   it maps the totals, so a line's rows always add up to the line.
-- The two rules are copied here, not shared, so that the two totals functions
-- stay exactly as applied; supabase/tests/database/my_transactions.test.sql
-- checks that the rows add up to both functions' totals, so a change to one
-- rule that is not made here fails the tests.
--
-- Only what the student's own bank already shows them: date, amount, Plaid's
-- merchant name (often empty: the bank's own description is never stored,
-- US-14) and categories. Never another student's rows (auth.uid() only), never
-- pending ones, never more than one month, and only the 180 days stored.
--
-- Applied by hand in the Supabase SQL editor after
-- 20261114120000_income_counts_family_money.sql: cense-preview first, then
-- production. Safe to run again.

create or replace function public.my_transactions(p_month date)
returns table (
  transaction_id text,
  posted_on date,
  merchant_name text,
  -- Plaid's sign: positive is money out, negative is money in, in cents
  amount_cents bigint,
  category text,
  category_detailed text,
  in_income boolean,
  in_spending boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.transaction_id,
         t.posted_on,
         t.merchant_name,
         t.amount_cents,
         t.category,
         t.category_detailed,
         -- income_by_month(), 20261114120000
         (
           t.amount_cents < 0
           and (
             t.category = 'INCOME'
             or (
               t.category = 'TRANSFER_IN'
               and coalesce(t.category_detailed, '') not in (
                 'TRANSFER_IN_ACCOUNT_TRANSFER',
                 'TRANSFER_IN_SAVINGS',
                 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
                 'TRANSFER_IN_CASH_ADVANCES_AND_LOANS',
                 'TRANSFER_IN_TRANSFER_IN_FROM_APPS'
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
               and (
                 t.category_detailed = 'TRANSFER_IN_DEPOSIT'
                 or (
                   nullif(btrim(t.merchant_name), '') is not null
                   and btrim(t.merchant_name) !~* '^(venmo|cash ?app|pay ?pal)$'
                   and btrim(t.merchant_name) !~* '\m(venmo|cash ?app|pay ?pal)\M.*\m(cash[ -]?out|transfer)\M'
                 )
               )
             )
           )
         ) as in_income,
         -- spending_by_detailed_category(), 20261113120000
         (
           t.category is distinct from 'TRANSFER_OUT'
           or (
             coalesce(t.category_detailed, '') not in (
               'TRANSFER_OUT_SAVINGS',
               'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS'
             )
             and (
               t.category_detailed = 'TRANSFER_OUT_WITHDRAWAL'
               or t.merchant_name ~* '\m(venmo|zelle|cash ?app|pay ?pal)\M'
               or (
                 coalesce(t.category_detailed, '') <> 'TRANSFER_OUT_ACCOUNT_TRANSFER'
                 and nullif(btrim(t.merchant_name), '') is not null
               )
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
           )
         ) as in_spending
  from plaid.transactions t
  where t.student_id = auth.uid()
    and not t.pending
    and p_month is not null
    and t.posted_on >= date_trunc('month', p_month)::date
    and t.posted_on < (date_trunc('month', p_month) + interval '1 month')::date
  order by t.posted_on desc, t.transaction_id;
$$;

revoke execute on function public.my_transactions(date) from public, anon;
grant execute on function public.my_transactions(date) to authenticated;
