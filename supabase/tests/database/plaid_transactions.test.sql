-- Created with Claude Code (2026-11-07). The rules for Plaid transactions in
-- the database (US-14, 20261106210000_plaid_transactions.sql): who can touch
-- plaid.transactions and its functions, the 90-day window, what counts as
-- spending, the cap of 10,000 rows per student, and what deletes the rows.
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
--
-- A student is acted as with `set local role authenticated` and their id in
-- request.jwt.claims, as the Data API does. "Today" is current_date, which is
-- fixed for the whole transaction.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(45);

-- ana and ben have a linked bank, cap fills up to the limit, nobank has none.
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'txn-ana@example.com'),
  ('d0000000-0000-4000-8000-000000000002', 'txn-ben@example.com'),
  ('d0000000-0000-4000-8000-000000000003', 'txn-cap@example.com'),
  ('d0000000-0000-4000-8000-000000000004', 'txn-nobank@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('d0000000-0000-4000-8000-000000000001', 'item-ana', 'v1.test'),
  ('d0000000-0000-4000-8000-000000000002', 'item-ben', 'v1.test'),
  ('d0000000-0000-4000-8000-000000000003', 'item-cap', 'v1.test');
insert into public.bank_links (student_id, institution_name) values
  ('d0000000-0000-4000-8000-000000000001', 'First Platypus Bank'),
  ('d0000000-0000-4000-8000-000000000002', 'First Platypus Bank'),
  ('d0000000-0000-4000-8000-000000000003', 'First Platypus Bank');

-- One row as the app sends it, posted p_days_ago days before today.
create function pg_temp.txn(p_id text, p_days_ago int, p_cents bigint, p_category text default 'FOOD_AND_DRINK', p_pending boolean default false)
returns jsonb
language sql
as $$
  select jsonb_build_object('transaction_id', p_id, 'account_id', 'acc-1', 'posted_on', current_date - p_days_ago,
    'amount_cents', p_cents, 'pending', p_pending, 'category', p_category, 'category_detailed', null,
    'merchant_name', 'Chipotle');
$$;

-- What students and anon can reach: nothing in the plaid schema.
select ok(not has_schema_privilege('authenticated', 'plaid', 'usage'), 'students cannot use the plaid schema');
select ok(not has_schema_privilege('anon', 'plaid', 'usage'), 'anon cannot use the plaid schema');
select ok(not has_table_privilege('authenticated', 'plaid.transactions', 'select, insert, update, delete'),
  'students have no privilege on plaid.transactions');
select ok(not has_table_privilege('anon', 'plaid.transactions', 'select, insert, update, delete'),
  'anon has no privilege on plaid.transactions');
select ok((select relrowsecurity from pg_class where oid = 'plaid.transactions'::regclass),
  'row level security is on for plaid.transactions');
select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
   where table_schema = 'plaid' and table_name = 'transactions'),
  array['account_id', 'amount_cents', 'category', 'category_detailed', 'merchant_name', 'pending', 'posted_on',
    'student_id', 'transaction_id'],
  'only the kept fields exist: no description, location, counterparty or payment details');

select ok(not has_function_privilege('anon', 'public.plaid_transactions_cursor()', 'execute'), 'anon cannot read a cursor');
select ok(not has_function_privilege('anon', 'public.apply_plaid_transactions_sync(jsonb, jsonb, jsonb, text)', 'execute'),
  'anon cannot save a sync');
select ok(not has_function_privilege('anon', 'public.spending_by_category(integer)', 'execute'), 'anon cannot read spending');
select ok(not has_function_privilege('anon', 'public.income_by_month(integer)', 'execute'), 'anon cannot read income');
select ok(not has_function_privilege('anon', 'public.purge_old_plaid_transactions()', 'execute'), 'anon cannot purge');
select ok(not has_function_privilege('authenticated', 'public.purge_old_plaid_transactions()', 'execute'), 'students cannot purge');
select ok(has_function_privilege('service_role', 'public.purge_old_plaid_transactions()', 'execute'),
  'the daily job (service role) can purge');

-- anon, as the Data API runs it
set local role anon;
select throws_ok($$select public.apply_plaid_transactions_sync('[]', '[]', '[]', 'c0')$$, '42501', null,
  'anon is refused when saving a sync');
select throws_ok($$select * from public.spending_by_category(3)$$, '42501', null, 'anon is refused when reading spending');
reset role;

-- ana saves a sync
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.plaid_transactions_cursor(), null, 'no cursor before the first sync');
select is(public.apply_plaid_transactions_sync(
  jsonb_build_array(
    pg_temp.txn('ana-food', 5, 1200),
    pg_temp.txn('ana-pending', 3, 800, 'FOOD_AND_DRINK', true),
    pg_temp.txn('ana-transfer', 4, 5000, 'TRANSFER_OUT'),
    pg_temp.txn('ana-loan', 6, 3000, 'LOAN_PAYMENTS'),
    pg_temp.txn('ana-pay', 2, -48000, 'INCOME'),
    pg_temp.txn('ana-edge', 90, 777),
    pg_temp.txn('ana-old', 91, 999)),
  '[]', '[]', 'c1'), true, 'a student saves their own sync');
