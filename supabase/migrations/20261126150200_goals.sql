-- Created with Claude Code (2026-11-26). Goals (US-17, Demo Day steps 4 and
-- 5): the one thing a student is saving for, picked right after "Looks
-- right?", and the plan built from it (web/src/lib/goals/plan.ts). Accepting
-- the plan writes its monthly amount to the existing set-aside
-- (bank_links.set_aside_cents, D40), so this table holds only the goal.
--
-- One goal per student for the demo (Ben, Nov 26): student_id is the primary
-- key, and saving again replaces it (PUT /api/v1/me/goal). Several goals later
-- would add an id and drop that key.
--
-- preset is the card the student picked (web/src/lib/goals/presets.ts);
-- "other" is "Something else", with the student's own name. "Start investing"
-- is left out for the demo (investing is education only).
--
-- The plan is fixed when the goal is saved and kept until the student edits
-- it, so the monthly amount never drifts as days pass: target_date is the
-- student's date, or 6 months from the day it was saved, and monthly_cents is
-- the amount over the whole months left then, rounded up to the cent
-- (web/src/lib/goals/plan.ts).
--
-- Students read, add, change and delete only their own row (row level
-- security). Deleting the account deletes it (auth.users cascade).
-- Disconnecting a bank keeps it: a goal is the student's own, not bank data.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production, BEFORE the app change that reads it is deployed. Safe to run
-- again. To back it out: supabase/rollbacks/20261126150200_goals.down.sql.
--
-- Check after applying:
--   select relrowsecurity from pg_class where oid = 'public.goals'::regclass;  -- true
--   select count(*) from pg_policies where tablename = 'goals';                  -- 4

create table if not exists public.goals (
  student_id uuid primary key references auth.users (id) on delete cascade,
  preset text not null check (preset in ('emergency_fund', 'pay_off_card', 'trip', 'car', 'home', 'other')),
  -- The preset's own name, or what the student typed for "Something else".
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- More than nothing, and at most $1,000,000 (the budget's largest amount,
  -- web/src/lib/budget/amount.ts).
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  target_date date not null,
  monthly_cents bigint not null check (monthly_cents >= 0 and monthly_cents <= amount_cents),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- Supabase's default privileges give anon and authenticated every privilege
-- on new tables in public. Take them back so the grants below are the only
-- ones. Students write only the goal's own columns, never the times. Update
-- includes student_id because the app saves with an upsert, which sets every
-- column it sends; row level security keeps it the student's own id.
revoke all on table public.goals from public, anon, authenticated;
grant select, delete on public.goals to authenticated;
grant insert (student_id, preset, name, amount_cents, target_date, monthly_cents) on public.goals to authenticated;
grant update (student_id, preset, name, amount_cents, target_date, monthly_cents) on public.goals to authenticated;

alter table public.goals enable row level security;

drop policy if exists "Students can read their own goal" on public.goals;
create policy "Students can read their own goal"
  on public.goals for select to authenticated
  using ((select auth.uid()) = student_id);
drop policy if exists "Students can add their own goal" on public.goals;
create policy "Students can add their own goal"
  on public.goals for insert to authenticated
  with check ((select auth.uid()) = student_id);
drop policy if exists "Students can change their own goal" on public.goals;
create policy "Students can change their own goal"
  on public.goals for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);
drop policy if exists "Students can delete their own goal" on public.goals;
create policy "Students can delete their own goal"
  on public.goals for delete to authenticated
  using ((select auth.uid()) = student_id);
