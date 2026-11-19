-- Created with Claude Code (2026-11-18). Disconnect never waits on Plaid
-- (Figma E3, 20261118200000_disconnect_never_blocked.sql):
-- disconnect_bank_link(p_done_item_ids) deletes everything
-- delete_bank_link() deletes, in one step, and first queues every one of the
-- caller's Items not listed as done in plaid.account_cleanup, for the daily
-- cron to remove at Plaid. Another student's item ids change nothing, an
-- empty or null list queues everything, listed ids are not queued, a caller
-- with 3 or more queued rows is refused (54000) with nothing changed when an
-- Item would be queued, and only a signed-in student may call it.
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(47);

-- ana: Plaid is down when she disconnects. ben: another student, who keeps
-- his bank. cara: Plaid confirmed her Item removed, so she lists it as done.
-- dan, eve: list nothing (an empty list, a null list). fay: already has 3
-- rows waiting in the queue. gus: has 2.
insert into auth.users (id, email) values
  ('f5000000-0000-4000-8000-000000000001', 'disconnect-ana@example.com'),
  ('f5000000-0000-4000-8000-000000000002', 'disconnect-ben@example.com'),
  ('f5000000-0000-4000-8000-000000000003', 'disconnect-cara@example.com'),
  ('f5000000-0000-4000-8000-000000000004', 'disconnect-dan@example.com'),
  ('f5000000-0000-4000-8000-000000000005', 'disconnect-eve@example.com'),
  ('f5000000-0000-4000-8000-000000000006', 'disconnect-fay@example.com'),
  ('f5000000-0000-4000-8000-000000000007', 'disconnect-gus@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f5000000-0000-4000-8000-000000000001', 'disconnect-ana-item', 'v1.' || repeat('A', 40)),
  ('f5000000-0000-4000-8000-000000000002', 'disconnect-ben-item', 'v1.' || repeat('B', 40)),
  ('f5000000-0000-4000-8000-000000000003', 'disconnect-cara-item', 'v1.' || repeat('C', 40)),
  ('f5000000-0000-4000-8000-000000000004', 'disconnect-dan-item', 'v1.' || repeat('D', 40)),
  ('f5000000-0000-4000-8000-000000000005', 'disconnect-eve-item', 'v1.' || repeat('E', 40)),
  ('f5000000-0000-4000-8000-000000000006', 'disconnect-fay-item', 'v1.' || repeat('F', 40)),
  ('f5000000-0000-4000-8000-000000000007', 'disconnect-gus-item', 'v1.' || repeat('G', 40));
insert into public.bank_links (student_id, institution_name) values
  ('f5000000-0000-4000-8000-000000000001', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000002', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000003', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000004', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000005', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000006', 'First Platypus Bank'),
  ('f5000000-0000-4000-8000-000000000007', 'First Platypus Bank');
insert into public.bank_balances (student_id, position, name, mask, kind, balance_cents) values
  ('f5000000-0000-4000-8000-000000000001', 0, 'Plaid Checking', '0000', 'cash', 124000),
  ('f5000000-0000-4000-8000-000000000002', 0, 'Plaid Checking', '0000', 'cash', 124000),
  ('f5000000-0000-4000-8000-000000000006', 0, 'Plaid Checking', '0000', 'cash', 124000);
insert into public.bill_coverage (student_id, bill, covered_by, monthly_cents, due_day) values
  ('f5000000-0000-4000-8000-000000000001', 'rent', 'me', 65000, 1),
  ('f5000000-0000-4000-8000-000000000002', 'rent', 'me', 65000, 1),
  ('f5000000-0000-4000-8000-000000000006', 'rent', 'me', 65000, 1);
insert into public.budget_amounts (student_id, line, amount_cents) values
  ('f5000000-0000-4000-8000-000000000001', 'groceries', 25000),
  ('f5000000-0000-4000-8000-000000000002', 'groceries', 25000),
  ('f5000000-0000-4000-8000-000000000006', 'groceries', 25000);
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents) values
  ('f5000000-0000-4000-8000-000000000001', 'disconnect-ana-txn', 'acc', current_date - 3, 1200),
  ('f5000000-0000-4000-8000-000000000002', 'disconnect-ben-txn', 'acc', current_date - 3, 1200),
  ('f5000000-0000-4000-8000-000000000006', 'disconnect-fay-txn', 'acc', current_date - 3, 1200);
