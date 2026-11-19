-- Created with Claude Code (2026-11-18). Disconnect never waits on Plaid
-- (Figma E3, 20261118200000_disconnect_never_blocked.sql):
-- disconnect_bank_link() deletes everything delete_bank_link() deletes, in
-- one step, and first queues the caller's own listed Items in
-- plaid.account_cleanup for the daily cron to remove at Plaid. Another
-- student's item ids are ignored, an empty list queues nothing, and only a
-- signed-in student may call it.
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(27);

-- ana: Plaid is down when she disconnects. ben: another student, who keeps
-- his bank. cara: Plaid confirmed her Item removed, so she lists nothing.
insert into auth.users (id, email) values
  ('f5000000-0000-4000-8000-000000000001', 'disconnect-ana@example.com'),
  ('f5000000-0000-4000-8000-000000000002', 'disconnect-ben@example.com'),
  ('f5000000-0000-4000-8000-000000000003', 'disconnect-cara@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f5000000-0000-4000-8000-000000000001', 'disconnect-ana-item', 'v1.' || repeat('A', 40)),
  ('f5000000-0000-4000-8000-000000000002', 'disconnect-ben-item', 'v1.' || repeat('B', 40)),
  ('f5000000-0000-4000-8000-000000000003', 'disconnect-cara-item', 'v1.' || repeat('C', 40));
insert into public.bank_links (student_id, institution_name) values
  ('f5000000-0000-4000-8000-000000000001', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000002', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000003', 'First Platypus Bank');
insert into public.bank_balances (student_id, position, name, mask, kind, balance_cents) values
  ('f5000000-0000-4000-8000-000000000001', 0, 'Plaid Checking', '0000', 'cash', 124000),
  ('f5000000-0000-4000-8000-000000000002', 0, 'Plaid Checking', '0000', 'cash', 124000);
insert into public.bill_coverage (student_id, bill, covered_by, monthly_cents, due_day) values
  ('f5000000-0000-4000-8000-000000000001', 'rent', 'me', 65000, 1),
  ('f5000000-0000-4000-8000-000000000002', 'rent', 'me', 65000, 1);
insert into public.budget_amounts (student_id, line, amount_cents) values
  ('f5000000-0000-4000-8000-000000000001', 'groceries', 25000),
  ('f5000000-0000-4000-8000-000000000002', 'groceries', 25000);
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents) values
  ('f5000000-0000-4000-8000-000000000001', 'disconnect-ana-txn', 'acc', current_date - 3, 1200),
  ('f5000000-0000-4000-8000-000000000002', 'disconnect-ben-txn', 'acc', current_date - 3, 1200);

-- Who may call it -----------------------------------------------------------

select ok(has_function_privilege('authenticated', 'public.disconnect_bank_link(text[])', 'execute'),
  'a signed-in student may disconnect');
select ok(not has_function_privilege('anon', 'public.disconnect_bank_link(text[])', 'execute'),
  'anon may not');
set local role anon;
select throws_ok($$select public.disconnect_bank_link(array['disconnect-ana-item'])$$, '42501', null,
  'calling it as anon is refused');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.disconnect_bank_link(array['disconnect-ana-item'])$$, '28000', null,
  'calling it with no student in the session raises not signed in');
reset role;
select is((select count(*)::int from plaid.account_cleanup where item_id like 'disconnect-%'), 0,
  'and neither refused call queued anything');
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000001'), 1,
  'or deleted anything');

-- Plaid down: ana's Item is queued and our copy goes now ------------------------

-- She lists her own Item, ben's and one that does not exist.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.disconnect_bank_link(array['disconnect-ana-item', 'disconnect-ben-item', 'no-such-item']), true,
  'ana disconnects while Plaid is down');
reset role;
select is((select count(*)::int from plaid.account_cleanup
    where item_id = 'disconnect-ana-item'
      and student_id = 'f5000000-0000-4000-8000-000000000001'
      and token_ciphertext = 'v1.' || repeat('A', 40)), 1,
  'her Item is queued with her id and its encrypted token, for the cron to remove at Plaid');
select is((select count(*)::int from plaid.account_cleanup where item_id = 'disconnect-ben-item'), 0,
  'ben''s item id is ignored: only the caller''s own Items are queued');
select is((select count(*)::int from plaid.account_cleanup where item_id like 'disconnect-%' or item_id = 'no-such-item'), 1,
  'and an id that is not hers queues nothing');

-- everything delete_bank_link() deletes
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000001'), 0,
  'her token row is deleted');
select is((select count(*)::int from plaid.transactions where student_id = 'f5000000-0000-4000-8000-000000000001'), 0,
  'her transactions go with it');
select is((select count(*)::int from public.bank_links where student_id = 'f5000000-0000-4000-8000-000000000001'), 0,
  'her link is deleted');
select is((select count(*)::int from public.bank_balances where student_id = 'f5000000-0000-4000-8000-000000000001'), 0,
  'her balances go with it');
select is((select count(*)::int from public.bill_coverage where student_id = 'f5000000-0000-4000-8000-000000000001'), 0,
  'her bill answers go with it');
select is((select count(*)::int from public.budget_amounts where student_id = 'f5000000-0000-4000-8000-000000000001'), 0,
  'her budget amounts go with it');

-- ben keeps everything
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000002'), 1,
  'ben''s token row is untouched');
select is((select count(*)::int from plaid.transactions where student_id = 'f5000000-0000-4000-8000-000000000002'), 1,
  'his transactions are untouched');
select is((select (select count(*) from public.bank_links where student_id = 'f5000000-0000-4000-8000-000000000002')
    + (select count(*) from public.bank_balances where student_id = 'f5000000-0000-4000-8000-000000000002')
    + (select count(*) from public.bill_coverage where student_id = 'f5000000-0000-4000-8000-000000000002')
    + (select count(*) from public.budget_amounts where student_id = 'f5000000-0000-4000-8000-000000000002'))::int, 4,
  'his link, balances, answers and budget amounts are untouched');

-- A second tap after the first went through.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.disconnect_bank_link(array['disconnect-ana-item']), false,
  'disconnecting again finds nothing to delete');
reset role;
select is((select count(*)::int from plaid.account_cleanup where item_id = 'disconnect-ana-item'), 1,
  'and queues nothing more');

-- The daily cron picks the queued Item up like a deleted account's.
update plaid.account_cleanup set retry_at = now() + interval '1 day' where item_id <> 'disconnect-ana-item';
select is((select count(*)::int from public.claim_plaid_account_cleanup() c where c.item_id = 'disconnect-ana-item'), 1,
  'the cleanup cron claims her queued Item');

-- Plaid already removed it: an empty list -----------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(public.disconnect_bank_link(array[]::text[]), true, 'cara disconnects with nothing to queue');
reset role;
select is((select count(*)::int from plaid.account_cleanup where student_id = 'f5000000-0000-4000-8000-000000000003'), 0,
  'nothing of hers is queued');
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000003')
    + (select count(*)::int from public.bank_links where student_id = 'f5000000-0000-4000-8000-000000000003'), 0,
  'and her token and link are deleted');

-- delete_bank_link() is still there, for the app's fallback before this
-- migration and for a rollback.
select ok(has_function_privilege('authenticated', 'public.delete_bank_link()', 'execute'),
  'the old delete_bank_link() is unchanged');
select is((select prosecdef and proconfig = array['search_path=""'] from pg_catalog.pg_proc
    where oid = 'public.disconnect_bank_link(text[])'::regprocedure), true,
  'the new function runs as its owner with an empty search path');

select * from finish();
rollback;
