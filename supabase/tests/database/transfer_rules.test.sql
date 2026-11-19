-- Created with Claude Code (2026-11-15). The income and spending rules for
-- money moved between people and accounts
-- (20261116000000_plaid_transaction_descriptions.sql), on rows shaped like the
-- ones Plaid's sandbox sent for the Testathon bank on Nov 15: app transfers
-- filed as ..._FROM_APPS with no merchant name, told apart only by the bank's
-- description. Also: the sync saves the new fields, and an older app that
-- sends none never wipes them. One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email) values
  ('f2000000-0000-4000-8000-000000000001', 'transfers-ana@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f2000000-0000-4000-8000-000000000001', 'item-transfers-ana', 'v1.test');

create function pg_temp.txn(p_id text, p_account text, p_day int, p_cents int, p_cat text, p_detail text,
  p_description text, p_merchant text default null, p_app text default null)
returns void language sql as $$
  insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending,
    category, category_detailed, merchant_name, description, payment_app)
  values ('f2000000-0000-4000-8000-000000000001', p_id, p_account, date_trunc('month', current_date)::date + p_day,
          p_cents, false, p_cat, p_detail, p_merchant, p_description, p_app);
$$;

-- Money in
select pg_temp.txn('pay', 'chk', 0, -61000, 'INCOME', 'INCOME_WAGES', 'DIRECT DEP CAMPUS CAFE PAYROLL');
select pg_temp.txn('parent-zelle', 'chk', 1, -115000, 'TRANSFER_IN', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'ZELLE PAYMENT FROM DAVID ROSS CONF# R82LQ8', null, 'zelle');
select pg_temp.txn('venmo-cashout', 'chk', 2, -4000, 'TRANSFER_IN', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'VENMO CASHOUT PPD ID 5264681992');
select pg_temp.txn('cash-out-dash', 'chk', 3, -2500, 'TRANSFER_IN', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'Venmo Cash-Out');
select pg_temp.txn('own-in', 'chk', 4, -30000, 'TRANSFER_IN', 'TRANSFER_IN_ACCOUNT_TRANSFER', 'ONLINE TRANSFER FROM CHK 1234');
select pg_temp.txn('app-in-unknown', 'chk', 5, -1800, 'TRANSFER_IN', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', null);
-- a "Zelle from" that is really the student's own move: it left her savings the day before
select pg_temp.txn('self-zelle-out', 'sav', 6, 20000, 'TRANSFER_OUT', 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS', 'ZELLE PAYMENT TO ANA SELF', null, 'zelle');
select pg_temp.txn('self-zelle-in', 'chk', 7, -20000, 'TRANSFER_IN', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'ZELLE PAYMENT FROM ANA SELF', null, 'zelle');
-- Money out
select pg_temp.txn('zelle-roommate', 'chk', 8, 4620, 'TRANSFER_OUT', 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS', 'ZELLE PAYMENT TO MAYA PATEL CONF# 4LK8WE');
select pg_temp.txn('venmo-bare', 'chk', 9, 2500, 'TRANSFER_OUT', 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS', 'VENMO PAYMENT 1023947 WEB ID 3264681992');
select pg_temp.txn('atm', 'chk', 10, 4000, 'TRANSFER_OUT', 'TRANSFER_OUT_WITHDRAWAL', 'ATM WITHDRAWAL 0041 COMMONWEALTH AVE');
select pg_temp.txn('to-person', 'chk', 11, 6500, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'PAYMENT TO JORDAN LEE');
select pg_temp.txn('own-out', 'chk', 12, 15000, 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'ONLINE TRANSFER TO CHK 5678');
select pg_temp.txn('to-savings', 'chk', 13, 15000, 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS', 'TRANSFER TO SAVINGS');
select pg_temp.txn('out-unknown', 'chk', 14, 900, 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', null);

set local request.jwt.claims = '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- The rules read directly, as the owner (students cannot call them).
create temporary view counted_income as
  select t.transaction_id from plaid.transactions t
  where t.student_id = 'f2000000-0000-4000-8000-000000000001' and plaid.is_income(t);
create temporary view counted_spending as
  select t.transaction_id from plaid.transactions t
  where t.student_id = 'f2000000-0000-4000-8000-000000000001' and t.category = 'TRANSFER_OUT' and plaid.is_spending(t);

-- Money in
select is((select array_agg(transaction_id order by transaction_id) from counted_income), array['parent-zelle', 'pay'],
  'income is the paycheck and the parent''s Zelle, nothing else');
select ok('parent-zelle' in (select * from counted_income), 'a parent''s Zelle filed as an app transfer with no merchant name counts (D34)');
select ok('venmo-cashout' not in (select * from counted_income), 'a Venmo cash-out is not income (D38)');
select ok('cash-out-dash' not in (select * from counted_income), 'nor written "Cash-Out"');
select ok('own-in' not in (select * from counted_income), 'a transfer from the student''s own checking is not income');
select ok('app-in-unknown' not in (select * from counted_income), 'an app transfer with no description stays out, as before');
select ok('self-zelle-in' not in (select * from counted_income), 'a Zelle matched by money out of the student''s other account is not income');

-- Money out
select is((select array_agg(transaction_id order by transaction_id) from counted_spending), array['atm', 'to-person', 'venmo-bare', 'zelle-roommate'],
  'spending is cash, a payment to a person and every payment app payment');
select ok('venmo-bare' in (select * from counted_spending), 'a Venmo payment with no person named counts (D43)');
select ok('own-out' not in (select * from counted_spending), 'a transfer to the student''s own checking is not spending');
select ok('to-savings' not in (select * from counted_spending), 'a move to savings is not spending');
select ok('out-unknown' not in (select * from counted_spending), 'a transfer out with no name or description is not spending');

-- The totals use the same rules.
set local role authenticated;
select is((select sum(income_cents)::bigint from public.income_by_month(1)), 176000::bigint, 'income_by_month adds the paycheck and the parent''s Zelle');
select is((select sum(out_cents)::bigint from public.spending_by_detailed_category(current_date) where category = 'TRANSFER_OUT'), 17620::bigint,
  'spending_by_detailed_category counts the same four transfers out');

-- The sync saves the description and app, and a sync without them keeps them.
select public.apply_plaid_transactions_sync('item-transfers-ana', null,
  jsonb_build_array(jsonb_build_object('transaction_id', 'synced', 'account_id', 'chk', 'posted_on', current_date, 'amount_cents', -5000,
    'pending', false, 'category', 'TRANSFER_IN', 'category_detailed', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'merchant_name', null,
    'description', 'ZELLE PAYMENT FROM DANA LEE', 'payment_app', 'zelle')),
  '[]'::jsonb, '[]'::jsonb, 'cursor-1');
select public.apply_plaid_transactions_sync('item-transfers-ana', 'cursor-1', '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('transaction_id', 'synced', 'account_id', 'chk', 'posted_on', current_date, 'amount_cents', -5000,
    'pending', false, 'category', 'TRANSFER_IN', 'category_detailed', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', 'merchant_name', null)),
  '[]'::jsonb, 'cursor-2');
reset role;
select is((select description || ' / ' || payment_app from plaid.transactions where transaction_id = 'synced'), 'ZELLE PAYMENT FROM DANA LEE / zelle',
  'the sync saved the description and app, and an update without them kept them');
select ok(not has_function_privilege('authenticated', 'plaid.is_income(plaid.transactions)', 'execute'), 'students cannot call the rules directly');

select * from finish();
rollback;
