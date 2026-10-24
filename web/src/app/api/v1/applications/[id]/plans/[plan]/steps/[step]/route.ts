import { authenticatedStudent, type Student } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import {
  isPlanStep,
  PLAN_STEP_FIELDS,
  planFitsStatus,
  planNameSchema,
  planStepFromRow,
  type PlanName,
  type PlanStepRow,
} from "@/lib/api/plans";
import { applicationIdSchema } from "@/lib/api/schemas";

type Params = { params: Promise<{ id: string; plan: string; step: string }> };

type Target = { student: Student; id: string; plan: PlanName; step: string; status: string };

// Checks the session, the path and that the application is the student's own.
async function target(context: Params): Promise<Target | Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id, plan, step } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid application ID.");
  const planName = planNameSchema.safeParse(plan);
  if (!planName.success || !isPlanStep(planName.data, step)) return apiError(404, "not_found", "Plan step not found.");

  const { data, error } = await student.supabase
    .from("card_applications")
    .select("status")
    .eq("id", id)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) return databaseError("plan_step_application", error);
  if (!data) return apiError(404, "not_found", "Application not found.");

  return { student, id, plan: planName.data, step, status: (data as { status: string }).status };
}

// Marks a step done (a lit star). Doing it again is fine and keeps the first time.
export async function PUT(_request: Request, context: Params): Promise<Response> {
  const found = await target(context);
  if (found instanceof Response) return found;
  const { student, id, plan, step, status } = found;

  if (!planFitsStatus(plan, status)) {
    return apiError(409, "plan_not_available",
      plan === "first_month" ? "The first-month plan is for an approved card." : "The denial plan is for a denied application.");
  }

  const inserted = await student.supabase
    .from("plan_steps")
    .insert({ student_id: student.studentId, card_application_id: id, plan, step })
    .select(PLAN_STEP_FIELDS)
    .maybeSingle();
  if (!inserted.error && inserted.data) {
    return Response.json(planStepFromRow(inserted.data as PlanStepRow), { status: 201, headers: { "Cache-Control": "no-store" } });
  }
  if (inserted.error && inserted.error.code !== "23505") {
    // 23514: the status changed between the check and the insert
    if (inserted.error.code === "23514") return apiError(409, "plan_not_available", "This plan is not available for this card.");
    return databaseError("plan_step_insert", inserted.error);
  }

  // Already done: answer with the saved step.
  const existing = await student.supabase
    .from("plan_steps")
    .select(PLAN_STEP_FIELDS)
    .eq("card_application_id", id)
    .eq("plan", plan)
    .eq("step", step)
    .maybeSingle();
  if (existing.error) return databaseError("plan_step_read", existing.error);
  if (!existing.data) return databaseError("plan_step_read", { message: "missing after conflict" });
  return Response.json(planStepFromRow(existing.data as PlanStepRow), { headers: { "Cache-Control": "no-store" } });
}

// Undoes a step. Undoing a step that is not done is fine too.
export async function DELETE(_request: Request, context: Params): Promise<Response> {
  const found = await target(context);
  if (found instanceof Response) return found;
  const { student, id, plan, step } = found;

  const { error } = await student.supabase
    .from("plan_steps")
    .delete()
    .eq("card_application_id", id)
    .eq("plan", plan)
    .eq("step", step);
  if (error) return databaseError("plan_step_delete", error);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
