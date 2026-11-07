import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { openedResetLink, passwordUpdateSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const body = await parseJson(request);
  const parsed = passwordUpdateSchema.safeParse(body);
  if (!parsed.success) {
    if (typeof body === "object" && body !== null && "password" in body &&
        typeof body.password === "string" && new TextEncoder().encode(body.password).length > 72) {
      return apiError(400, "invalid_password", "Use a password of 72 bytes or fewer.");
    }
    return validationError(parsed.error);
  }

  // As authenticatedStudent(), keeping the user: the rule below needs the time
  // of the account's latest reset email.
  const supabase = await createStudentClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return apiError(401, "sign_in_required", "A valid reset session is required.");

  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !openedResetLink(claims?.claims?.amr, userData.user.recovery_sent_at, Date.now() / 1000)) {
    return apiError(403, "recovery_required", "Open a password reset link before setting a new password.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return apiError(502, "password_update_failed", "We could not update your password. Please try again.");

  return Response.json({ status: "password_updated" }, { headers: { "Cache-Control": "no-store" } });
}
