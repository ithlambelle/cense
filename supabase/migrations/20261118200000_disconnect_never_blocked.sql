-- Created with Claude Code (2026-11-18). Disconnect never waits on Plaid
-- (Figma E3, 709:1664; Ben, Nov 18: "Delete our copy now even if Plaid is
-- down? Yes.").
--
-- Before: Disconnect asked Plaid to remove the Item (/item/remove) first and
-- deleted our copy only after Plaid said yes. When Plaid could not be
-- reached, nothing was deleted and the student was told to try again later.
--
-- Now: disconnect_bank_link(p_queue_item_ids) deletes our copy at once, in
-- one transaction: the token row (which takes the transactions with it) and
-- the link (which takes the balances, bill answers and budget amounts with
-- it), exactly what delete_bank_link() deletes. Before deleting, it copies
-- the encrypted token of each listed Item into plaid.account_cleanup, the
-- queue account deletion already uses (20261109160000_plaid_account_cleanup.sql,
-- 20261117110000_security_quotas.sql). The daily reminders cron claims those
-- rows and calls Plaid /item/remove until Plaid confirms, retrying Plaid
-- errors for ever; it gives up only on tokens that never open.
--
-- The app lists the Items Plaid did not confirm removed (web/src/lib/plaid/unlink.ts).
-- Only the caller's own Items can be queued: ids that are not the caller's
-- are ignored. An empty list deletes without queueing anything.
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production. Safe to run again. Either order with the app code is safe:
-- the app falls back to the old disconnect (Plaid first, then
-- delete_bank_link) while this function is missing, and the old app never
-- calls it. Apply it first anyway, so the new behavior starts when the code
-- deploys. To undo: supabase/rollbacks/20261118200000_disconnect_never_blocked.down.sql.

-- True when anything was deleted.
create or replace function public.disconnect_bank_link(p_queue_item_ids text[])
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
  -- the caller's own Items only, so a student cannot queue another's token
  insert into plaid.account_cleanup (student_id, item_id, token_ciphertext)
  select i.student_id, i.item_id, i.token_ciphertext
  from plaid.items i
  where i.student_id = v_student
    and i.item_id = any (coalesce(p_queue_item_ids, '{}'::text[]))
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
