-- Safe to spend on a Plaid sandbox bank (US-12, MVP2 Flow C): one linked
-- bank per student, its account balances, the student's answers about who
-- covers which bills, and an amount kept aside. The app computes safe to
-- spend from these; the number itself is not stored.
--
-- Never stored: transactions, account or routing numbers, Plaid's public
-- token, any Plaid response. The access token is stored only as AES-256-GCM
-- ciphertext made by the app with a key kept in the app's environment
-- (PLAID_TOKEN_KEY), never in the database, in a schema the Data API does not
-- serve. Someone holding a database dump, the service role key or dashboard
-- access sees ciphertext only.
--
-- Who can do what, all through the student's own session (no service role):
-- - students read their own bank_links and bank_balances, and read and write
--   their own bill_coverage and set-aside amount (row level security);
-- - linking, saving balances, marking the bank as needing a new sign-in or a
--   new link, and disconnecting go through the functions below, each acting on auth.uid()
--   only, so a student calling one directly can change only their own rows;
-- - bank_link_secret() returns the caller's own token ciphertext, which is
--   useless without the app's key.
-- Disconnecting (delete_bank_link) deletes the token row and bank_links, which
-- cascades to the balances and answers. Deleting the account cascades too, but
-- the app must remove the Item at Plaid first (/item/remove) or Plaid keeps it.
--
-- Applied by hand in the Supabase SQL editor, after
-- 20261024220000_reminder_sender.sql. Safe to run again.

-- the token, out of the Data API's reach
create schema if not exists plaid;
revoke all on schema plaid from public, anon, authenticated;

create table if not exists plaid.items (
  student_id uuid primary key references auth.users (id) on delete cascade,
  item_id text not null unique check (char_length(item_id) between 1 and 200),
  -- "v1." then base64url(iv, tag, ciphertext): web/src/lib/plaid/token-box.ts
  token_ciphertext text not null check (token_ciphertext like 'v1.%' and char_length(token_ciphertext) <= 1000),
  created_at timestamptz not null default now()
);
revoke all on table plaid.items from public, anon, authenticated;

-- the linked bank, as the student sees it
create table if not exists public.bank_links (
  student_id uuid primary key references auth.users (id) on delete cascade,
  institution_name text not null check (char_length(institution_name) between 1 and 100),
  -- reconnect_needed: Plaid answered ITEM_LOGIN_REQUIRED; Link in update mode
  -- fixes it. relink_needed: the Item is gone at Plaid (removed at my.plaid.com)
  -- or its token cannot be opened; only disconnecting and linking again fixes it.
  status text not null default 'active' check (status in ('active', 'reconnect_needed', 'relink_needed')),
  linked_at timestamptz not null default now(),
  -- when balances were last read from Plaid
  refreshed_at timestamptz,
  -- kept out of safe to spend each month, saved with the bill answers
  set_aside_cents bigint not null default 0 check (set_aside_cents between 0 and 10000000),
  -- when the student last answered who covers which bills; null until then
  answered_at timestamptz
);

-- the same status rule on a table made by an earlier draft of this file
alter table public.bank_links drop constraint if exists bank_links_status_check;
alter table public.bank_links add constraint bank_links_status_check
  check (status in ('active', 'reconnect_needed', 'relink_needed'));

-- one row per account read at the last refresh. Loans and investments are
-- never stored. kind: cash (checking and other everyday accounts, counted),
-- card (a credit card's balance owed, subtracted) or other (savings and
-- similar, shown as not counted).
create table if not exists public.bank_balances (
  student_id uuid not null references public.bank_links (student_id) on delete cascade,
  position smallint not null check (position between 0 and 49),
  name text not null check (char_length(name) between 1 and 100),
  mask text check (mask ~ '^[0-9A-Za-z]{1,4}$'),
  kind text not null check (kind in ('cash', 'card', 'other')),
  balance_cents bigint not null check (balance_cents between -100000000000 and 100000000000),
  primary key (student_id, position)
);

