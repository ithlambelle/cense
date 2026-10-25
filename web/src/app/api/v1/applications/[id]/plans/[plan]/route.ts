import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { PLAN_STEP_FIELDS, planNameSchema, planStepFromRow, type PlanStepRow } from "@/lib/api/plans";
import { applicationIdSchema } from "@/lib/api/schemas";

// The finished steps of one plan for one of the student's applications.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; plan: string }> },
): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id, plan } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid application ID.");
  const planName = planNameSchema.safeParse(plan);
  if (!planName.success) return apiError(404, "not_found", "Plan not found.");

  const application = await student.supabase
    .from("card_applications")
    .select("id")
    .eq("id", id)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (application.error) return databaseError("plan_read_application", application.error);
  if (!application.data) return apiError(404, "not_found", "Application not found.");

  const { data, error } = await student.supabase
    .from("plan_steps")
    .select(PLAN_STEP_FIELDS)
    .eq("card_application_id", id)
    .eq("plan", planName.data)
    .order("completed_at", { ascending: true });
  if (error) return databaseError("plan_read", error);

  return Response.json(
    { applicationId: id, plan: planName.data, completedSteps: (data as PlanStepRow[]).map(planStepFromRow) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
