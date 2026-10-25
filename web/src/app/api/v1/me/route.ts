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
// events and recordings, then the sign-in record, which cascades to every
// table that holds their data, then the session cookies. The settings are
// checked first and each step runs only if the one before worked, so a
// failure deletes nothing of the account and the student can try again.
export async function DELETE(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const config = accountDeletionConfig();
  if (!config.ok) {
    console.error(JSON.stringify({ event: "account_deletion_not_configured", missing: config.missing }));
    return apiError(503, "deletion_unavailable", "We couldn’t delete your account right now. Please try again later.");
  }

  if (config.posthog && !(await deletePostHogPerson(student.studentId, config.posthog))) {
    console.error(JSON.stringify({ event: "account_deletion_failed", step: "analytics" }));
    return apiError(502, "deletion_failed", "We couldn’t delete your account. Please try again.");
  }

  const { error } = await createServiceClient(config.serviceRoleKey).auth.admin.deleteUser(student.studentId);
  if (error) {
    console.error(JSON.stringify({ event: "account_deletion_failed", step: "account", code: error.code, status: error.status }));
    return apiError(502, "deletion_failed", "We couldn’t delete your account. Please try again.");
  }

  // The account is gone; this only clears the session cookies in the browser.
  await student.supabase.auth.signOut({ scope: "local" });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
