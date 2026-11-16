-- Created with Claude Code (2026-11-15). Undoes
-- 20261116000000_plaid_transaction_descriptions.sql: the totals and the sync
-- go back to their earlier definitions, the shared rules are dropped, and the
-- description and payment_app columns are deleted with what they hold.

create or replace function public.income_by_month(p_months integer default 3)
returns table (month date, income_cents bigint, transaction_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', t.posted_on)::date,
         (-sum(t.amount_cents))::bigint,
         count(*)::integer
  from plaid.transactions t
  where t.student_id = auth.uid()
    and not t.pending
    and t.amount_cents < 0
    and (
      t.category = 'INCOME'
      or (
        t.category = 'TRANSFER_IN'
        and coalesce(t.category_detailed, '') not in (
          'TRANSFER_IN_ACCOUNT_TRANSFER',
          'TRANSFER_IN_SAVINGS',
          'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
          'TRANSFER_IN_CASH_ADVANCES_AND_LOANS',
          'TRANSFER_IN_TRANSFER_IN_FROM_APPS'
        )
        and not exists (
          select 1
          from plaid.transactions o
          where o.student_id = t.student_id
            and o.account_id <> t.account_id
            and not o.pending
            and o.category = 'TRANSFER_OUT'
            and o.amount_cents = -t.amount_cents
            and o.posted_on between t.posted_on - 3 and t.posted_on + 3
        )
        and (
          t.category_detailed = 'TRANSFER_IN_DEPOSIT'
          or (
            nullif(btrim(t.merchant_name), '') is not null
            and btrim(t.merchant_name) !~* '^(venmo|cash ?app|pay ?pal)$'
            and btrim(t.merchant_name) !~* '\m(venmo|cash ?app|pay ?pal)\M.*\m(cash[ -]?out|transfer)\M'
          )
        )
      )
    )
    and t.posted_on >= (date_trunc('month', current_date)
                        - make_interval(months => greatest(1, least(coalesce(p_months, 3), 3)) - 1))::date
  group by 1
  order by 1;
$$;
revoke execute on function public.income_by_month(integer) from public, anon;
grant execute on function public.income_by_month(integer) to authenticated;

create or replace function public.spending_by_detailed_category(p_month date)
returns table (
  category text,
  category_detailed text,
  -- posted money out (Plaid's positive amounts), in cents
  out_cents bigint,
  -- posted money in (Plaid's negative amounts, as a positive number), in cents
  in_cents bigint,
  transaction_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.category,
         t.category_detailed,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::bigint,
         coalesce(-sum(t.amount_cents) filter (where t.amount_cents < 0), 0)::bigint,
         count(*)::integer
  from plaid.transactions t
  where t.student_id = auth.uid()
    and not t.pending
    and p_month is not null
    and t.posted_on >= date_trunc('month', p_month)::date
    and t.posted_on < (date_trunc('month', p_month) + interval '1 month')::date
    and (
      t.category is distinct from 'TRANSFER_OUT'
      or (
        coalesce(t.category_detailed, '') not in (
          'TRANSFER_OUT_SAVINGS',
          'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS'
        )
        and (
          t.category_detailed = 'TRANSFER_OUT_WITHDRAWAL'
          or t.merchant_name ~* '\m(venmo|zelle|cash ?app|pay ?pal)\M'
          or (
            coalesce(t.category_detailed, '') <> 'TRANSFER_OUT_ACCOUNT_TRANSFER'
            and nullif(btrim(t.merchant_name), '') is not null
          )
        )
        and not exists (
          select 1
          from plaid.transactions i
          where i.student_id = t.student_id
            and i.account_id <> t.account_id
            and not i.pending
            and i.category = 'TRANSFER_IN'
            and i.amount_cents = -t.amount_cents
            and i.posted_on between t.posted_on - 3 and t.posted_on + 3
        )
      )
    )
  group by t.category, t.category_detailed
  order by 3 desc, 1, 2;
$$;
revoke execute on function public.spending_by_detailed_category(date) from public, anon;
grant execute on function public.spending_by_detailed_category(date) to authenticated;

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


revoke execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.apply_plaid_transactions_sync(text, text, jsonb, jsonb, jsonb, text) to authenticated;

drop function if exists plaid.is_income(plaid.transactions);
drop function if exists plaid.is_spending(plaid.transactions);
drop function if exists plaid.payment_app_of(plaid.transactions);
drop function if exists plaid.names_own_account(text);
drop function if exists plaid.is_cash_out(text);
alter table plaid.transactions drop column if exists description;
alter table plaid.transactions drop column if exists payment_app;
