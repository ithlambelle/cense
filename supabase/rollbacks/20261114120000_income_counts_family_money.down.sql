-- Created with Claude Code (2026-11-14). Undoes
-- 20261114120000_income_counts_family_money.sql: income_by_month() counts only
-- Plaid's INCOME category again, as PR #94 defined it.
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

revoke execute on function public.income_by_month(integer) from public, anon;
grant execute on function public.income_by_month(integer) to authenticated;
