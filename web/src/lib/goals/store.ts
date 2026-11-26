// Created with Claude Code (2026-11-26). Every read and write of a student's
// goal, with their own session (row level security,
// supabase/migrations/20261126150200_goals.sql).
import "server-only";

import type { Student } from "@/lib/api/auth";
import { GOAL_FIELDS, goalFromRow, type Goal, type GoalRow, type SaveGoalBody } from "@/lib/api/goals";
import type { StoreResult } from "@/lib/plaid/store";

import { planAtSave } from "./plan";

// The student's goal as saved, or null when they have none.
export async function loadGoal(student: Student): Promise<StoreResult<Goal | null>> {
  const { data, error } = await student.supabase.from("goals").select(GOAL_FIELDS).eq("student_id", student.studentId).maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, value: data ? goalFromRow(data as GoalRow) : null };
}

// Saves the student's one goal, replacing any they had. The date and monthly
// amount are fixed here, from `today`. Saving the same amount and date again
// keeps the monthly amount already saved, so it never drifts as days pass.
export async function saveGoal(student: Student, goal: SaveGoalBody & { name: string }, today: string): Promise<StoreResult<Goal>> {
  const existing = await student.supabase.from("goals").select("amount_cents, target_date, monthly_cents").eq("student_id", student.studentId).maybeSingle();
  if (existing.error) return { ok: false, error: existing.error };
  const plan = planAtSave({ amountCents: goal.amountCents, targetDate: goal.targetDate ?? null }, today);
  const before = existing.data as { amount_cents: number | string; target_date: string; monthly_cents: number | string } | null;
  const unchanged = before !== null && Number(before.amount_cents) === goal.amountCents && before.target_date === plan.targetDate;
  const { data, error } = await student.supabase
    .from("goals")
    .upsert(
      {
        student_id: student.studentId,
        preset: goal.preset,
        name: goal.name,
        amount_cents: goal.amountCents,
        target_date: plan.targetDate,
        monthly_cents: unchanged ? Number(before.monthly_cents) : plan.monthlyCents,
      },
      { onConflict: "student_id" },
    )
    .select(GOAL_FIELDS)
    .single();
  if (error) return { ok: false, error };
  return { ok: true, value: goalFromRow(data as GoalRow) };
}

// Deletes the student's goal through remove_goal(), which also clears the
// set-aside when it still holds what Accept plan wrote. True when it did.
// Deleting when there is no goal is not an error.
export async function removeGoal(student: Student): Promise<StoreResult<boolean>> {
  const { data, error } = await student.supabase.rpc("remove_goal");
  if (error) return { ok: false, error };
  return { ok: true, value: data === "cleared" };
}
