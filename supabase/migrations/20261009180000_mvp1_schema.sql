-- card_applications: match the API data contract and allow many per student

alter table public.card_applications rename column user_id to student_id;

alter table public.card_applications drop constraint card_applications_user_id_key;

create unique index card_applications_one_active_per_card
  on public.card_applications (student_id, card_id)
  where card_id is not null and status in ('applied', 'approved');

create index card_applications_student_id_idx
  on public.card_applications (student_id);

alter table public.card_applications
  add column rejected_at timestamptz,
  add column denial_reason text check (denial_reason in (
    'no_credit_history', 'could_not_verify', 'report_frozen',
    'income', 'something_else', 'no_letter_yet'
  )),
  add column autopay_status text not null default 'unknown'
    check (autopay_status in ('on', 'off', 'unknown')),
  add column autopay_updated_at timestamptz,
  add column statement_closing_day smallint check (statement_closing_day between 1 and 31),
  add column payment_due_day smallint check (payment_due_day between 1 and 31);

-- profiles: one per student, time zone for reminder scheduling
create table public.profiles (
  student_id uuid primary key references auth.users (id) on delete cascade,
  time_zone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- quiz_drafts: one resumable draft per student
create table public.quiz_drafts (
  student_id uuid primary key references auth.users (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger quiz_drafts_set_updated_at
  before update on public.quiz_drafts
  for each row execute function public.set_updated_at();

-- recommendations: the exact result shown to the student
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  fit_tier text not null check (fit_tier in ('likely_fit', 'stretch', 'not_yet')),
  reason text,
  answer_snapshot jsonb,
  result_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index recommendations_student_created_idx
  on public.recommendations (student_id, created_at desc);

-- issuer_clicks: one row per click, a click is not an application
create table public.issuer_clicks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  kind text not null check (kind in ('preapproval', 'apply')),
  clicked_at timestamptz not null default now()
);

create index issuer_clicks_student_idx
  on public.issuer_clicks (student_id);

-- grants: only what each table needs
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.quiz_drafts to authenticated;
grant select on public.recommendations to authenticated;
grant select, insert on public.issuer_clicks to authenticated;

alter table public.profiles enable row level security;
alter table public.quiz_drafts enable row level security;
alter table public.recommendations enable row level security;
alter table public.issuer_clicks enable row level security;

-- profiles
create policy "Students can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "Students can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = student_id);
create policy "Students can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

-- quiz_drafts
create policy "Students can read their own quiz draft"
  on public.quiz_drafts for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "Students can create their own quiz draft"
  on public.quiz_drafts for insert to authenticated
  with check ((select auth.uid()) = student_id);
create policy "Students can update their own quiz draft"
  on public.quiz_drafts for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

-- recommendations: read only for students
create policy "Students can read their own recommendations"
  on public.recommendations for select to authenticated
  using ((select auth.uid()) = student_id);

-- issuer_clicks: append only
create policy "Students can read their own clicks"
  on public.issuer_clicks for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "Students can add their own clicks"
  on public.issuer_clicks for insert to authenticated
  with check ((select auth.uid()) = student_id);
