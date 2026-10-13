import { authenticatedStudent } from "@/lib/api/auth";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { passwordUpdateSchema } from "@/lib/api/password";

export async function POST(request: Request): Promise<Response> {
  const parsed = passwordUpdateSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const student = await authenticatedStudent();
  if (!student) return apiError(401, "sign_in_required", "A valid reset session is required.");

  const { error } = await student.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return apiError(502, "password_update_failed", "We could not update your password. Please try again.");

  return Response.json({ status: "password_updated" }, { headers: { "Cache-Control": "no-store" } });
}
