-- Created with Claude Code (2026-11-25). The production Plaid pilot (gate 5
-- of the live-Plaid readiness plan): who may link a real bank, and how many
-- real Items Cense may ever make.
--
-- Plaid's Trial plan allows 10 production Items, ever: every access token
-- made in production counts, even after /item/remove, so a disconnect and
-- relink, a test link or a second try each spend one. Two limits, both
-- enforced only when PLAID_ENV is "production" (web/src/lib/plaid/pilot.ts),
-- both set by hand in the SQL editor and never by the app:
-- - pilot.plaid_students: who may link, and how many Items each may make
--   (`allowance`, 1 by default: one bank, no relink after a disconnect unless
--   a team member raises it). `claimed` counts what they have used.
-- - pilot.plaid_item_budget: one row, no student data. `budget` is the most
--   Items the app may ever make (0 until a team member sets it), `used` how
--   many it has tried to make.
-- A slot is taken right before each public token exchange and never given
-- back, even when the exchange fails: a slot lost is the safe mistake, an
-- Item over Plaid's limit is not.
--
-- Every number lives here, not in the caller's hands: a pilot student who
-- calls claim_plaid_item_slot() directly can use up only their own allowance,
-- never another student's or the team's, and can never make an Item (only
-- the server exchanges public tokens).
--
-- Why a schema of its own, not plaid: the plaid schema holds what hangs off a
-- linked Item (plaid.items), and these tables do not. Like plaid, the Data
-- API does not serve it (supabase/config.toml lists public and graphql_public
-- only) and no API role, service role included, has any grant on it.
-- Students reach it only through the two functions below, each about the
-- caller only.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production. Either order with the app code is safe: in the sandbox the app
-- never calls these functions. It must be applied before PLAID_ENV is set to
-- "production". Safe to run again.

create schema if not exists pilot;
revoke all on schema pilot from public, anon, authenticated, service_role;

-- The students in the pilot, and how many Items each may make.
create table if not exists pilot.plaid_students (
  student_id uuid primary key references auth.users (id) on delete cascade,
  allowance int not null default 1 check (allowance >= 0),
  claimed int not null default 0 check (claimed >= 0),
  added_at timestamptz not null default now()
);
alter table pilot.plaid_students enable row level security;
revoke all on table pilot.plaid_students from public, anon, authenticated, service_role;

-- The whole pilot's Item budget: exactly one row, never a student id.
create table if not exists pilot.plaid_item_budget (
  id int primary key default 1 check (id = 1),
  budget int not null default 0 check (budget >= 0),
  used int not null default 0 check (used >= 0)
);
alter table pilot.plaid_item_budget enable row level security;
revoke all on table pilot.plaid_item_budget from public, anon, authenticated, service_role;
insert into pilot.plaid_item_budget (id) values (1) on conflict (id) do nothing;

-- What the signed-in student may do, without taking anything:
--   'none'  not in the pilot: no Link at all
--   'full'  in the pilot, but no new bank: their own allowance or the whole
--           budget is used (signing in to a bank already linked still works)
--   'open'  may link a new bank
-- Home, the first sign-in screens, Connect and both bank-link routes ask
-- before offering or starting Link. It says nothing about any other student.
create or replace function public.plaid_pilot_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.student_id is null then 'none'
    when s.claimed < s.allowance and b.used < b.budget then 'open'
    else 'full'
  end
  from pilot.plaid_item_budget b
  left join pilot.plaid_students s on s.student_id = (select auth.uid())
  where b.id = 1;
$$;

-- Takes one slot from the student's allowance and the budget together, or
-- refuses (false) when either is used up or the caller is not in the pilot.
-- Both rows are locked for the rest of the transaction, always the budget
-- first, so two exchanges at the same moment wait for each other and can
-- never both take the last slot.
create or replace function public.claim_plaid_item_slot()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := (select auth.uid());
  v_budget pilot.plaid_item_budget%rowtype;
  v_pilot pilot.plaid_students%rowtype;
begin
  if v_student is null then
    return false;
  end if;
  select * into v_budget from pilot.plaid_item_budget where id = 1 for update;
  select * into v_pilot from pilot.plaid_students where student_id = v_student for update;
  if v_pilot.student_id is null or v_budget.id is null then
    return false;
  end if;
  if v_pilot.claimed >= v_pilot.allowance or v_budget.used >= v_budget.budget then
    return false;
  end if;
  update pilot.plaid_item_budget set used = used + 1 where id = 1;
  update pilot.plaid_students set claimed = claimed + 1 where student_id = v_student;
  return true;
end;
$$;

revoke all on function public.plaid_pilot_access() from public, anon, authenticated, service_role;
revoke all on function public.claim_plaid_item_slot() from public, anon, authenticated, service_role;
grant execute on function public.plaid_pilot_access() to authenticated;
grant execute on function public.claim_plaid_item_slot() to authenticated;
