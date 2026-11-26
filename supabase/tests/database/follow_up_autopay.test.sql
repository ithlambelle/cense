-- Created with Claude Code (2026-11-26). raise_reminder_follow_ups() and
-- autopay (20261126140500_follow_up_skips_full_autopay.sql): no "Time to pay
-- off your card" follow-up when autopay pays the full statement balance; the
-- follow-up still comes for autopay on the minimum, a fixed amount, or no
-- saved type, and with autopay off. Run with `npx supabase test db` on the
-- local stack. One transaction, rolled back at the end. The student is on
-- America/New_York (no time zone saved).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values ('d0000000-0000-4000-8000-0000000000a1', 'follow-up-autopay@example.com');

-- An approved card with no closing day (the scheduler adds nothing of its
-- own), due 10 days from today, its autopay set at insert.
create function pg_temp.card(p_autopay text, p_type text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.card_applications (student_id, card_name, source, status, payment_due_day, autopay_status, autopay_payment_type)
  values ('d0000000-0000-4000-8000-0000000000a1', 'Test card', 'application', 'approved',
          extract(day from (now() at time zone 'America/New_York')::date + 10)::int, p_autopay, p_type)
  returning id into v_id;
  return v_id;
end;
$$;

-- A statement-closing reminder whose email went out, for a statement that
-- closed 2 days ago: due its follow-up today.
create function pg_temp.closed(p_card uuid) returns uuid language sql as $$
  insert into public.reminders (student_id, card_application_id, kind, occurrence, due_at, claimed_at, sent_at, attempts)
  select a.student_id, a.id, 'statement_closing', (now() at time zone 'America/New_York')::date - 2,
         now() - interval '3 days', now() - interval '3 days', now() - interval '3 days', 1
  from public.card_applications a where a.id = p_card
  returning id;
$$;

create temp table fu (name text primary key, id uuid);
insert into fu values
  ('full_balance', pg_temp.closed(pg_temp.card('on', 'statement_balance'))),
  ('minimum',      pg_temp.closed(pg_temp.card('on', 'minimum'))),
  ('fixed',        pg_temp.closed(pg_temp.card('on', 'fixed_amount'))),
  ('no_type',      pg_temp.closed(pg_temp.card('on', null))),
  ('off',          pg_temp.closed(pg_temp.card('off', null)));

create function pg_temp.followed(p_name text) returns boolean language sql as $$
  select follow_up_at is not null from public.reminders where id = (select id from fu where name = p_name);
$$;

set local role service_role;
select results_eq($$ select raised, skipped from public.raise_reminder_follow_ups() $$,
  $$ values (4, 0) $$, 'the job raises every follow-up but the full-balance autopay one');
reset role;

select ok(not pg_temp.followed('full_balance'), 'autopay pays the full statement balance: no follow-up');
select ok(pg_temp.followed('minimum'), 'autopay pays the minimum only: followed up');
select ok(pg_temp.followed('fixed'), 'autopay pays a fixed amount: followed up');
select ok(pg_temp.followed('no_type'), 'autopay on with no saved type: followed up');
select ok(pg_temp.followed('off'), 'autopay off: followed up');

select * from finish();
rollback;