-- fay's 3 waiting rows (say, junk she saved and disconnected), gus's 2
insert into plaid.account_cleanup (student_id, item_id, token_ciphertext) values
  ('f5000000-0000-4000-8000-000000000006', 'disconnect-fay-old-1', 'v1.' || repeat('f', 40)),
  ('f5000000-0000-4000-8000-000000000006', 'disconnect-fay-old-2', 'v1.' || repeat('f', 40)),
  ('f5000000-0000-4000-8000-000000000006', 'disconnect-fay-old-3', 'v1.' || repeat('f', 40)),
  ('f5000000-0000-4000-8000-000000000007', 'disconnect-gus-old-1', 'v1.' || repeat('g', 40)),
  ('f5000000-0000-4000-8000-000000000007', 'disconnect-gus-old-2', 'v1.' || repeat('g', 40));

-- Who may call it -----------------------------------------------------------

select ok(has_function_privilege('authenticated', 'public.disconnect_bank_link(text[])', 'execute'),
  'a signed-in student may disconnect');
select ok(not has_function_privilege('anon', 'public.disconnect_bank_link(text[])', 'execute'),
  'anon may not');
select ok(not has_function_privilege('public', 'public.disconnect_bank_link(text[])', 'execute'),
  'nor may public');
set local role anon;
select throws_ok($$select public.disconnect_bank_link(array[]::text[])$$, '42501', null,
  'calling it as anon is refused');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select public.disconnect_bank_link(array[]::text[])$$, '28000', null,
  'calling it with no student in the session raises not signed in');
reset role;
select is((select count(*)::int from plaid.account_cleanup where item_id like 'disconnect-%-item'), 0,
  'and neither refused call queued anything');
select is((select count(*)::int from plaid.items where item_id like 'disconnect-%-item'), 7,
  'or deleted anything');

-- Plaid down: ana's Item is queued and our copy goes now ------------------------

-- She lists ben's item and one that does not exist as done, but not her own.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.disconnect_bank_link(array['disconnect-ben-item', 'no-such-item']), true,
  'ana disconnects while Plaid is down');
reset role;
select is((select count(*)::int from plaid.account_cleanup
    where item_id = 'disconnect-ana-item'
      and student_id = 'f5000000-0000-4000-8000-000000000001'
      and token_ciphertext = 'v1.' || repeat('A', 40)), 1,
  'her Item is queued with her id and its encrypted token, for the cron to remove at Plaid');
select is((select count(*)::int from plaid.account_cleanup where item_id in ('disconnect-ben-item', 'no-such-item')), 0,
  'ids that are not hers queue nothing');

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

-- ben keeps everything, though ana listed his item
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
select is(public.disconnect_bank_link(array[]::text[]), false,
  'disconnecting again finds nothing to delete');
reset role;
select is((select count(*)::int from plaid.account_cleanup where student_id = 'f5000000-0000-4000-8000-000000000001'), 1,
  'and queues nothing more');

-- The daily cron picks the queued Item up like a deleted account's.
update plaid.account_cleanup set retry_at = now() + interval '1 day' where item_id <> 'disconnect-ana-item';
select is((select count(*)::int from public.claim_plaid_account_cleanup() c where c.item_id = 'disconnect-ana-item'), 1,
  'the cleanup cron claims her queued Item');

-- Plaid confirmed it removed: the listed id is not queued ------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(public.disconnect_bank_link(array['disconnect-cara-item']), true, 'cara disconnects, her Item listed as done');
reset role;
select is((select count(*)::int from plaid.account_cleanup where student_id = 'f5000000-0000-4000-8000-000000000003'), 0,
  'nothing of hers is queued');
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000003')
    + (select count(*)::int from public.bank_links where student_id = 'f5000000-0000-4000-8000-000000000003'), 0,
  'and her token and link are deleted');

-- An empty list queues everything, and so does a null one -----------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(public.disconnect_bank_link(array[]::text[]), true, 'dan disconnects with an empty list');
reset role;
select is((select count(*)::int from plaid.account_cleanup
    where student_id = 'f5000000-0000-4000-8000-000000000004' and item_id = 'disconnect-dan-item'), 1,
  'an empty list queues his Item: a call that lists nothing never leaves a live Item behind');
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000004')
    + (select count(*)::int from public.bank_links where student_id = 'f5000000-0000-4000-8000-000000000004'), 0,
  'and his token and link are deleted');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(public.disconnect_bank_link(null), true, 'eve disconnects with a null list');
