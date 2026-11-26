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
-- accept_goal_plan(p_monthly_cents): Accept plan on Your plan. Writes the
-- goal's monthly amount to the caller's set-aside and nothing else (never the
-- bill answers, which another tab may have changed), and records it on the
-- goal, only when it is still the amount the screen showed. Runs as the
-- caller, so row level security and the grants apply. Answers 'accepted',
-- 'changed' (the goal was saved again since), 'no_goal', 'no_bank', or
-- 'nothing_to_set_aside' for a goal whose plan sets nothing aside (Pay off
-- my card).
--
-- goals_release_set_aside: switching an accepted goal to one that sets
-- nothing aside (Pay off my card) releases the set-aside its plan held, as
-- removing it does: cleared when it still holds what Accept wrote, kept when
-- the student changed it since.
--
-- remove_goal(): Remove my goal on Pick a goal. Deletes the caller's goal,
-- and clears their set-aside only when it still holds what Accept plan wrote
-- for it (accepted_monthly_cents); a set-aside the student changed since is
-- theirs and stays. Runs as the caller. Answers 'cleared', 'kept' or 'none'
-- (no goal).
--
-- Check after applying:
--   select relrowsecurity from pg_class where oid = 'public.goals'::regclass;  -- true
--   select count(*) from pg_policies where tablename = 'goals';                  -- 4
--   select has_function_privilege('anon', 'public.accept_goal_plan(bigint)', 'execute');  -- false
--   select has_function_privilege('anon', 'public.remove_goal()', 'execute');       -- false

create table if not exists public.goals (
  student_id uuid primary key references auth.users (id) on delete cascade,
  preset text not null check (preset in ('emergency_fund', 'pay_off_card', 'trip', 'car', 'home', 'other')),
  -- The preset's own name, or what the student typed for "Something else".
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- More than nothing, and at most $1,000,000 (the budget's largest amount,
  -- web/src/lib/budget/amount.ts).
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  target_date date not null,
  -- True when the student picked the date; false for the 6-month default,
  -- so editing the goal shows "no date" and keeps it where it was.
  target_date_chosen boolean not null default false,
  monthly_cents bigint not null check (monthly_cents >= 0 and monthly_cents <= amount_cents),
  -- What Accept plan last wrote to the set-aside; null until a plan is accepted.
  accepted_monthly_cents bigint check (accepted_monthly_cents >= 0),
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
grant insert (student_id, preset, name, amount_cents, target_date, target_date_chosen, monthly_cents, accepted_monthly_cents) on public.goals to authenticated;
grant update (student_id, preset, name, amount_cents, target_date, target_date_chosen, monthly_cents, accepted_monthly_cents) on public.goals to authenticated;

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

create or replace function public.accept_goal_plan(p_monthly_cents bigint)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_monthly bigint;
begin
  select monthly_cents into v_monthly from public.goals where student_id = v_student for update;
  if not found then
    return 'no_goal';
  end if;
  if v_monthly = 0 then
    return 'nothing_to_set_aside';
  end if;
  if v_monthly is distinct from p_monthly_cents then
    return 'changed';
  end if;
  update public.bank_links set set_aside_cents = v_monthly where student_id = v_student;
  if not found then
    return 'no_bank';
  end if;
  update public.goals set accepted_monthly_cents = v_monthly where student_id = v_student;
  return 'accepted';
end;
$$;

revoke execute on function public.accept_goal_plan(bigint) from public, anon;
grant execute on function public.accept_goal_plan(bigint) to authenticated;

create or replace function public.remove_goal()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_accepted bigint;
begin
  delete from public.goals where student_id = v_student returning accepted_monthly_cents into v_accepted;
  if not found then
    return 'none';
  end if;
  if v_accepted > 0 then
    update public.bank_links set set_aside_cents = 0
    where student_id = v_student and set_aside_cents = v_accepted;
    if found then
      return 'cleared';
    end if;
  end if;
  return 'kept';
end;
$$;

revoke execute on function public.remove_goal() from public, anon;
grant execute on function public.remove_goal() to authenticated;

create or replace function public.goals_release_set_aside()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.monthly_cents = 0 and old.accepted_monthly_cents > 0 then
    update public.bank_links set set_aside_cents = 0
    where student_id = old.student_id and set_aside_cents = old.accepted_monthly_cents;
    new.accepted_monthly_cents := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.goals_release_set_aside() from public, anon, authenticated;

drop trigger if exists goals_release_set_aside on public.goals;
create trigger goals_release_set_aside
  before update on public.goals
  for each row execute function public.goals_release_set_aside();
