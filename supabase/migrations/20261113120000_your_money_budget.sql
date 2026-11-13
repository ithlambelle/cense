-- Created with Claude Code (2026-11-13). Your money, This month (US-12,
-- Figma 709:1769 and 709:1865): the budget built from the student's own
-- stored transactions, with every number editable in place.
--
-- Two things, both acting on auth.uid() only:
-- 1. spending_by_detailed_category(p_month): the caller's posted totals for
--    one calendar month, grouped by Plaid's detailed category, money out and
--    money in kept apart. spending_by_category() (20261106210000) groups by
--    Plaid's primary category only, which puts groceries and eating out in
--    one FOOD_AND_DRINK line; the budget needs them apart. The app maps each
--    detailed category to Cense's names in one module
--    (web/src/lib/budget/categories.ts), which also decides what is not
--    spending (income, transfers between the student's own accounts, card
--    payments) and nets a refund against its purchase's category (D35).
--    Totals only: never a transaction, a merchant or an account.
-- 2. public.budget_amounts: the numbers a student typed over the bank's on
--    This month, one row per line. A line with no row follows the bank.
--    Students read and write only their own rows (row level security). The
--    rows hang off bank_links, like bill_coverage, so disconnecting
--    (delete_bank_link) and deleting the account both delete them.
--
-- Applied by hand in the Supabase SQL editor, after
-- 20261113000000_plaid_transactions_item_binding.sql: cense-preview first,
-- then production. Safe to run again.

create or replace function public.spending_by_detailed_category(p_month date)
returns table (
  category text,
  category_detailed text,
  -- posted money out (Plaid's positive amounts), in cents
  out_cents bigint,
  -- posted money in (Plaid's negative amounts, as a positive number), in cents
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
  group by t.category, t.category_detailed
  order by 3 desc, 1, 2;
$$;

revoke execute on function public.spending_by_detailed_category(date) from public, anon;
grant execute on function public.spending_by_detailed_category(date) to authenticated;

-- The student's own number for a line of This month. `line` is the income
-- line or one of Cense's spending categories (web/src/lib/budget/categories.ts);
-- saving is the set-aside on bank_links, saved through the safe-to-spend answers.
create table if not exists public.budget_amounts (
  student_id uuid not null references public.bank_links (student_id) on delete cascade,
  line text not null check (line in (
    'income', 'groceries', 'eating_out', 'rent_and_bills', 'transportation', 'school_supplies',
    'entertainment', 'subscriptions', 'shopping_and_personal_care', 'health', 'travel', 'other',
    'student_loans'
  )),
  -- the budget's range (web/src/lib/budget/amount.ts): $0 to $1,000,000
  amount_cents bigint not null check (amount_cents between 0 and 100000000),
  updated_at timestamptz not null default now(),
  primary key (student_id, line)
);

-- Supabase's default privileges give anon and authenticated every privilege
-- on new tables in public. Take them back so the grants below are the only ones.
revoke all on table public.budget_amounts from public, anon, authenticated;
grant select, insert, update, delete on public.budget_amounts to authenticated;

alter table public.budget_amounts enable row level security;

drop policy if exists "Students can read their own budget amounts" on public.budget_amounts;
create policy "Students can read their own budget amounts"
  on public.budget_amounts for select to authenticated
  using ((select auth.uid()) = student_id);
drop policy if exists "Students can add their own budget amounts" on public.budget_amounts;
create policy "Students can add their own budget amounts"
  on public.budget_amounts for insert to authenticated
  with check ((select auth.uid()) = student_id);
drop policy if exists "Students can change their own budget amounts" on public.budget_amounts;
create policy "Students can change their own budget amounts"
  on public.budget_amounts for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);
drop policy if exists "Students can delete their own budget amounts" on public.budget_amounts;
create policy "Students can delete their own budget amounts"
  on public.budget_amounts for delete to authenticated
  using ((select auth.uid()) = student_id);
