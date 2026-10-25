import { apiError } from "@/lib/api/errors";
import { cronAuthorized, reminderSettings, resendEmailsUrl } from "@/lib/reminders/config";
import { pingHeartbeat } from "@/lib/reminders/heartbeat";
import { ReminderJobError, runReminderJob } from "@/lib/reminders/job";
import { createServiceClient } from "@/lib/supabase/service";

// The daily reminder job, called by Vercel Cron (web/vercel.json) with
// CRON_SECRET. Not a student route: it uses the service role, the one
// exception in api/data-contract.md, and only calls the reminder functions.
// The answer is counts only. Each authorized run pings the heartbeat check
// (lib/reminders/heartbeat.ts), so a failed send or a run that never comes
// alerts the team.

// Room for the job's 50-second sending budget (lib/reminders/job.ts); 60 is
// the most Vercel's Hobby plan allows without Fluid compute.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return apiError(401, "unauthorized", "Not authorized.");
  }
  await pingHeartbeat("start");

  const config = reminderSettings(["serviceRoleKey", "resendApiKey", "fromEmail", "appUrl", "unsubscribeSecret"]);
  if (!config.ok) {
    console.error(JSON.stringify({ event: "reminder_job_not_configured", missing: config.missing }));
    await pingHeartbeat("fail", { error: "not_configured", missing: config.missing });
    return apiError(500, "not_configured", "The reminder job is not configured.");
  }

  const { serviceRoleKey, ...jobConfig } = config.settings;
  try {
    const result = await runReminderJob(createServiceClient(serviceRoleKey), { ...jobConfig, resendUrl: resendEmailsUrl() });
    // Unconfirmed: sent but not marked, so it may go again tomorrow. Both
    // need a person to look; deferred ones simply go on the next run.
    await pingHeartbeat(result.failed > 0 || result.unconfirmed > 0 ? "fail" : "success", result);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof ReminderJobError)) {
      await pingHeartbeat("fail", { error: "unexpected" });
      throw error;
    }
    console.error(JSON.stringify({ event: "database_error", operation: error.operation, code: error.code }));
    await pingHeartbeat("fail", { error: "data_unavailable", operation: error.operation, code: error.code });
    return apiError(503, "data_unavailable", "Reminders are temporarily unavailable.");
  }
}
