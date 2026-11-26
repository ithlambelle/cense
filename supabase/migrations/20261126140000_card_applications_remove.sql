-- Created with Claude Code (2026-11-26). A student can remove a card they
-- added themselves ("I already have a card", source 'added'), through
-- DELETE /api/v1/applications/{id}. Before this there was no delete policy
-- and, since 20261117100000_security_db_limits.sql, no delete privilege, so a
-- card added by mistake stayed on Home for good.
--
-- Only the student's own rows, and only source 'added'. A card applied for
-- through Cense (source 'application') is kept: it is the record of what the
-- issuer decided (outcome_reported's ledger), and the denial plan and reapply
-- reminder hang off it.
--
-- What hangs off a card goes with it: reminders (the scheduled emails) and
-- plan_steps (setup progress) reference card_applications with on delete
-- cascade (20261023200000_reminders_and_plan_steps.sql). Nothing else stores
-- an application's id. A removed card frees one of the 25 card records a
-- student may keep (card_applications_limit_per_student counts live rows).
--
-- Applied by hand in the Supabase SQL editor: cense-preview first, then
-- production, before or with the app change (without it, "Remove card" answers
-- with a server error and nothing is removed). Safe to run again. To back it
-- out: supabase/rollbacks/20261126140000_card_applications_remove.down.sql.

grant delete on public.card_applications to authenticated;

drop policy if exists "Students can remove a card they added" on public.card_applications;
create policy "Students can remove a card they added"
  on public.card_applications for delete
  to authenticated
  using ((select auth.uid()) = student_id and source = 'added');