-- who covers each bill (Figma 222:2090). monthly_cents is the student's own
-- amount: the bill for "me", their share for "split"; tuition is asked per
-- semester and stored as its monthly figure. due_day is the day of the month
-- a bill they pay is due; safe to spend subtracts only the bills still to
-- come this month (Ben, Oct 27). Tuition has no due day.
create table if not exists public.bill_coverage (
  student_id uuid not null references public.bank_links (student_id) on delete cascade,
  bill text not null check (bill in ('rent', 'phone', 'tuition', 'groceries', 'car')),
  covered_by text not null check (covered_by in ('me', 'family', 'split', 'none')),
  monthly_cents bigint check (monthly_cents between 0 and 10000000),
  due_day smallint check (due_day between 1 and 31),
  constraint bill_coverage_amount_when_paying
    check ((covered_by in ('me', 'split')) = (monthly_cents is not null)),
  constraint bill_coverage_due_day_when_paying
    check (((covered_by in ('me', 'split')) and bill <> 'tuition') = (due_day is not null)),
  primary key (student_id, bill)
);

-- the due day on a table made by an earlier draft of this file (no rows
-- there yet outside local stacks)
alter table public.bill_coverage add column if not exists due_day smallint check (due_day between 1 and 31);
alter table public.bill_coverage drop constraint if exists bill_coverage_due_day_when_paying;
alter table public.bill_coverage add constraint bill_coverage_due_day_when_paying
  check (((covered_by in ('me', 'split')) and bill <> 'tuition') = (due_day is not null));

-- Supabase's default privileges give anon and authenticated every privilege
-- on new tables in public. Take them back so the grants below are the only ones.
revoke all on table public.bank_links, public.bank_balances, public.bill_coverage from anon, authenticated;

