-- Created with Claude Code (2026-11-21). my_recent_transactions()
-- (20261121120000_my_recent_transactions.sql): own rows only, recent only,
-- never for anon. Run with `npx supabase test db` on the local stack.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'recent-ana@example.com'),
  ('f1000000-0000-4000-8000-000000000002', 'recent-ben@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f1000000-0000-4000-8000-000000000001', 'item-recent-ana', 'v1.test'),
  ('f1000000-0000-4000-8000-000000000002', 'item-recent-ben', 'v1.test');
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name, description) values
  ('f1000000-0000-4000-8000-000000000001', 'ana-rent', 'acc', current_date - 20, 115000, false, 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT', 'Brighton Ave', 'BRIGHTON AVE APARTMENTS RENT'),
  ('f1000000-0000-4000-8000-000000000001', 'ana-zelle', 'acc', current_date - 24, -115000, false, 'TRANSFER_IN', 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', null, 'ZELLE PAYMENT FROM DAVID ROSS'),
  ('f1000000-0000-4000-8000-000000000001', 'ana-old', 'acc', current_date - 200, 4500, false, 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_TELEPHONE', 'Verizon', null),
  ('f1000000-0000-4000-8000-000000000002', 'ben-rent', 'acc', current_date - 5, 90000, false, 'RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT', 'Other Landlord', null);

select ok(not has_function_privilege('anon', 'public.my_recent_transactions(integer)', 'execute'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.my_recent_transactions(integer)', 'execute'), 'students can');
select is((select prosecdef from pg_proc where oid = 'public.my_recent_transactions(integer)'::regprocedure), true, 'it runs as its owner');
select is((select proconfig from pg_proc where oid = 'public.my_recent_transactions(integer)'::regprocedure), array['search_path=""'], 'with an empty search path');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select array_agg(transaction_id order by transaction_id) from public.my_recent_transactions(120)), array['ana-rent', 'ana-zelle'],
  'a student sees only their own rows inside the window');
select is((select description from public.my_recent_transactions(120) where transaction_id = 'ana-zelle'), 'ZELLE PAYMENT FROM DAVID ROSS',
  'with the bank''s description the detector needs');
select is((select count(*)::int from public.my_recent_transactions(365)), 3, 'a longer window reaches the older row');
select is((select count(*)::int from public.my_recent_transactions(null)), 0, 'no window, no rows');

set local request.jwt.claims = '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select array_agg(transaction_id) from public.my_recent_transactions(120)), array['ben-rent'], 'the other student sees only theirs');

select * from finish();
rollback;
