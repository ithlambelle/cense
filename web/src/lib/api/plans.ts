import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// The first-month and denial plans (spec C3). One saved row per finished
// step (plan_steps); undo deletes it. Autopay is not a step: the first-month
// plan reads the application's autopayStatus.

export const PLAN_STEPS = {
  first_month: ["planned_purchase", "payment_reminder"],
  denial: ["read_letter", "check_reports", "pause_applications", "build_credit", "reapply"],
} as const;

export type PlanName = keyof typeof PLAN_STEPS;

export const planNameSchema = z.enum(["first_month", "denial"]);
export const planStepNameSchema = z.enum([...PLAN_STEPS.first_month, ...PLAN_STEPS.denial]);

export const planStepSchema = z.strictObject({
  step: planStepNameSchema,
  completedAt: z.iso.datetime({ offset: true }),
}).openapi("PlanStep");

export const planProgressSchema = z.strictObject({
  applicationId: z.uuid(),
  plan: planNameSchema,
  completedSteps: z.array(planStepSchema),
}).openapi("PlanProgress");

export type PlanStep = z.infer<typeof planStepSchema>;
export type PlanProgress = z.infer<typeof planProgressSchema>;

// True when the step belongs to the plan (a denial step is not a first-month step).
export function isPlanStep(plan: PlanName, step: string): boolean {
  return (PLAN_STEPS[plan] as readonly string[]).includes(step);
}

export const PLAN_STEP_FIELDS = "step, completed_at";
export type PlanStepRow = { step: string; completed_at: string };

export function planStepFromRow(row: PlanStepRow): PlanStep {
  return { step: planStepNameSchema.parse(row.step), completedAt: new Date(row.completed_at).toISOString() };
}

// Which plan an application status can have: a first-month plan needs an
// approved card, a denial plan a rejected one (the database checks this too).
export function planFitsStatus(plan: PlanName, status: string): boolean {
  return plan === "first_month" ? status === "approved" : status === "rejected";
}
