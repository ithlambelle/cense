-- US-07: record when an application was rejected
create or replace function public.set_rejected_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'rejected' then
    if tg_op = 'INSERT' or old.status is distinct from 'rejected' then
      new.rejected_at = now();
    end if;
  else
    new.rejected_at = null;
    new.denial_reason = null;
  end if;
  return new;
end;
$$;

create trigger card_applications_set_rejected_at
  before insert or update of status on public.card_applications
  for each row execute function public.set_rejected_at();

-- US-02: create a profile row for every new student, whatever the sign-in method
create or replace function public.handle_new_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (student_id)
  values (new.id)
  on conflict (student_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_student();

-- backfill students who signed up before this trigger existed
insert into public.profiles (student_id)
select id from auth.users
on conflict (student_id) do nothing;

-- US-01: allow saving a "no suitable card" result
alter table public.recommendations alter column card_id drop not null;
