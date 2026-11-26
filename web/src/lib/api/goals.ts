// Created with Claude Code (2026-11-26). The shapes of PUT and DELETE
// /api/v1/me/goal: the one goal a student is saving for, with its plan.
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { GOAL_PRESETS, MAX_GOAL_CENTS } from "@/lib/goals/presets";

extendZodWithOpenApi(z);

export const goalPresetSchema = z.enum(GOAL_PRESETS);

export const saveGoalSchema = z
  .strictObject({
    preset: goalPresetSchema,
    // What the student typed for "Something else": up to 40 characters once
    // invisible ones are taken out. A preset is named by the server, so any
    // name sent with one is ignored.
    name: z.string().max(200).optional(),
    amountCents: z.int().min(1).max(MAX_GOAL_CENTS),
    // Optional; from today, up to 30 years out (checked by the route, which
    // knows today). Left out or null: 6 months from the day it is saved.
    targetDate: z.iso.date().nullable().optional(),
  })
  .openapi("SaveGoal");

export const goalSchema = z
  .strictObject({
    preset: goalPresetSchema,
    name: z.string(),
    amountCents: z.int(),
    // Fixed when the goal is saved: the student's date, or 6 months from then.
    targetDate: z.iso.date(),
    // True when the student picked the date; false for the 6-month default.
    dateChosen: z.boolean(),
    // The plan, also fixed at the save and kept until the goal is edited: the
    // amount over the whole months left (at least 1), rounded up to the cent.
    monthlyCents: z.int(),
    // What Accept plan last wrote to the set-aside; null until accepted.
    acceptedMonthlyCents: z.int().nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .openapi("Goal");

// Accept plan sends the monthly amount the screen showed; a goal saved again
// since (another tab) answers 409 plan_changed instead of accepting it.
export const acceptGoalPlanSchema = z.strictObject({ monthlyCents: z.int().min(0) }).openapi("AcceptGoalPlan");

export const savedGoalSchema = z.strictObject({ goal: goalSchema }).openapi("SavedGoal");

// DELETE: whether the set-aside was cleared with the goal (it still held what
// Accept plan wrote) or kept (none, or the student changed it since).
export const removedGoalSchema = z.strictObject({ setAsideCleared: z.boolean() }).openapi("RemovedGoal");

export type Goal = z.infer<typeof goalSchema>;
export type SaveGoalBody = z.infer<typeof saveGoalSchema>;

export const GOAL_FIELDS = "preset, name, amount_cents, target_date, target_date_chosen, monthly_cents, accepted_monthly_cents, updated_at";
export type GoalRow = {
  preset: string;
  name: string;
  amount_cents: number | string;
  target_date: string;
  target_date_chosen: boolean;
  monthly_cents: number | string;
  accepted_monthly_cents: number | string | null;
  updated_at: string;
};

// A row to the API shape, as it was saved. bigint may arrive as a string, so
// amounts go through Number().
export function goalFromRow(row: GoalRow): Goal {
  return {
    preset: goalPresetSchema.parse(row.preset),
    name: row.name,
    amountCents: Number(row.amount_cents),
    targetDate: row.target_date,
    dateChosen: row.target_date_chosen,
    monthlyCents: Number(row.monthly_cents),
    acceptedMonthlyCents: row.accepted_monthly_cents === null ? null : Number(row.accepted_monthly_cents),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
