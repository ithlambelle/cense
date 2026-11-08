import "server-only";

import type { ServiceClient } from "@/lib/supabase/service";

// The in-app follow-up (US-08, Flow B N3), raised by the daily cron job: 2
// days after a statement closes, a statement reminder the student has not
// marked paid, dismissed or snoozed past now gets its one follow-up in
// Updates. No email: the statement email stays the only one. The rules live
// in raise_reminder_follow_ups() (supabase/migrations/20261108200000_in_app_reminders.sql),
// which skips any one reminder that fails and counts it.
//
// Kept apart from the email job (job.ts) so the two never block each other:
// this never throws. A failed call (the database down, or the migration not
// applied yet) is logged and reported as failed, so the run's heartbeat says
// a person should look, while the emails still go.

export type FollowUpResult = { raised: number; skipped: number; failed: boolean };

export async function raiseFollowUps(supabase: ServiceClient): Promise<FollowUpResult> {
  try {
    const { data, error } = await supabase.rpc("raise_reminder_follow_ups");
    if (error) {
      console.error(JSON.stringify({ event: "reminder_follow_ups_failed", code: error.code }));
      return { raised: 0, skipped: 0, failed: true };
    }
    const row = (Array.isArray(data) ? data[0] : data) as { raised?: number; skipped?: number } | null;
    const result = { raised: Number(row?.raised ?? 0), skipped: Number(row?.skipped ?? 0), failed: false };
    if (result.skipped > 0) console.error(JSON.stringify({ event: "reminder_follow_ups_skipped", skipped: result.skipped }));
    return result;
  } catch {
    console.error(JSON.stringify({ event: "reminder_follow_ups_failed", code: "unexpected" }));
    return { raised: 0, skipped: 0, failed: true };
  }
}
