create table public.card_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  card_id text,
  card_name text,
  source text not null check (source in ('application', 'added')),
  status text not null check (status in ('applied', 'approved', 'rejected')),
  credit_limit numeric(10, 2) check (credit_limit >= 0),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_limit_only_if_approved
    check (status = 'approved' or credit_limit is null),
  constraint card_is_identified
    check (card_id is not null or card_name is not null)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger card_applications_set_updated_at
  before update on public.card_applications
  for each row execute function public.set_updated_at();

grant select, insert, update on public.card_applications to authenticated;

alter table public.card_applications enable row level security;

create policy "Users can read their own card record"
  on public.card_applications for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own card record"
  on public.card_applications for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own card record"
  on public.card_applications for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
