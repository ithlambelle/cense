import { apiError } from "@/lib/api/errors";
import { cronAuthorized, reminderSettings } from "@/lib/reminders/config";
import { ReminderJobError, runReminderJob } from "@/lib/reminders/job";
import { createServiceClient } from "@/lib/supabase/service";

// The daily reminder job, called by Vercel Cron (web/vercel.json) with
// CRON_SECRET. Not a student route: it uses the service role, the one
// exception in api/data-contract.md, and only calls the reminder functions.
// The answer is counts only.

// Room for the job's 50-second sending budget (lib/reminders/job.ts); 60 is
// the most Vercel's Hobby plan allows without Fluid compute.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return apiError(401, "unauthorized", "Not authorized.");
  }

  const config = reminderSettings(["serviceRoleKey", "resendApiKey", "fromEmail", "appUrl", "unsubscribeSecret"]);
  if (!config.ok) {
    console.error(JSON.stringify({ event: "reminder_job_not_configured", missing: config.missing }));
    return apiError(500, "not_configured", "The reminder job is not configured.");
  }

  const { serviceRoleKey, ...jobConfig } = config.settings;
  try {
    const result = await runReminderJob(createServiceClient(serviceRoleKey), jobConfig);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof ReminderJobError)) throw error;
    console.error(JSON.stringify({ event: "database_error", operation: error.operation, code: error.code }));
    return apiError(503, "data_unavailable", "Reminders are temporarily unavailable.");
  }
}
