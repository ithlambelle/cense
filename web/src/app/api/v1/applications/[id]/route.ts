import { APPLICATION_FIELDS, applicationFromRow, type ApplicationRow } from "@/lib/api/application";
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { applicationIdSchema, updateApplicationSchema } from "@/lib/api/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) {
    return apiError(400, "invalid_request", "Invalid application ID.");
  }

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
    .select(APPLICATION_FIELDS)
    .maybeSingle();
  if (error?.code === "23505") {
    return apiError(409, "already_exists", "An active record for this card already exists.");
  }
  if (error) return databaseError("application_update", error);
  if (!data) return apiError(404, "not_found", "Application not found.");

  return Response.json(applicationFromRow(data as ApplicationRow), {
    headers: { "Cache-Control": "no-store" },
  });
}
