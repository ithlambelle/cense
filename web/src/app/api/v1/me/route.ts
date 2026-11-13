import { accountDeletionConfig, deletePostHogPerson } from "@/lib/account-deletion";
import { authenticatedStudent } from "@/lib/api/auth";
import { apiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  return Response.json(
    { id: student.studentId, email: student.email },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Delete my account (S28), at once: the student's PostHog person with its
// events and recordings, then the sign-in record and session cookies. The DB
// trigger atomically queues encrypted Plaid tokens before the auth cascade;
// the daily cron removes those Items without keeping the student signed up.
export async function DELETE(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const config = accountDeletionConfig();
  if (!config.ok) {
    console.error(JSON.stringify({ event: "account_deletion_not_configured", missing: config.missing }));
    return apiError(503, "deletion_unavailable", "We couldn’t delete your account right now. Please try again later.");
  }

  const service = createServiceClient(config.serviceRoleKey);
  const ready = await service.rpc("plaid_account_cleanup_ready");
  if (ready.error || ready.data !== true) {
    console.error(JSON.stringify({ event: "account_deletion_failed", step: "cleanup_not_ready" }));
    return apiError(503, "deletion_unavailable", "We couldn’t delete your account right now. Please try again later.");
  }

  if (config.posthog && !(await deletePostHogPerson(student.studentId, config.posthog))) {
    console.error(JSON.stringify({ event: "account_deletion_failed", step: "analytics" }));
    return apiError(502, "deletion_failed", "We couldn’t delete your account. Please try again.");
  }

  const { error } = await service.auth.admin.deleteUser(student.studentId);
  if (error) {
    console.error(JSON.stringify({ event: "account_deletion_failed", step: "account", code: error.code, status: error.status }));
    return apiError(502, "deletion_failed", "We couldn’t delete your account. Please try again.");
  }

  // The account is gone; this only clears the session cookies in the browser.
  await student.supabase.auth.signOut({ scope: "local" });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
