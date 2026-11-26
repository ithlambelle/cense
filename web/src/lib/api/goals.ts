// Created with Claude Code (2026-11-26). The shapes of GET, PUT and DELETE
// /api/v1/me/goal: the one goal a student is saving for, with its plan.
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { goalPlan } from "@/lib/goals/plan";
import { GOAL_PRESETS, MAX_GOAL_CENTS } from "@/lib/goals/presets";

extendZodWithOpenApi(z);

export const goalPresetSchema = z.enum(GOAL_PRESETS);

export const saveGoalSchema = z
  .strictObject({
    preset: goalPresetSchema,
    // The preset's own name, or what the student typed for "Something else".
    name: z.string().trim().min(1).max(40),
    amountCents: z.int().min(1).max(MAX_GOAL_CENTS),
    // Optional; from today, up to 30 years out (checked by the route, which
    // knows today). With none the plan uses 6 months.
    targetDate: z.iso.date().nullable(),
  })
  .openapi("SaveGoal");

export const goalSchema = z
  .strictObject({
    preset: goalPresetSchema,
    name: z.string(),
    amountCents: z.int(),
    targetDate: z.iso.date().nullable(),
    // The plan, worked out on the app's calendar today: the whole months left
    // (6 with no date, at least 1), the amount over them rounded up to the
    // cent, and the date it is planned for.
    plan: z.strictObject({ months: z.int(), monthlyCents: z.int(), byDate: z.iso.date() }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .openapi("Goal");

// A student with no goal yet gets null.
export const goalResponseSchema = z.strictObject({ goal: z.union([goalSchema, z.null()]) }).openapi("GoalResponse");

export type Goal = z.infer<typeof goalSchema>;
export type SaveGoalBody = z.infer<typeof saveGoalSchema>;

export const GOAL_FIELDS = "preset, name, amount_cents, target_date, updated_at";
export type GoalRow = { preset: string; name: string; amount_cents: number | string; target_date: string | null; updated_at: string };

// A row to the API shape. bigint may arrive as a string, so the amount goes
// through Number().
export function goalFromRow(row: GoalRow, today: string): Goal {
  const amountCents = Number(row.amount_cents);
  return {
    preset: goalPresetSchema.parse(row.preset),
    name: row.name,
    amountCents,
    targetDate: row.target_date,
    plan: goalPlan({ amountCents, targetDate: row.target_date }, today),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
