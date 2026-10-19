import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { passwordResetRequestSchema } from "@/lib/api/password";
import { createStudentClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const parsed = passwordResetRequestSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createStudentClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: new URL("/api/v1/auth/password/reset/verify", request.url).toString(),
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
