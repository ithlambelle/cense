// Created with Claude Code (2026-11-26). PUT and DELETE /api/v1/me/goal: the
// one thing a student is saving for (US-17, Demo Day step 4), with its plan.
// The screens read the goal on the server (lib/goals/store.ts), so there is
// no GET.
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { saveGoalSchema } from "@/lib/api/goals";
import { addMonthsIso, easternToday, MAX_YEARS } from "@/lib/goals/plan";
import { removeGoal, saveGoal } from "@/lib/goals/store";

const NO_STORE = { "Cache-Control": "no-store" };

export async function PUT(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = saveGoalSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // Today is allowed, for a student whose own calendar is a day behind the
  // app's; the screen asks for a date after today. ISO dates compare as text.
  const today = easternToday();
  const { targetDate } = parsed.data;
  if (targetDate != null && (targetDate < today || targetDate > addMonthsIso(today, MAX_YEARS * 12))) {
    return apiError(400, "invalid_request", "Pick a date between today and 30 years from now.");
  }

  const saved = await saveGoal(student, parsed.data, today);
  if (!saved.ok) return databaseError("goal_save", saved.error);
  return Response.json({ goal: saved.value }, { headers: NO_STORE });
}

export async function DELETE(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  // Its set-aside goes too when it still holds what Accept plan wrote.
  const removed = await removeGoal(student);
  if (!removed.ok) return databaseError("goal_delete", removed.error);
  return Response.json({ setAsideCleared: removed.value }, { headers: NO_STORE });
}
