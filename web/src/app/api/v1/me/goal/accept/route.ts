// Created with Claude Code (2026-11-26). POST /api/v1/me/goal/accept: Accept
// plan on Your plan. Writes the saved goal's monthly amount to the student's
// set-aside (their monthly savings goal, D40) through accept_goal_plan(), and
// nothing else: never the bill answers, which another tab may have changed.
import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { acceptGoalPlanSchema } from "@/lib/api/goals";
import { plaidConfig } from "@/lib/plaid/config";
import { NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";

export async function POST(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!plaidConfig()) return safeToSpendOff();

  // The amount the screen showed, so a plan saved again in another tab is
  // never accepted unseen.
  const parsed = acceptGoalPlanSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await student.supabase.rpc("accept_goal_plan", { p_monthly_cents: parsed.data.monthlyCents });
  // check_violation: more a month than a set-aside can be ($100,000).
  if (error?.code === "23514") {
    console.warn(JSON.stringify({ event: "goal_plan_too_much" }));
    return apiError(400, "too_much", "That’s more than you can set aside in a month.");
  }
  if (error) return databaseError("goal_plan_accept", error);
  if (data === "changed") return apiError(409, "plan_changed", "Your plan changed. Here it is now.");
  if (data === "no_goal") return apiError(404, "not_found", "Pick a goal first.");
  if (data === "no_bank") return notLinked();
  if (data === "nothing_to_set_aside") return apiError(409, "nothing_to_set_aside", "This goal sets nothing aside.");
  return new Response(null, { status: 204, headers: NO_STORE });
}
