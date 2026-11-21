-- Created with Claude Code (2026-11-21). Disconnecting a bank deletes every
-- piece of bank data Cense holds for that student (Data Policy section 8,
-- privacy policy "Linking your bank"). The guard has two halves:
--
-- 1. An inventory. Every table in the public and plaid schemas is listed below
--    as "bank" (emptied on disconnect) or "kept" (with the reason). A new
--    table that is not listed fails this test, so whoever adds it must decide,
--    in review, whether disconnect deletes it. A listed table that no longer
--    exists fails too, so the list never goes stale.
-- 2. A behavior check over the "bank" list. Every bank table must hold seeded
--    rows for two students before the disconnect (a new bank table without
--    seed rows fails, so it cannot pass by being empty), and after one student
--    disconnects, every bank table holds none of their rows and all of the
--    other student's.
--
-- Run with `npx supabase test db` on the local stack (CI does this in the e2e
-- job). One transaction, rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

create temp table disconnect_inventory (name text primary key, kind text not null check (kind in ('bank', 'kept')), reason text not null);
insert into disconnect_inventory values
  ('plaid.items', 'bank', 'the encrypted Plaid token; delete_bank_link() deletes it'),
  ('plaid.transactions', 'bank', 'cascades from plaid.items'),
  ('public.bank_links', 'bank', 'the link, set-aside and answered time; delete_bank_link() deletes it'),
  ('public.bank_balances', 'bank', 'cascades from bank_links'),
  ('public.bill_coverage', 'bank', 'cascades from bank_links'),
  ('public.budget_amounts', 'bank', 'cascades from bank_links'),
  ('plaid.account_cleanup', 'kept', 'the queue that finishes a removal at Plaid; it must outlive the link'),
  ('public.card_applications', 'kept', 'the student''s cards; statement and due days filled in from the bank stay (Data Policy section 8)'),
  ('public.profiles', 'kept', 'account settings, not bank data'),
  ('public.quiz_drafts', 'kept', 'quiz answers, not bank data'),
  ('public.recommendations', 'kept', 'card results, not bank data'),
  ('public.issuer_clicks', 'kept', 'issuer links opened, not bank data'),
  ('public.reminders', 'kept', 'card reminders, not bank data'),
  ('public.plan_steps', 'kept', 'plan progress, not bank data'),
  ('public.penny_asks', 'kept', 'Ask Penny limit records, purged within 4 days'),
  ('public.confirmation_email_sends', 'kept', 'email limit records, purged within 4 days'),
  ('public.auth_throttle_events', 'kept', 'sign-in limit records, hashed, not tied to a student'),
  ('public.reminder_refresh_state', 'kept', 'reminder planning bookkeeping, not bank data');

-- 1. The inventory matches the database exactly.
select is_empty(
  $$select table_schema || '.' || table_name from information_schema.tables
    where table_schema in ('public', 'plaid') and table_type = 'BASE TABLE'
    except select name from pg_temp.disconnect_inventory$$,
  'every table in public and plaid is listed as bank data or kept on disconnect');
select is_empty(
  $$select name from pg_temp.disconnect_inventory
    except select table_schema || '.' || table_name from information_schema.tables
    where table_schema in ('public', 'plaid') and table_type = 'BASE TABLE'$$,
  'every listed table still exists');
select is_empty(
  $$select name from pg_temp.disconnect_inventory i where kind = 'bank' and not exists (
      select 1 from information_schema.columns c
      where c.table_schema || '.' || c.table_name = i.name and c.column_name = 'student_id')$$,
  'every bank table is keyed by student_id, so disconnect can find a student''s rows');

-- 2. Two students with a linked bank and a row in every bank table.
insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'disconnect-ana@example.com'),
  ('f0000000-0000-4000-8000-000000000002', 'disconnect-ben@example.com');
insert into plaid.items (student_id, item_id, token_ciphertext) values
  ('f0000000-0000-4000-8000-000000000001', 'item-disconnect-ana', 'v1.test'),
  ('f0000000-0000-4000-8000-000000000002', 'item-disconnect-ben', 'v1.test');
insert into public.bank_links (student_id, institution_name) values
  ('f0000000-0000-4000-8000-000000000001', 'First Platypus Bank'),
  ('f0000000-0000-4000-8000-000000000002', 'First Platypus Bank');
insert into plaid.transactions (student_id, transaction_id, account_id, posted_on, amount_cents, pending) values
  ('f0000000-0000-4000-8000-000000000001', 'disconnect-a-1', 'acc', current_date, 1200, false),
  ('f0000000-0000-4000-8000-000000000002', 'disconnect-b-1', 'acc', current_date, 3400, false);
insert into public.bank_balances (student_id, position, name, kind, balance_cents, mask) values
  ('f0000000-0000-4000-8000-000000000001', 0, 'Checking', 'cash', 50000, '1234'),
  ('f0000000-0000-4000-8000-000000000002', 0, 'Checking', 'cash', 70000, '5678');
insert into public.bill_coverage (student_id, bill, covered_by, monthly_cents, due_day) values
  ('f0000000-0000-4000-8000-000000000001', 'rent', 'me', 115000, 1),
  ('f0000000-0000-4000-8000-000000000002', 'rent', 'family', null, null);
insert into public.budget_amounts (student_id, line, amount_cents) values
  ('f0000000-0000-4000-8000-000000000001', 'groceries', 20000),
  ('f0000000-0000-4000-8000-000000000002', 'groceries', 30000);

-- How many rows a student has in one table, whatever the table.
create function pg_temp.rows_for(p_table text, p_student uuid) returns bigint language plpgsql as $$
declare v_count bigint;
begin
  execute format('select count(*) from %s where student_id = $1', p_table) into v_count using p_student;
  return v_count;
end;
$$;

select is_empty(
  $$select name from pg_temp.disconnect_inventory where kind = 'bank'
    and pg_temp.rows_for(name, 'f0000000-0000-4000-8000-000000000001') = 0$$,
  'every bank table has seeded rows for the student who disconnects (add seed rows for a new bank table)');
select is_empty(
  $$select name from pg_temp.disconnect_inventory where kind = 'bank'
    and pg_temp.rows_for(name, 'f0000000-0000-4000-8000-000000000002') = 0$$,
  'every bank table has seeded rows for the other student');

create temp table before_disconnect as
  select name, pg_temp.rows_for(name, 'f0000000-0000-4000-8000-000000000002') as other_rows
  from pg_temp.disconnect_inventory where kind = 'bank';
grant select on pg_temp.disconnect_inventory, pg_temp.before_disconnect to authenticated;

-- ana disconnects, as the app does: as herself, through delete_bank_link().
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "f0000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.delete_bank_link(), true, 'the student disconnects her bank');
reset role;

select is_empty(
  $$select name from pg_temp.disconnect_inventory where kind = 'bank'
    and pg_temp.rows_for(name, 'f0000000-0000-4000-8000-000000000001') > 0$$,
  'after disconnect, no bank table holds any of her rows');
select is_empty(
  $$select b.name from pg_temp.before_disconnect b
    where pg_temp.rows_for(b.name, 'f0000000-0000-4000-8000-000000000002') <> b.other_rows$$,
  'the other student''s bank data is untouched');
select ok(
  exists (select 1 from public.profiles where student_id = 'f0000000-0000-4000-8000-000000000001'),
  'her account itself stays: disconnect is not account deletion');

select * from finish();
rollback;
