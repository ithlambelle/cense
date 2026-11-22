-- Undo 20261119000000_plaid_transactions_two_years.sql: back to 180 days and
-- the sync as in 20261116000000. The three new columns are dropped with
-- whatever they hold. Rows between 180 and 730 days old are kept until the
-- next daily purge deletes them. Run by hand in the Supabase SQL editor,
-- cense-preview first. Safe to run again.

create or replace function public.apply_plaid_transactions_sync(
  p_item_id text,
  p_start_cursor text,
  p_added jsonb,
  p_modified jsonb,
  p_removed jsonb,
  p_cursor text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_item text;
  v_cursor text;
  v_kept integer;
begin
  if v_student is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  -- held until the end, so a disconnect cannot land halfway through, and two
  -- syncs for the same student check the cursor and count rows one at a time
  select i.item_id, i.transactions_cursor into v_item, v_cursor
  from plaid.items i where i.student_id = v_student for update;
  if not found or v_item is distinct from p_item_id then
    return false;
  end if;
  if nullif(v_cursor, '') is distinct from nullif(p_start_cursor, '') then
    return false;
  end if;

  insert into plaid.transactions as t
    (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name,
     description, payment_app)
  select distinct on (x.transaction_id)
    v_student, x.transaction_id, x.account_id, x.posted_on, x.amount_cents, coalesce(x.pending, false),
    x.category, x.category_detailed, nullif(left(x.merchant_name, 100), ''),
    nullif(left(x.description, 200), ''),
    case when x.payment_app in ('venmo', 'zelle', 'cash_app', 'paypal', 'apple_cash') then x.payment_app end
  from (
    select r.*, 1 as source, e.ord
    from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text, description text, payment_app text)
    union all
    select r.*, 2 as source, e.ord
    from jsonb_array_elements(coalesce(p_modified, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text, description text, payment_app text)
  ) x
  where x.posted_on >= current_date - 180
  order by x.transaction_id, x.source desc, x.ord desc
  on conflict (student_id, transaction_id) do update set
    account_id = excluded.account_id,
    posted_on = excluded.posted_on,
    amount_cents = excluded.amount_cents,
    pending = excluded.pending,
    category = excluded.category,
    category_detailed = excluded.category_detailed,
    merchant_name = excluded.merchant_name,
    -- an older app that sends no description never wipes one already saved
    description = coalesce(excluded.description, t.description),
    payment_app = coalesce(excluded.payment_app, t.payment_app);

  delete from plaid.transactions t
  where t.student_id = v_student
    and t.transaction_id in (select jsonb_array_elements_text(coalesce(p_removed, '[]'::jsonb)));

  -- counted after the removals, so ids sent again (already kept) never count twice
  select count(*) into v_kept from plaid.transactions where student_id = v_student;
  if v_kept > 10000 then
    raise exception 'too many transactions kept' using errcode = '54000';
  end if;

  update plaid.items
  set transactions_cursor = p_cursor, transactions_synced_at = now()
  where student_id = v_student and item_id = p_item_id;
  return true;
end;
$$;

revoke execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) to authenticated;

create or replace function public.purge_old_plaid_transactions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from plaid.transactions where posted_on < current_date - 180;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.purge_old_plaid_transactions() from public, anon, authenticated;
grant execute on function public.purge_old_plaid_transactions() to service_role;

alter table plaid.transactions drop column if exists counterparty_name;
alter table plaid.transactions drop column if exists location_city;
alter table plaid.transactions drop column if exists location_state;
