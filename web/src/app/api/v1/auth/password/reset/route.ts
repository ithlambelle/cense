import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { passwordResetRequestSchema } from "@/lib/api/password";
import { emailLinkOrigin, logMissingAppBaseUrl } from "@/lib/auth/email-links";
import { authThrottle } from "@/lib/auth/throttle";
import { ROUTES } from "@/lib/routes";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const parsed = passwordResetRequestSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // Counted for every email, with or without an account, so a 429 never
  // says whether one exists.
  const limited = await authThrottle(request, "send", parsed.data.email);
  if (limited) return limited;

  // The emailed link opens the confirm screen, which verifies only when the
  // student taps Continue (supabase/templates/recovery.html adds
  // ?token_hash=). Built from APP_BASE_URL, never the request's own address
  // (src/lib/auth/email-links.ts).
  const origin = emailLinkOrigin(request.url);
  if (!origin) {
    logMissingAppBaseUrl("auth/password/reset");
    return apiError(502, "reset_failed", "We could not send a reset email. Please try again.");
  }

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: new URL(ROUTES.resetPasswordConfirm, origin).toString(),
  });
  if (error) {
    console.error("Password reset request failed", { code: error.code, status: error.status });
    if (error.status && error.status >= 400 && error.status < 500) {
      return Response.json({ status: "check_email" }, { headers: { "Cache-Control": "no-store" } });
    }
    return apiError(502, "reset_failed", "We could not send a reset email. Please try again.");
  }

  return Response.json({ status: "check_email" }, { headers: { "Cache-Control": "no-store" } });
}
