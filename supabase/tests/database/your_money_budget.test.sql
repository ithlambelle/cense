-- Created with Claude Code (2026-11-13). The rules for Your money, This month
-- in the database (US-12, 20261113120000_your_money_budget.sql): who can reach
-- spending_by_detailed_category() and budget_amounts, how the function groups
-- a month, and what deletes a student's budget amounts.
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
--
-- A student is acted as with `set local role authenticated` and their id in
-- request.jwt.claims, as the Data API does.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(37);

-- ana and ben have a linked bank; nobank has none.
insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-000000000001', 'budget-ana@example.com'),
  ('e0000000-0000-4000-8000-000000000002', 'budget-ben@example.com'),
  ('e0000000-0000-4000-8000-000000000003', 'budget-nobank@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('e0000000-0000-4000-8000-000000000001', 'item-budget-ana', 'v1.test'),
  ('e0000000-0000-4000-8000-000000000002', 'item-budget-ben', 'v1.test');
insert into public.bank_links (student_id, institution_name) values
  ('e0000000-0000-4000-8000-000000000001', 'First Platypus Bank'),
  ('e0000000-0000-4000-8000-000000000002', 'First Platypus Bank');

-- ana's last full month (the 10th of it) and this month
create function pg_temp.last_month(p_day int default 10) returns date language sql as $$
  select (date_trunc('month', current_date) - interval '1 month')::date + (p_day - 1);
$$;
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed) values
  ('e0000000-0000-4000-8000-000000000001', 'a-groc-1', 'acc', pg_temp.last_month(3), 4000, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'),
  ('e0000000-0000-4000-8000-000000000001', 'a-groc-2', 'acc', pg_temp.last_month(20), 2500, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'),
  ('e0000000-0000-4000-8000-000000000001', 'a-rest', 'acc', pg_temp.last_month(5), 1800, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT'),
  ('e0000000-0000-4000-8000-000000000001', 'a-shop', 'acc', pg_temp.last_month(6), 6000, false, 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES'),
  ('e0000000-0000-4000-8000-000000000001', 'a-refund', 'acc', pg_temp.last_month(12), -2000, false, 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES'),
  ('e0000000-0000-4000-8000-000000000001', 'a-pay', 'acc', pg_temp.last_month(15), -90000, false, 'INCOME', 'INCOME_WAGES'),
  ('e0000000-0000-4000-8000-000000000001', 'a-pending', 'acc', pg_temp.last_month(28), 999, true, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'),
  ('e0000000-0000-4000-8000-000000000001', 'a-nocat', 'acc', pg_temp.last_month(8), 700, false, null, null),
  ('e0000000-0000-4000-8000-000000000001', 'a-first', 'acc', pg_temp.last_month(1), 100, false, 'TRANSPORTATION', 'TRANSPORTATION_PUBLIC_TRANSIT'),
  ('e0000000-0000-4000-8000-000000000001', 'a-this-month', 'acc', date_trunc('month', current_date)::date, 5000, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'),
  ('e0000000-0000-4000-8000-000000000001', 'a-two-ago', 'acc', (date_trunc('month', current_date) - interval '1 day' * 1 - interval '1 month')::date, 3000, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'),
  ('e0000000-0000-4000-8000-000000000002', 'b-groc', 'acc', pg_temp.last_month(4), 7700, false, 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES');
-- Money ana sent out (Ben, Nov 15): cash, a payment to a named person and
-- any payment app payment (a bare "Venmo" or "Zelle", whatever Plaid's
-- category) are spending; no name, a general transfer that is not a payment
-- app, a move to savings and a move that lands in her other account
-- (a PayPal top-up included) are not.
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name) values
  ('e0000000-0000-4000-8000-000000000001', 'a-atm', 'acc', pg_temp.last_month(9), 6000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_WITHDRAWAL', null),
  ('e0000000-0000-4000-8000-000000000001', 'a-zelle-rent', 'acc', pg_temp.last_month(1), 65000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'Zelle to Jordan Lee'),
  ('e0000000-0000-4000-8000-000000000001', 'a-venmo-bare', 'acc', pg_temp.last_month(11), 2500, false, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'Venmo'),
  ('e0000000-0000-4000-8000-000000000001', 'a-no-name', 'acc', pg_temp.last_month(13), 1500, false, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', null),
  ('e0000000-0000-4000-8000-000000000001', 'a-to-savings', 'acc', pg_temp.last_month(14), 10000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS', 'Savings'),
  ('e0000000-0000-4000-8000-000000000001', 'a-move-out', 'acc', pg_temp.last_month(16), 30000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'Online transfer'),
  ('e0000000-0000-4000-8000-000000000001', 'a-move-in', 'acc-other', pg_temp.last_month(17), -30000, false, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'Online transfer'),
  ('e0000000-0000-4000-8000-000000000001', 'a-venmo-acct', 'acc', pg_temp.last_month(5), 1800, false, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'Venmo'),
  ('e0000000-0000-4000-8000-000000000001', 'a-zelle-bare', 'acc', pg_temp.last_month(6), 1200, false, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'Zelle'),
  ('e0000000-0000-4000-8000-000000000001', 'a-own-move', 'acc', pg_temp.last_month(7), 20000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'Online transfer to CHK 1234'),
  ('e0000000-0000-4000-8000-000000000001', 'a-paypal-out', 'acc', pg_temp.last_month(19), 4000, false, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'PayPal'),
  ('e0000000-0000-4000-8000-000000000001', 'a-paypal-in', 'acc-paypal', pg_temp.last_month(20), -4000, false, 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN', 'PayPal');

-- What anon and students can reach.
select ok(not has_function_privilege('anon', 'public.spending_by_detailed_category(date)', 'execute'), 'anon cannot read monthly totals');
select ok(has_function_privilege('authenticated', 'public.spending_by_detailed_category(date)', 'execute'), 'students can read their monthly totals');
select ok(not has_table_privilege('anon', 'public.budget_amounts', 'select, insert, update, delete'), 'anon has no privilege on budget_amounts');
select ok((select relrowsecurity from pg_class where oid = 'public.budget_amounts'::regclass), 'row level security is on for budget_amounts');
select is(
  (select prosecdef from pg_proc where oid = 'public.spending_by_detailed_category(date)'::regprocedure), true,
  'the totals function runs as its owner, so students never need the plaid schema');
select is(
  (select proconfig from pg_proc where oid = 'public.spending_by_detailed_category(date)'::regprocedure), array['search_path=""'],
  'with an empty search path');

set local role anon;
select throws_ok($$select * from public.spending_by_detailed_category(current_date)$$, '42501', null, 'anon is refused');
select throws_ok($$select * from public.budget_amounts$$, '42501', null, 'anon cannot read budget amounts');
reset role;

-- ana reads her last full month
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is((select out_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'FOOD_AND_DRINK_GROCERIES'),
  6500::bigint, 'groceries are their own line, summed across the month');
select is((select out_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'FOOD_AND_DRINK_RESTAURANT'),
  1800::bigint, 'eating out is apart from groceries, though both are FOOD_AND_DRINK');
select is((select transaction_count from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'FOOD_AND_DRINK_GROCERIES'),
  2, 'the pending grocery run is left out');
select is((select array[out_cents, in_cents] from public.spending_by_detailed_category(pg_temp.last_month())
           where category_detailed = 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES'),
  array[6000, 2000]::bigint[], 'money out and a refund in the same category come back apart, for the app to net');
select is((select in_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category = 'INCOME'),
  90000::bigint, 'money in is a positive number of cents');
select is((select out_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category is null),
  700::bigint, 'a transaction with no category is still counted, never dropped');
select is((select out_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'TRANSPORTATION_PUBLIC_TRANSIT'),
  100::bigint, 'the first day of the month is in it');
select is((select out_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'TRANSFER_OUT_WITHDRAWAL'),
  6000::bigint, 'cash taken out is spending');
select is((select out_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'TRANSFER_OUT_OTHER_TRANSFER_OUT'),
  67500::bigint, 'the payment to a named person and a bare Venmo count: not no name, or a move to her other account');
select is((select out_cents from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'TRANSFER_OUT_ACCOUNT_TRANSFER'),
  3000::bigint, 'a Venmo or Zelle payment counts as a general transfer too; a named move to her own account and a PayPal top-up that lands in her PayPal do not');
select is((select count(*)::int from public.spending_by_detailed_category(pg_temp.last_month()) where category_detailed = 'TRANSFER_OUT_SAVINGS'),
  0, 'a move to savings is left out');
select is((select count(*)::int from public.spending_by_detailed_category(pg_temp.last_month())), 10,
  'one row per detailed category, and nothing from this month or the month before');
select is((select out_cents from public.spending_by_detailed_category(current_date) where category_detailed = 'FOOD_AND_DRINK_GROCERIES'),
  5000::bigint, 'any day of a month reads that whole month');
select is((select count(*)::int from public.spending_by_detailed_category(null)), 0, 'no month, no rows');

-- ana's own number for a line
select lives_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000001', 'groceries', 30000)$$, 'a student saves their own number for a line');
select lives_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000001', 'income', 120000)
  on conflict (student_id, line) do update set amount_cents = excluded.amount_cents, updated_at = now()$$,
  'and changes it in place');
select throws_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000001', 'rent', 1)$$, '23514', null, 'a line that is not a Cense category is refused');
select throws_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000001', 'travel', -1)$$, '23514', null, 'a negative amount is refused');
select throws_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000001', 'travel', 100000001)$$, '23514', null, 'more than $1,000,000 is refused');
reset role;

-- ben sees and changes none of it
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select is((select count(*)::int from public.budget_amounts), 0, 'another student reads none of her budget amounts');
select is((select coalesce(sum(out_cents), 0)::bigint from public.spending_by_detailed_category(pg_temp.last_month())), 7700::bigint,
  'and his totals hold only his own transactions');
update public.budget_amounts set amount_cents = 1 where student_id = 'e0000000-0000-4000-8000-000000000001';
delete from public.budget_amounts where student_id = 'e0000000-0000-4000-8000-000000000001';
select throws_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000001', 'travel', 1)$$, '42501', null, 'he cannot write a row as her');
select lives_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000002', 'travel', 5000)$$, 'he saves his own');
reset role;
select is((select array_agg(amount_cents order by line) from public.budget_amounts where student_id = 'e0000000-0000-4000-8000-000000000001'),
  array[30000, 120000]::bigint[], 'his update and delete never touched her rows');

-- a student with no linked bank has no budget to save into
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-4000-8000-000000000003", "role": "authenticated"}';
select throws_ok($$insert into public.budget_amounts (student_id, line, amount_cents)
  values ('e0000000-0000-4000-8000-000000000003', 'travel', 1)$$, '23503', null, 'without a linked bank nothing is saved');
select is((select count(*)::int from public.spending_by_detailed_category(pg_temp.last_month())), 0, 'and there are no totals to read');
reset role;

-- what deletes the rows: disconnecting, and deleting the account
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "e0000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.delete_bank_link(), true, 'she disconnects her bank');
reset role;
select is((select count(*)::int from public.budget_amounts where student_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'disconnecting deletes every one of her budget amounts');
delete from auth.users where id = 'e0000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.budget_amounts where student_id = 'e0000000-0000-4000-8000-000000000002'), 0,
  'deleting the account deletes every one of his budget amounts');

select * from finish();
rollback;
