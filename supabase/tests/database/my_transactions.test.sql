-- Created with Claude Code (2026-11-15). my_transactions(month)
-- (20261115120000_my_transactions.sql): who can call it, that a student sees
-- only their own posted rows for that month, and that the rows flagged
-- in_income and in_spending add up exactly to income_by_month() and
-- spending_by_detailed_category(), so the list behind a number always matches
-- the number.
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'tx-ana@example.com'),
  ('f0000000-0000-4000-8000-000000000002', 'tx-ben@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f0000000-0000-4000-8000-000000000001', 'item-tx-ana', 'v1.test'),
  ('f0000000-0000-4000-8000-000000000002', 'item-tx-ben', 'v1.test');

create function pg_temp.last_month(p_day int default 10) returns date language sql as $$
  select (date_trunc('month', current_date) - interval '1 month')::date + (p_day - 1);
$$;

-- ana's last full month: income of every kind the rule knows, spending of
-- every kind the rule knows, and rows that are neither.
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name) values
  -- income: wages, a deposit with no name, money from a parent by Zelle
  ('f0000000-0000-4000-8000-000000000001', 'pay-1', 'chk', pg_temp.last_month(3), -61000, false, 'INCOME', 'INCOME_WAGES', 'Campus Cafe'),
  ('f0000000-0000-4000-8000-000000000001', 'pay-2', 'chk', pg_temp.last_month(17), -59000, false, 'INCOME', 'INCOME_WAGES', 'Campus Cafe'),
  ('f0000000-0000-4000-8000-000000000001', 'deposit', 'chk', pg_temp.last_month(8), -4000, false, 'TRANSFER_IN', 'TRANSFER_IN_DEPOSIT', null),
  ('f0000000-0000-4000-8000-000000000001', 'from-mom', 'chk', pg_temp.last_month(28), -115000, false, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Zelle from Dana Lee'),
  -- not income: a Venmo cash-out, money from savings, a move between her accounts
  ('f0000000-0000-4000-8000-000000000001', 'cash-out', 'chk', pg_temp.last_month(12), -3000, false, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Venmo Cash Out'),
  ('f0000000-0000-4000-8000-000000000001', 'from-sav', 'chk', pg_temp.last_month(13), -20000, false, 'TRANSFER_IN', 'TRANSFER_IN_SAVINGS', null),
  ('f0000000-0000-4000-8000-000000000001', 'move-in', 'chk', pg_temp.last_month(21), -15000, false, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Online transfer'),
  ('f0000000-0000-4000-8000-000000000001', 'move-out', 'sav', pg_temp.last_month(20), 15000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'Online transfer'),
  -- spending: groceries, a refund, rent by Zelle, a bare Venmo, cash
  ('f0000000-0000-4000-8000-000000000001', 'groc', 'chk', pg_temp.last_month(4), 5500, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'Trader Joe''s'),
  ('f0000000-0000-4000-8000-000000000001', 'shirt', 'chk', pg_temp.last_month(5), 3000, false, 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES', 'Uniqlo'),
  ('f0000000-0000-4000-8000-000000000001', 'refund', 'chk', pg_temp.last_month(9), -1000, false, 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES', 'Uniqlo'),
  ('f0000000-0000-4000-8000-000000000001', 'rent', 'chk', pg_temp.last_month(1), 115000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'Zelle to Jordan Lee'),
  ('f0000000-0000-4000-8000-000000000001', 'venmo', 'chk', pg_temp.last_month(11), 2500, false, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'Venmo'),
  ('f0000000-0000-4000-8000-000000000001', 'atm', 'chk', pg_temp.last_month(14), 4000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_WITHDRAWAL', null),
  -- not spending: a move to savings, an unnamed transfer out
  ('f0000000-0000-4000-8000-000000000001', 'to-sav', 'chk', pg_temp.last_month(15), 10000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS', null),
  ('f0000000-0000-4000-8000-000000000001', 'no-name', 'chk', pg_temp.last_month(16), 1500, false, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', null),
  -- never listed: pending, and outside the month
  ('f0000000-0000-4000-8000-000000000001', 'pending', 'chk', pg_temp.last_month(27), 999, true, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'Star Market'),
  ('f0000000-0000-4000-8000-000000000001', 'this-month', 'chk', date_trunc('month', current_date)::date, 700, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'Star Market'),
  -- ben's
  ('f0000000-0000-4000-8000-000000000002', 'ben-groc', 'chk', pg_temp.last_month(6), 7700, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'Star Market');

-- Who can call it.
select ok(not has_function_privilege('anon', 'public.my_transactions(date)', 'execute'), 'anon cannot call my_transactions');
select ok(has_function_privilege('authenticated', 'public.my_transactions(date)', 'execute'), 'a signed-in student can');

set local role authenticated;
set local request.jwt.claims = '{"sub": "f0000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select is((select count(*)::int from public.my_transactions(pg_temp.last_month())), 16,
  'ana sees her 16 posted rows for the month: no pending row, nothing from another month');
select is((select count(*)::int from public.my_transactions(pg_temp.last_month()) where transaction_id in ('pending', 'this-month', 'ben-groc')), 0,
  'never a pending row, another month or another student');
select is((select array_agg(transaction_id order by transaction_id) from public.my_transactions(pg_temp.last_month()) where in_income),
  array['deposit', 'from-mom', 'pay-1', 'pay-2'],
  'income: wages, a deposit and family money; not a cash-out, savings or her own move');
select is((select array_agg(transaction_id order by transaction_id) from public.my_transactions(pg_temp.last_month()) where category = 'TRANSFER_OUT' and in_spending),
  array['atm', 'rent', 'venmo'],
  'money out that is spending: cash, rent by Zelle and a bare Venmo; not savings, no name or her own move');
select is((select (-sum(amount_cents))::bigint from public.my_transactions(pg_temp.last_month()) where in_income),
  (select income_cents from public.income_by_month(3) where month = date_trunc('month', pg_temp.last_month())::date),
  'the income rows add up to income_by_month exactly');
select is(
  (select count(*)::int from (
     (select category, category_detailed,
             coalesce(sum(amount_cents) filter (where amount_cents > 0), 0)::bigint,
             coalesce(-sum(amount_cents) filter (where amount_cents < 0), 0)::bigint,
             count(*)::int
      from public.my_transactions(pg_temp.last_month()) where in_spending group by 1, 2)
     except
     (select * from public.spending_by_detailed_category(pg_temp.last_month()))
  ) d), 0,
  'every spending row group is in spending_by_detailed_category');
select is(
  (select count(*)::int from (
     (select * from public.spending_by_detailed_category(pg_temp.last_month()))
     except
     (select category, category_detailed,
             coalesce(sum(amount_cents) filter (where amount_cents > 0), 0)::bigint,
             coalesce(-sum(amount_cents) filter (where amount_cents < 0), 0)::bigint,
             count(*)::int
      from public.my_transactions(pg_temp.last_month()) where in_spending group by 1, 2)
  ) d), 0,
  'and every spending_by_detailed_category total is made of exactly these rows');
select is((select transaction_id from public.my_transactions(pg_temp.last_month()) limit 1), 'from-mom', 'newest first');
select is((select count(*)::int from public.my_transactions(null)), 0, 'no month, no rows');

set local request.jwt.claims = '{"sub": "f0000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select is((select array_agg(transaction_id) from public.my_transactions(pg_temp.last_month())), array['ben-groc'],
  'ben sees only his own row');

select * from finish();
rollback;