select is(public.plaid_transactions_cursor(), 'c1', 'and the cursor moves with it');
select throws_ok($$select count(*) from plaid.transactions$$, '42501', null, 'a student cannot read plaid.transactions');
select throws_ok($$insert into plaid.transactions (student_id, transaction_id, posted_on, amount_cents)
  values ('d0000000-0000-4000-8000-000000000001', 'x', current_date, 1)$$, '42501', null, 'a student cannot insert a transaction');
select throws_ok($$update plaid.transactions set amount_cents = 0$$, '42501', null, 'a student cannot update a transaction');
select throws_ok($$delete from plaid.transactions$$, '42501', null, 'a student cannot delete a transaction');
select is((select sum(spent_cents)::bigint from public.spending_by_category(3)), 1200::bigint,
  'spending leaves out pending items, transfers and loan payments');
select is((select sum(income_cents)::bigint from public.income_by_month(3)), 48000::bigint, 'income is money in marked INCOME');
reset role;

select is((select count(*)::int from plaid.transactions where transaction_id = 'ana-old'), 0,
  'a transaction 91 days old is never stored');
select is((select count(*)::int from plaid.transactions where transaction_id = 'ana-edge'), 1,
  'one exactly 90 days old is kept');
select is((select merchant_name || ' / ' || account_id from plaid.transactions where transaction_id = 'ana-food'),
  'Chipotle / acc-1', 'the merchant name and account id are kept for bill detection and card spending');

-- ben cannot see or change ana's rows
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select is(public.plaid_transactions_cursor(), null, 'a student reads only their own cursor');
select is(public.apply_plaid_transactions_sync(jsonb_build_array(pg_temp.txn('ben-food', 1, 1000)), '[]', '[]', 'b1'), true,
  'another student saves their own sync');
select is((select sum(spent_cents)::bigint from public.spending_by_category(3)), 1000::bigint,
  'a student''s totals hold only their own transactions');
select is(public.apply_plaid_transactions_sync('[]', jsonb_build_array(pg_temp.txn('ana-food', 5, 1)), '["ana-pay"]', 'b2'), true,
  'a sync naming another student''s ids still runs');
reset role;
select is((select amount_cents from plaid.transactions
           where student_id = 'd0000000-0000-4000-8000-000000000001' and transaction_id = 'ana-food'), 1200::bigint,
  'but it never changes their row');
select is((select count(*)::int from plaid.transactions
           where student_id = 'd0000000-0000-4000-8000-000000000001' and transaction_id = 'ana-pay'), 1,
  'or removes it');

-- a student with no linked bank, and a session with no student
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-4000-8000-000000000004", "role": "authenticated"}';
select is(public.apply_plaid_transactions_sync(jsonb_build_array(pg_temp.txn('x', 1, 1)), '[]', '[]', 'n1'), false,
  'with no linked bank nothing is saved');
set local "request.jwt.claims" to '{"role": "authenticated"}';
select throws_ok($$select public.apply_plaid_transactions_sync('[]', '[]', '[]', 'n1')$$, '28000', null,
  'a session with no student is refused');
reset role;

-- the daily purge
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents)
values ('d0000000-0000-4000-8000-000000000001', 'ana-stale', 'acc-1', current_date - 100, 500);
set local role service_role;
select is(public.purge_old_plaid_transactions(), 1, 'the purge deletes what is older than 90 days');
reset role;
select is((select count(*)::int from plaid.transactions where transaction_id in ('ana-stale', 'ana-edge')), 1,
  'and keeps what is 90 days old or newer');

-- the cap: 10,000 rows per student
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents)
select 'd0000000-0000-4000-8000-000000000003', 'cap-' || g, 'acc-1', current_date - 1, 100
from generate_series(1, 9999) g;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-4000-8000-000000000003", "role": "authenticated"}';
select is(public.apply_plaid_transactions_sync(jsonb_build_array(pg_temp.txn('cap-10000', 1, 100)), '[]', '[]', 'k1'), true,
  'a sync that reaches exactly 10,000 rows is saved');
select is(public.apply_plaid_transactions_sync(
  jsonb_build_array(pg_temp.txn('cap-1', 1, 100), pg_temp.txn('cap-2', 1, 100)),
  jsonb_build_array(pg_temp.txn('cap-3', 1, 250)), '[]', 'k2'), true,
  'sending rows already kept again at the cap still works');
select throws_ok($$select public.apply_plaid_transactions_sync(jsonb_build_array(pg_temp.txn('cap-10001', 1, 100)), '[]', '[]', 'k3')$$,
  '54000', null, 'one row past 10,000 is refused');
select is(public.plaid_transactions_cursor(), 'k2', 'and the refused sync saves nothing, not even its cursor');
select is(public.apply_plaid_transactions_sync(jsonb_build_array(pg_temp.txn('cap-10001', 1, 100)), '[]', '["cap-4"]', 'k4'), true,
  'a sync that removes as many as it adds still fits');
reset role;

-- what deletes the rows: disconnecting, and deleting the account
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "d0000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.delete_bank_link(), true, 'a student disconnects their bank');
reset role;
select is((select count(*)::int from plaid.transactions where student_id = 'd0000000-0000-4000-8000-000000000001'), 0,
  'disconnecting deletes every one of their transactions');
delete from auth.users where id = 'd0000000-0000-4000-8000-000000000002';
select is((select count(*)::int from plaid.transactions where student_id = 'd0000000-0000-4000-8000-000000000002'), 0,
  'deleting the account deletes every one of their transactions');

select * from finish();
rollback;
