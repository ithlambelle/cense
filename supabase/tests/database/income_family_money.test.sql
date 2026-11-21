-- Created with Claude Code (2026-11-14). What income_by_month() counts as
-- income (20261114120000_income_counts_family_money.sql; D34, D37, D38).
-- Run with `npx supabase test db` on the local stack. One transaction, rolled
-- back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'income-ana@example.com'),
  ('f0000000-0000-4000-8000-000000000002', 'income-ben@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f0000000-0000-4000-8000-000000000001', 'item-income-ana', 'v1.test'),
  ('f0000000-0000-4000-8000-000000000002', 'item-income-ben', 'v1.test');

create function pg_temp.txn(p_student int, p_id text, p_cents int, p_cat text, p_detail text, p_merchant text, p_pending boolean default false)
returns void language sql as $$
  insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name)
  values (('f0000000-0000-4000-8000-00000000000' || p_student)::uuid, p_id, 'acc', date_trunc('month', current_date)::date + 1,
          p_cents, p_pending, p_cat, p_detail, p_merchant);
$$;

select pg_temp.txn(1, 'pay', -90000, 'INCOME', 'INCOME_WAGES', 'Campus Dining');
select pg_temp.txn(1, 'zelle-mom', -30000, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Zelle from Maria');
select pg_temp.txn(1, 'venmo-dad', -5000, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Venmo from David');
select pg_temp.txn(1, 'check', -12000, 'TRANSFER_IN', 'TRANSFER_IN_DEPOSIT', null);
select pg_temp.txn(1, 'cashout', -20000, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Venmo Cash-Out');
select pg_temp.txn(1, 'venmo-bare', -7000, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Venmo');
select pg_temp.txn(1, 'from-app', -8000, 'TRANSFER_IN', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'Cash App');
select pg_temp.txn(1, 'own-acct', -40000, 'TRANSFER_IN', 'TRANSFER_IN_ACCOUNT_TRANSFER', null);
select pg_temp.txn(1, 'savings', -15000, 'TRANSFER_IN', 'TRANSFER_IN_SAVINGS', 'Savings');
select pg_temp.txn(1, 'loan', -100000, 'TRANSFER_IN', 'TRANSFER_IN_CASH_ADVANCES_AND_LOANS', 'Lender');
select pg_temp.txn(1, 'unnamed', -6000, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', null);
select pg_temp.txn(1, 'refund', -2500, 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE', 'Shop');
select pg_temp.txn(1, 'pending-gift', -9000, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Zelle from Maria', true);
select pg_temp.txn(1, 'spend', 4000, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'Market');
select pg_temp.txn(2, 'ben-gift', -50000, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Zelle from Aunt');
-- The student's own move between two linked accounts that Plaid labelled as an
-- ordinary transfer in, with a name: the same amount left the other account
-- as TRANSFER_OUT a day later, so it is not income.
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name) values
  ('f0000000-0000-4000-8000-000000000001', 'move-in', 'acc', date_trunc('month', current_date)::date + 1, -10000, false, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Bank move'),
  ('f0000000-0000-4000-8000-000000000001', 'move-out', 'acc-savings', date_trunc('month', current_date)::date + 2, 10000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'Bank move');

select ok(not has_function_privilege('anon', 'public.income_by_month(integer)', 'execute'), 'anon still cannot read income');
select ok(has_function_privilege('authenticated', 'public.income_by_month(integer)', 'execute'), 'students can read their income');
select is((select prosecdef from pg_proc where oid = 'public.income_by_month(integer)'::regprocedure), true, 'it runs as its owner');
select is((select proconfig from pg_proc where oid = 'public.income_by_month(integer)'::regprocedure), array['search_path=""'], 'with an empty search path');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 90,000 pay + 30,000 Zelle + 5,000 Venmo from a person + 12,000 nameless deposit
select is((select sum(income_cents)::bigint from public.income_by_month(1)), 137000::bigint,
  'income is pay, money from family and a deposit with no name');
select is((select sum(transaction_count)::int from public.income_by_month(1)), 4, 'four rows count');
select is((select count(*)::int from public.income_by_month(1)), 1, 'one month row');

-- Each exclusion on its own: removing it would change the total.
select ok((select sum(income_cents) from public.income_by_month(1)) < 137000 + 20000, 'a Venmo cash-out is not income (D38)');
select ok((select sum(income_cents) from public.income_by_month(1)) < 137000 + 40000, 'a move from the student''s own account is not income');
select ok((select sum(income_cents) from public.income_by_month(1)) < 137000 + 100000, 'a loan or cash advance is not income');
select ok((select sum(income_cents) from public.income_by_month(1)) < 137000 + 10000, 'a matched move between the student''s own accounts is not income');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select sum(income_cents)::bigint from public.income_by_month(1)), 50000::bigint, 'another student sees only their own income');

set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.income_by_month(3)), 0, 'a student with no transactions sees nothing');

reset role;
select * from finish();
rollback;
