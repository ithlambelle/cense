-- Created with Claude Code (2026-11-18). Disconnect never waits on Plaid
-- (Figma E3, 709:1664; Ben, Nov 18: "Delete our copy now even if Plaid is
-- down? Yes.").
--
-- Before: Disconnect asked Plaid to remove the Item (/item/remove) first and
-- deleted our copy only after Plaid said yes. When Plaid could not be
-- reached, nothing was deleted and the student was told to try again later.
--
-- Now: disconnect_bank_link(p_done_item_ids) deletes our copy at once, in
-- one transaction: the token row (which takes the transactions with it) and
-- the link (which takes the balances, bill answers and budget amounts with
-- it), exactly what delete_bank_link() deletes. Before deleting, it copies
-- the encrypted token of each of the caller's Items into
-- plaid.account_cleanup, except the ones listed in p_done_item_ids. That is
-- the queue account deletion already uses (20261109160000_plaid_account_cleanup.sql,
-- 20261117110000_security_quotas.sql). The daily reminders cron claims those
-- rows and calls Plaid /item/remove until Plaid confirms, retrying Plaid
-- errors for ever; it gives up only on tokens that never open.
--
-- p_done_item_ids lists the Items that must not be queued: Plaid confirmed
-- them removed (or already gone), or their token does not open, so Plaid can
-- never be asked (web/src/lib/plaid/unlink.ts). Every other Item of the
-- caller's is queued, so a call that lists too little queues too much and
-- never leaves a live Item at Plaid with no token: an empty list queues
-- everything. Only the caller's own Items are touched; ids that are not the
-- caller's change nothing.
--
-- A cap, because any signed-in student can call save_bank_link with a value
-- shaped like a sealed token and then this function, queueing a row the cron
-- can never open: after 5 failures such a row is kept for ever, the cleanup
-- check fails, and real rows wait behind it (the cron claims the 5 oldest at
-- a time). When this call would queue an Item and the caller already has 3
-- or more rows in plaid.account_cleanup, it raises 54000 and changes
-- nothing; the app answers 429 and the student keeps their bank until the
-- daily job has removed the earlier ones. A real student queues one row per
-- Disconnect while Plaid is down, and the job removes it once Plaid is back.
-- A Disconnect that queues nothing is never refused. Calls for the same
-- student run one at a time (an advisory lock), so racing calls cannot pass
-- the cap together.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production. Safe to run again. Either order with the app code is safe:
-- the app falls back to the old disconnect (Plaid first, then
-- delete_bank_link) while this function is missing, and the old app never
-- calls it. Apply it first anyway, so the new behavior starts when the code
-- deploys. To undo: supabase/rollbacks/20261118200000_disconnect_never_blocked.down.sql.

-- An earlier draft named the parameter p_queue_item_ids, and create or
-- replace cannot rename a parameter, so the function is dropped and made
-- again. Nothing in the database depends on it.
drop function if exists public.disconnect_bank_link(text[]);

-- True when anything was deleted.
create function public.disconnect_bank_link(p_done_item_ids text[])
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
  -- one disconnect at a time per student, so racing calls cannot pass the cap
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('disconnect_bank_link:' || v_student::text, 0));
  -- the cap, checked before anything changes, only when an Item would be queued
  if exists (
    select 1 from plaid.items i
    where i.student_id = v_student
      and not coalesce(i.item_id = any (p_done_item_ids), false)
  ) and (select count(*) from plaid.account_cleanup q where q.student_id = v_student) >= 3 then
    raise exception 'too many bank removals waiting' using errcode = '54000';
  end if;
  -- every Item of the caller's not listed as done (a null list lists none)
  insert into plaid.account_cleanup (student_id, item_id, token_ciphertext)
  select i.student_id, i.item_id, i.token_ciphertext
  from plaid.items i
  where i.student_id = v_student
    and not coalesce(i.item_id = any (p_done_item_ids), false)
  on conflict (item_id) do nothing;
  delete from plaid.items where student_id = v_student;
  get diagnostics v_items = row_count;
  delete from public.bank_links where student_id = v_student;
  get diagnostics v_links = row_count;
  return v_items + v_links > 0;
end;
$$;

-- signed-in students only, never anon
revoke execute on function public.disconnect_bank_link(text[]) from public, anon;
grant execute on function public.disconnect_bank_link(text[]) to authenticated;
