import { apiError } from "@/lib/api/errors";
import { runAccountCleanupWithHeartbeat, type CleanupResult } from "@/lib/plaid/account-cleanup";
import { cronAuthorized, reminderSettings, resendEmailsUrl } from "@/lib/reminders/config";
import { raiseFollowUps } from "@/lib/reminders/follow-ups";
import { pingHeartbeat } from "@/lib/reminders/heartbeat";
import { ReminderJobError, runReminderJob } from "@/lib/reminders/job";
import { createServiceClient } from "@/lib/supabase/service";

// The daily reminder job, called by Vercel Cron (web/vercel.json) with
// CRON_SECRET. Not a student route: it uses the service role, the one
// exception in api/data-contract.md, and calls reminder and cleanup functions.
// The answer is counts only. It also raises the in-app follow-ups
// (lib/reminders/follow-ups.ts), apart from the emails: one never stops the
// other, and one bad reminder never fails the run. Each authorized run pings the heartbeat check
// (lib/reminders/heartbeat.ts), so a failed send or a run that never comes
// alerts the team.

// Room for the 45-second sending budget (lib/reminders/job.ts), counted from
// the start of this request; 60 is the most Vercel's Hobby plan allows
// without Fluid compute.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return apiError(401, "unauthorized", "Not authorized.");
  }
  // The sending budget counts from here, so the follow-ups' time is in it.
  const startedAt = Date.now();
  // The start ping runs alongside the job, not before it, so it never takes
  // the job's time; the run waits for it before the last ping, so the check
  // always sees start then finish.
  const started = pingHeartbeat("start");
  let cleanup: Promise<CleanupResult> | undefined = undefined;
  const finish = async (signal: "success" | "fail", body: Record<string, unknown>) => {
    await started;
    await pingHeartbeat(signal, body);
    await cleanup;
  };
  const notConfigured = async (missing: string[], extra: Record<string, unknown> = {}) => {
    console.error(JSON.stringify({ event: "reminder_job_not_configured", missing }));
    await finish("fail", { error: "not_configured", missing, ...extra });
    return apiError(500, "not_configured", "The reminder job is not configured.");
  };

  // The follow-ups need only the database, so missing email settings never
  // hold them back.
  const service = reminderSettings(["serviceRoleKey"]);
  if (!service.ok) return notConfigured(service.missing);
  const supabase = createServiceClient(service.settings.serviceRoleKey);
  // Reuse the checked service client. Cleanup has its own alert and time
  // budget and runs alongside follow-ups and emails, even without mail config.
  cleanup = runAccountCleanupWithHeartbeat(supabase, { startedAt });
  // Never throws; a reminder it skipped is logged, not a failed run.
  const followUps = await raiseFollowUps(supabase);

  const config = reminderSettings(["resendApiKey", "fromEmail", "appUrl", "unsubscribeSecret"]);
  if (!config.ok) return notConfigured(config.missing, { followUps });

  try {
    const sent = await runReminderJob(supabase, { ...config.settings, resendUrl: resendEmailsUrl() }, { startedAt });
    const result = { ...sent, followUps };
    // A person needs to look at any of these: a send failed, one was sent but
    // not marked (it may go again tomorrow), or a reminder was given up on
    // (its third try, which can also be a run that ran out of time). Deferred
    // ones alone simply go on the next run.
    // So is a follow-up call that failed as a whole.
    const problem = sent.failed > 0 || sent.unconfirmed > 0 || sent.abandoned > 0 || followUps.failed;
    await finish(problem ? "fail" : "success", result);
    return Response.json({ ...result, plaidCleanup: await cleanup }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof ReminderJobError)) {
      await finish("fail", { error: "unexpected" });
      throw error;
    }
    console.error(JSON.stringify({ event: "database_error", operation: error.operation, code: error.code }));
    await finish("fail", { error: "data_unavailable", operation: error.operation, code: error.code });
    return apiError(503, "data_unavailable", "Reminders are temporarily unavailable.");
  }
}