reset role;
select is((select count(*)::int from plaid.account_cleanup
    where student_id = 'f5000000-0000-4000-8000-000000000005' and item_id = 'disconnect-eve-item'), 1,
  'a null list queues her Item too');

-- The cap: 3 rows waiting ------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000006","role":"authenticated"}';
select throws_ok($$select public.disconnect_bank_link(array[]::text[])$$, '54000', 'too many bank removals waiting',
  'fay, with 3 rows waiting, is refused when her Item would be queued');
select throws_ok($$select public.disconnect_bank_link(array[null, 'no-such-item'])$$, '54000', null,
  'also when the list holds a null and ids that are not hers');
reset role;
select is((select count(*)::int from plaid.account_cleanup where student_id = 'f5000000-0000-4000-8000-000000000006'), 3,
  'nothing more of hers is queued');
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000006'), 1,
  'her token row is not deleted');
select is((select count(*)::int from plaid.transactions where student_id = 'f5000000-0000-4000-8000-000000000006'), 1,
  'nor her transactions');
select is((select (select count(*) from public.bank_links where student_id = 'f5000000-0000-4000-8000-000000000006')
    + (select count(*) from public.bank_balances where student_id = 'f5000000-0000-4000-8000-000000000006')
    + (select count(*) from public.bill_coverage where student_id = 'f5000000-0000-4000-8000-000000000006')
    + (select count(*) from public.budget_amounts where student_id = 'f5000000-0000-4000-8000-000000000006'))::int, 4,
  'nor her link, balances, answers or budget amounts');

-- A Disconnect that queues nothing is never refused.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000006","role":"authenticated"}';
select is(public.disconnect_bank_link(array['disconnect-fay-item']), true,
  'once Plaid confirms her Item removed, she disconnects even with 3 rows waiting');
reset role;
select is((select count(*)::int from plaid.account_cleanup where student_id = 'f5000000-0000-4000-8000-000000000006'), 3,
  'queueing nothing');
select is((select count(*)::int from plaid.items where student_id = 'f5000000-0000-4000-8000-000000000006')
    + (select count(*)::int from public.bank_links where student_id = 'f5000000-0000-4000-8000-000000000006'), 0,
  'and her token and link are deleted');

-- Under the cap: gus has 2 and may queue a third.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000007","role":"authenticated"}';
select is(public.disconnect_bank_link(array[]::text[]), true, 'gus, with 2 rows waiting, disconnects');
reset role;
select is((select count(*)::int from plaid.account_cleanup where student_id = 'f5000000-0000-4000-8000-000000000007'), 3,
  'and his Item is the third row');
-- Linked again (a junk token, as a direct caller could save), he is capped.
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f5000000-0000-4000-8000-000000000007', 'disconnect-gus-item-2', 'v1.' || repeat('H', 40));
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-000000000007","role":"authenticated"}';
select throws_ok($$select public.disconnect_bank_link(array[]::text[])$$, '54000', null,
  'a fourth row is refused');
reset role;
select is((select count(*)::int from plaid.account_cleanup where student_id = 'f5000000-0000-4000-8000-000000000007'), 3,
  'and the queue stays at 3');
select is((select count(*)::int from plaid.items where item_id = 'disconnect-gus-item-2'), 1,
  'with his token row kept');

-- delete_bank_link() is still there, for the app's fallback before this
-- migration and for a rollback.
select ok(has_function_privilege('authenticated', 'public.delete_bank_link()', 'execute'),
  'the old delete_bank_link() is unchanged');
select is((select prosecdef and proconfig = array['search_path=""'] from pg_catalog.pg_proc
    where oid = 'public.disconnect_bank_link(text[])'::regprocedure), true,
  'the new function runs as its owner with an empty search path');
select is((select proargnames from pg_catalog.pg_proc
    where oid = 'public.disconnect_bank_link(text[])'::regprocedure), array['p_done_item_ids'],
  'its one parameter is p_done_item_ids, the name the app sends');

select * from finish();
rollback;
