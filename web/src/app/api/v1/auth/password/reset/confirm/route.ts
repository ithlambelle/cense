import { authenticatedStudent } from "@/lib/api/auth";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { passwordUpdateSchema } from "@/lib/api/password";

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

  const student = await authenticatedStudent();
  if (!student) return apiError(401, "sign_in_required", "A valid reset session is required.");

  const { data: claims, error: claimsError } = await student.supabase.auth.getClaims();
  if (claimsError || !Array.isArray(claims?.claims?.amr) ||
      !claims.claims.amr.some((entry) => typeof entry === "object" && entry !== null && entry.method === "recovery")) {
    return apiError(403, "recovery_required", "Open a password reset link before setting a new password.");
  }

  const { error } = await student.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return apiError(502, "password_update_failed", "We could not update your password. Please try again.");

  return Response.json({ status: "password_updated" }, { headers: { "Cache-Control": "no-store" } });
}
