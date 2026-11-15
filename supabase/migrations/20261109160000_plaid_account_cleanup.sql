-- Apply before deploying #84. Account deletion must not wait for Plaid.
-- The BEFORE DELETE trigger copies the encrypted token in the same transaction
-- as the auth deletion, before the FK cascade destroys it. Rollback restores
-- both; no worker can observe a queue entry for a deletion that did not commit.
-- Only the token and its AES-GCM binding survive, until /item/remove succeeds.
create table if not exists plaid.account_cleanup (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null, -- encryption binding, deliberately no auth FK
  item_id text not null unique,
  token_ciphertext text not null check (token_ciphertext like 'v1.%' and char_length(token_ciphertext) <= 1000),
  created_at timestamptz not null default now(),
  retry_at timestamptz not null default now(),
  claim_id uuid,
  attempts integer not null default 0
);
revoke all on table plaid.account_cleanup from public, anon, authenticated, service_role;
alter table plaid.account_cleanup enable row level security;

create or replace function plaid.queue_account_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into plaid.account_cleanup (student_id, item_id, token_ciphertext)
  select student_id, item_id, token_ciphertext from plaid.items where student_id = old.id
  on conflict (item_id) do nothing;
  return old;
end;
$$;
revoke all on function plaid.queue_account_cleanup() from public, anon, authenticated, service_role;
drop trigger if exists queue_plaid_account_cleanup on auth.users;
create trigger queue_plaid_account_cleanup before delete on auth.users
for each row execute function plaid.queue_account_cleanup();

-- Deployment guard: the route must not discard tokens on an unmigrated DB.
create or replace function public.plaid_account_cleanup_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'queue_plaid_account_cleanup' and tgenabled in ('O', 'A'));
$$;

-- At most five calls in parallel (10s Plaid timeout), alongside the existing
-- reminder job. A crashed worker's claims become available after 15 minutes.
create or replace function public.claim_plaid_account_cleanup()
returns table (id uuid, student_id uuid, item_id text, token_ciphertext text, claim_id uuid)
language sql security definer set search_path = '' as $$
  with due as (
    select q.id from plaid.account_cleanup q where q.retry_at <= now()
    order by q.retry_at, q.id limit 5 for update skip locked
  )
  update plaid.account_cleanup q
  set claim_id = gen_random_uuid(), retry_at = now() + interval '15 minutes', attempts = attempts + 1
  from due where q.id = due.id
  returning q.id, q.student_id, q.item_id, q.token_ciphertext, q.claim_id;
$$;

-- A stale worker cannot acknowledge a newer claim. Failed and unreadable
-- tokens stay encrypted for a later retry and an operator alert, never dropped.
create or replace function public.finish_plaid_account_cleanup(p_id uuid, p_claim_id uuid, p_removed boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_removed then
    delete from plaid.account_cleanup where id = p_id and claim_id = p_claim_id;
  else
    update plaid.account_cleanup set claim_id = null, retry_at = now() + interval '1 day'
    where id = p_id and claim_id = p_claim_id;
  end if;
  return found;
end;
$$;

revoke all on function public.plaid_account_cleanup_ready() from public, anon, authenticated;
revoke all on function public.claim_plaid_account_cleanup() from public, anon, authenticated;
revoke all on function public.finish_plaid_account_cleanup(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.plaid_account_cleanup_ready() to service_role;
grant execute on function public.claim_plaid_account_cleanup() to service_role;
grant execute on function public.finish_plaid_account_cleanup(uuid, uuid, boolean) to service_role;
