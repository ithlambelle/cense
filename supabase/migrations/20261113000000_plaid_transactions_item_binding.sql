-- US-14 review fixes (Mabelle and Ben, Nov 12): bind a transactions sync to
-- the Plaid Item it was read from, and refuse a batch that started from an
-- outdated cursor. Two races the first version (20261106210000) let through,
-- both reproduced by Ben on PGlite:
-- 1. A disconnect and relink finishing while a sync is in flight: the old
--    Item's rows and cursor landed on the new link.
-- 2. Two refreshes for the same Item reading the same cursor: the row lock
--    made their writes take turns, but the older batch could still commit
--    last, putting back a removed pending row and an older cursor.
-- Now the cursor is read for one Item, and the apply takes that Item and the
-- cursor it started from. Under the existing row lock it saves nothing and
-- answers false when the caller's linked Item is a different one or the
-- saved cursor moved on. Cursors are compared with `is distinct from`, with
-- '' treated as no cursor, because the app saves `cursor ?? ""`.
--
-- 20261106210000 is already applied (preview and production), and changing a
-- function's arguments with `create or replace` adds an overload and leaves
-- the old one callable, so the old signatures are dropped first.
--
-- Applied by hand in the Supabase SQL editor after 20261109160000: cense-preview
-- first, then production. Safe to run again.

drop function if exists public.plaid_transactions_cursor();
drop function if exists public.apply_plaid_transactions_sync(jsonb, jsonb, jsonb, text);

-- the caller's cursor for that Item, null before its first sync or when the
-- caller's linked Item is a different one
create or replace function public.plaid_transactions_cursor(p_item_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.transactions_cursor from plaid.items i
  where i.student_id = auth.uid() and i.item_id = p_item_id;
$$;

-- One finished Transactions Sync (every page) for the caller's Item p_item_id,
-- read from p_start_cursor: added and modified rows are saved, removed ids
-- deleted, and the cursor moved to p_cursor, all at once. Rows older than 180
-- days are skipped. When an id appears more than once, the last modified entry
-- wins. Refused with program_limit_exceeded (54000), saving nothing, when the
-- caller would keep more than 10,000 rows. False, saving nothing, when the
-- caller has no linked bank, their linked Item is not p_item_id (disconnected
-- or relinked while Plaid answered), or their saved cursor is no longer
-- p_start_cursor (another sync saved first).
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
    (student_id, transaction_id, account_id, posted_on, amount_cents, pending, category, category_detailed, merchant_name)
  select distinct on (x.transaction_id)
    v_student, x.transaction_id, x.account_id, x.posted_on, x.amount_cents, coalesce(x.pending, false),
    x.category, x.category_detailed, nullif(left(x.merchant_name, 100), '')
  from (
    select r.*, 1 as source, e.ord
    from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text)
    union all
    select r.*, 2 as source, e.ord
    from jsonb_array_elements(coalesce(p_modified, '[]'::jsonb)) with ordinality as e(item, ord),
      jsonb_to_record(e.item) as r(transaction_id text, account_id text, posted_on date, amount_cents bigint,
        pending boolean, category text, category_detailed text, merchant_name text)
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
    merchant_name = excluded.merchant_name;

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

revoke execute on function public.plaid_transactions_cursor(text) from public, anon;
revoke execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.plaid_transactions_cursor(text) to authenticated;
grant execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) to authenticated;
