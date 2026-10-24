-- MVP2 backend for reminders (C2) and the first-month and denial plans (C3).
--
-- reminders: one row per reminder email. The cron job (Mabelle's route) runs
-- with the service role: it claims due rows, sends, then sets sent_at. The
-- unique (card_application_id, kind, occurrence) means one reminder can never
-- be stored, or sent, twice.
--
-- plan_steps: one row per finished plan step (a lit star). Undo deletes the
-- row. Autopay is not a step here: the plan reads card_applications.autopay_status.
--
-- Both tables point at the student's own card application with a composite
-- foreign key (card_application_id, student_id), so a row can never pair one
-- student with another student's application.

-- lets the composite foreign keys below reference (id, student_id)
alter table public.card_applications
  add constraint card_applications_id_student_key unique (id, student_id);

-- reminders
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  card_application_id uuid not null,
  kind text not null check (kind in ('reapply', 'statement_closing', 'payment_due')),
  -- which cycle this reminder is for, e.g. the due date it warns about
  occurrence date not null,
  due_at timestamptz not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reminders_application_fkey
    foreign key (card_application_id, student_id)
    references public.card_applications (id, student_id) on delete cascade,
  constraint reminders_one_per_occurrence
    unique (card_application_id, kind, occurrence),
  constraint reminders_sent_after_claim
    check (sent_at is null or claimed_at is not null)
);

create index reminders_student_idx on public.reminders (student_id);

-- what the cron job looks for: due and not sent yet
create index reminders_due_unsent_idx
  on public.reminders (due_at)
  where sent_at is null;

-- plan_steps
create table public.plan_steps (
  student_id uuid not null references auth.users (id) on delete cascade,
  card_application_id uuid not null,
  plan text not null check (plan in ('first_month', 'denial')),
  step text not null check (step ~ '^[a-z][a-z_]{0,39}$'),
  completed_at timestamptz not null default now(),
  primary key (card_application_id, plan, step),
  constraint plan_steps_application_fkey
    foreign key (card_application_id, student_id)
    references public.card_applications (id, student_id) on delete cascade
);

create index plan_steps_student_idx on public.plan_steps (student_id);

-- new columns
-- the student's own words about a denial: at most 200 characters, never sent to analytics
alter table public.card_applications
  add column denial_reason_note text
    check (char_length(denial_reason_note) <= 200);

-- when the student last opened their updates
alter table public.profiles
  add column updates_seen_at timestamptz;

-- clear the note along with denial_reason when an application is no longer rejected
create or replace function public.set_rejected_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'rejected' then
    if tg_op = 'INSERT' or old.status is distinct from 'rejected' then
      new.rejected_at = now();
    else
      -- still rejected: keep the original time
      new.rejected_at = coalesce(old.rejected_at, now());
    end if;
  else
    new.rejected_at = null;
    new.denial_reason = null;
    new.denial_reason_note = null;
  end if;
  return new;
end;
$$;

-- grants: students read and create their reminders; only the cron job
-- (service role) claims or marks them sent. Plan steps are added and undone.
grant select, insert on public.reminders to authenticated;
grant select, insert, delete on public.plan_steps to authenticated;

alter table public.reminders enable row level security;
alter table public.plan_steps enable row level security;

create policy "Students can read their own reminders"
  on public.reminders for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "Students can add their own reminders"
  on public.reminders for insert to authenticated
  with check ((select auth.uid()) = student_id and claimed_at is null and sent_at is null);

create policy "Students can read their own plan steps"
  on public.plan_steps for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "Students can complete their own plan steps"
  on public.plan_steps for insert to authenticated
  with check ((select auth.uid()) = student_id);
create policy "Students can undo their own plan steps"
  on public.plan_steps for delete to authenticated
  using ((select auth.uid()) = student_id);