-- link a bank for the caller: the item, the token ciphertext and the bank's
-- name. Fails with unique_violation (23505) when the caller already has one;
-- the app then removes the new Item at Plaid.
create or replace function public.save_bank_link(p_item_id text, p_token_ciphertext text, p_institution_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
begin
  if v_student is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into plaid.items (student_id, item_id, token_ciphertext)
  values (v_student, p_item_id, p_token_ciphertext);
  -- a bank_links row left without a token (never expected) is replaced
  delete from public.bank_links where student_id = v_student;
  insert into public.bank_links (student_id, institution_name)
  values (v_student, p_institution_name);
end;
$$;

-- the caller's own item and token ciphertext, for the app to decrypt
create or replace function public.bank_link_secret()
returns table (item_id text, token_ciphertext text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.item_id, i.token_ciphertext
  from plaid.items i
  where i.student_id = auth.uid();
$$;

-- the balances just read from Plaid replace the caller's old ones, and the
-- link is active again. False when the caller has no linked bank (it was
-- disconnected while Plaid answered).
create or replace function public.save_bank_balances(p_accounts jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
begin
  if v_student is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- held until the end, so a disconnect cannot land halfway through
  perform 1 from public.bank_links where student_id = v_student for update;
  if not found then
    return false;
  end if;
  delete from public.bank_balances where student_id = v_student;
  insert into public.bank_balances (student_id, position, name, mask, kind, balance_cents)
  select v_student, a.position, a.name, a.mask, a.kind, a.balance_cents
  from jsonb_to_recordset(coalesce(p_accounts, '[]'::jsonb))
    as a(position smallint, name text, mask text, kind text, balance_cents bigint);
  update public.bank_links
  set refreshed_at = now(), status = 'active'
  where student_id = v_student;
  return true;
end;
$$;

-- Plaid says the bank needs the student to sign in again (reconnect_needed),
-- or the Item is gone (relink_needed). Only a good read sets it active again.
drop function if exists public.mark_bank_link_reconnect();
create or replace function public.mark_bank_link_status(p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status is null or p_status not in ('reconnect_needed', 'relink_needed') then
    raise exception 'unknown bank link status' using errcode = '22023';
  end if;
  update public.bank_links set status = p_status where student_id = auth.uid();
end;
$$;

-- disconnect: the token row and the link, which cascades to the balances and
-- answers. Called after Plaid removed the Item. True when anything was deleted.
create or replace function public.delete_bank_link()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_items int;
  v_links int;
begin
  if v_student is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from plaid.items where student_id = v_student;
  get diagnostics v_items = row_count;
  delete from public.bank_links where student_id = v_student;
  get diagnostics v_links = row_count;
  return v_items + v_links > 0;
end;
$$;

-- the caller's bill answers and set-aside, replaced together. Runs as the
-- caller, so row level security and the grants below apply. False when the
-- caller has no linked bank.
create or replace function public.save_safe_to_spend_answers(p_bills jsonb, p_set_aside_cents bigint)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
begin
  update public.bank_links
  set set_aside_cents = p_set_aside_cents, answered_at = now()
  where student_id = v_student;
  if not found then
    return false;
  end if;
  delete from public.bill_coverage where student_id = v_student;
  insert into public.bill_coverage (student_id, bill, covered_by, monthly_cents, due_day)
  select v_student, b.bill, b.covered_by, b.monthly_cents, b.due_day
  from jsonb_to_recordset(coalesce(p_bills, '[]'::jsonb))
    as b(bill text, covered_by text, monthly_cents bigint, due_day smallint);
  return true;
end;
$$;

-- who can run what: signed-in students only, never anon
revoke execute on function public.save_bank_link(text, text, text) from public, anon;
revoke execute on function public.bank_link_secret() from public, anon;
revoke execute on function public.save_bank_balances(jsonb) from public, anon;
revoke execute on function public.mark_bank_link_status(text) from public, anon;
revoke execute on function public.delete_bank_link() from public, anon;
revoke execute on function public.save_safe_to_spend_answers(jsonb, bigint) from public, anon;
grant execute on function public.save_bank_link(text, text, text) to authenticated;
grant execute on function public.bank_link_secret() to authenticated;
grant execute on function public.save_bank_balances(jsonb) to authenticated;
grant execute on function public.mark_bank_link_status(text) to authenticated;
grant execute on function public.delete_bank_link() to authenticated;
grant execute on function public.save_safe_to_spend_answers(jsonb, bigint) to authenticated;

-- grants: students read their link and balances, change only the set-aside
-- and answered time on the link, and keep their own bill answers
grant select on public.bank_links to authenticated;
grant update (set_aside_cents, answered_at) on public.bank_links to authenticated;
grant select on public.bank_balances to authenticated;
grant select, insert, update, delete on public.bill_coverage to authenticated;

alter table public.bank_links enable row level security;
alter table public.bank_balances enable row level security;
alter table public.bill_coverage enable row level security;

drop policy if exists "Students can read their own bank link" on public.bank_links;
create policy "Students can read their own bank link"
  on public.bank_links for select to authenticated
  using ((select auth.uid()) = student_id);
drop policy if exists "Students can change their own set-aside" on public.bank_links;
create policy "Students can change their own set-aside"
  on public.bank_links for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

drop policy if exists "Students can read their own balances" on public.bank_balances;
create policy "Students can read their own balances"
  on public.bank_balances for select to authenticated
  using ((select auth.uid()) = student_id);

drop policy if exists "Students can read their own bill answers" on public.bill_coverage;
create policy "Students can read their own bill answers"
  on public.bill_coverage for select to authenticated
  using ((select auth.uid()) = student_id);
drop policy if exists "Students can add their own bill answers" on public.bill_coverage;
create policy "Students can add their own bill answers"
  on public.bill_coverage for insert to authenticated
  with check ((select auth.uid()) = student_id);
drop policy if exists "Students can change their own bill answers" on public.bill_coverage;
create policy "Students can change their own bill answers"
  on public.bill_coverage for update to authenticated
  using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);
drop policy if exists "Students can delete their own bill answers" on public.bill_coverage;
create policy "Students can delete their own bill answers"
  on public.bill_coverage for delete to authenticated
  using ((select auth.uid()) = student_id);
