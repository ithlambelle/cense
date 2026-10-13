import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { authCallbackUrl, passwordResetRequestSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const parsed = passwordResetRequestSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authCallbackUrl(new URL(request.url).origin, "/reset-password"),
  });
  if (error) return apiError(502, "reset_failed", "We could not send a reset email. Please try again.");

  return Response.json({ status: "check_email" }, { headers: { "Cache-Control": "no-store" } });
}
