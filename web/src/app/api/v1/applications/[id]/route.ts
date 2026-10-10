import { applicationFromRow, type ApplicationRow } from "@/lib/api/application";
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { updateApplicationSchema } from "@/lib/api/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(400, "invalid_request", "Invalid application ID.");

  const parsed = updateApplicationSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await student.supabase
    .from("card_applications")
    .update({
      status: parsed.data.status,
      credit_limit_cents: parsed.data.creditLimitCents,
    })
    .eq("id", id)
    .eq("student_id", student.studentId)
    .select("id, card_id, card_name, status, credit_limit_cents, applied_at, updated_at")
    .maybeSingle();
  if (error) return databaseError("application_update", error);
  if (!data) return apiError(404, "not_found", "Application not found.");

  return Response.json(applicationFromRow(data as ApplicationRow), {
    headers: { "Cache-Control": "no-store" },
  });
}
