-- Created with Claude Code (2026-11-21). The student's own recent posted and
-- pending transactions, in the shape the recurring detector reads
-- (web/src/lib/budget/recurring.ts, #109), so the server can answer the setup
-- questions from the bank right after linking instead of asking them (Ben,
-- Nov 21). Read only, own rows only, a fixed set of columns: no raw Plaid
-- response, no payment counterparty list. The description is the student's
-- own bank line (#116, D44); it never leaves the server in the findings, which
-- carry only names, amounts and dates.
create or replace function public.my_recent_transactions(p_days integer default 120)
returns table (
  transaction_id text,
  account_id text,
  posted_on date,
  -- Plaid's sign: positive is money out, negative is money in, in cents
  amount_cents bigint,
  pending boolean,
  category text,
  category_detailed text,
  merchant_name text,
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.transaction_id, t.account_id, t.posted_on, t.amount_cents, t.pending,
         t.category, t.category_detailed, t.merchant_name, t.description
  from plaid.transactions t
  where t.student_id = auth.uid()
    and p_days is not null
    and t.posted_on >= current_date - least(greatest(p_days, 1), 730)
  order by t.posted_on desc, t.transaction_id
  limit 5000;
$$;

revoke execute on function public.my_recent_transactions(integer) from public, anon;
grant execute on function public.my_recent_transactions(integer) to authenticated;
