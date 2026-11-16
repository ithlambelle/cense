-- Created with Claude Code (2026-11-14). Income counts money from family (D34).
--
-- income_by_month() (20261106210000, PR #94) summed only Plaid's INCOME
-- category, so money a student gets from family (Venmo, Zelle and other
-- transfers in, which Plaid files under TRANSFER_IN) was left out, and This
-- month's Income read too low for the students whose main income is family.
-- Decided and not open: D34 (family money is income), D37 (a deposit with no
-- name is income), D38 (a payment app cash-out is the student's own money, not
-- income). The rule is the same as the bill and income detector's
-- (web/src/lib/budget/recurring.ts on PR #109), so both read income alike:
-- - money in marked INCOME counts;
-- - money in marked TRANSFER_IN counts, except the student's own moves
--   (account transfers, savings, investments, cash advances and loans, money
--   in from their own apps), and except money that left another of the
--   student's accounts as TRANSFER_OUT for the same amount within 3 days
--   (their own move between two linked accounts, however Plaid labelled it);
-- - a deposit (TRANSFER_IN_DEPOSIT) counts with or without a name (D37);
-- - any other transfer in counts only when it has a sender name that is not a
--   payment app cash-out ("Venmo", "Venmo Cash-Out"), because with no name a
--   gift from a parent and the student's own cash-out look the same (D38).
--   Those rows stay stored; they are only not counted.
-- Same signature and columns as before: the caller's own rows, posted only,
-- the same 1 to 3 month window.
--
-- Applied by hand in the Supabase SQL editor after
-- 20261113120000_your_money_budget.sql: cense-preview first, then production.
-- Safe to run again.

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
    and t.posted_on >= (date_trunc('month', current_date)
                        - make_interval(months => greatest(1, least(coalesce(p_months, 3), 3)) - 1))::date
  group by 1
  order by 1;
$$;

revoke execute on function public.income_by_month(integer) from public, anon;
grant execute on function public.income_by_month(integer) to authenticated;
