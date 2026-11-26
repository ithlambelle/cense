// Created with Claude Code (2026-11-26). Every read and write of a student's
// goal, with their own session (row level security,
// supabase/migrations/20261126150200_goals.sql).
import "server-only";

import type { Student } from "@/lib/api/auth";
import { GOAL_FIELDS, goalFromRow, type Goal, type GoalRow, type SaveGoalBody } from "@/lib/api/goals";
import type { StoreResult } from "@/lib/plaid/store";

import { easternToday } from "./plan";

// The student's goal with its plan for today, or null when they have none.
export async function loadGoal(student: Student, today: string = easternToday()): Promise<StoreResult<Goal | null>> {
  const { data, error } = await student.supabase.from("goals").select(GOAL_FIELDS).eq("student_id", student.studentId).maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, value: data ? goalFromRow(data as GoalRow, today) : null };
}

// Saves the student's one goal, replacing any they had.
export async function saveGoal(student: Student, goal: SaveGoalBody, today: string = easternToday()): Promise<StoreResult<Goal>> {
  const { data, error } = await student.supabase
    .from("goals")
    .upsert(
      { student_id: student.studentId, preset: goal.preset, name: goal.name, amount_cents: goal.amountCents, target_date: goal.targetDate },
      { onConflict: "student_id" },
    )
    .select(GOAL_FIELDS)
    .single();
  if (error) return { ok: false, error };
  return { ok: true, value: goalFromRow(data as GoalRow, today) };
}

// Deletes the student's goal. Deleting when there is none is not an error.
export async function deleteGoal(student: Student): Promise<StoreResult<null>> {
  const { error } = await student.supabase.from("goals").delete().eq("student_id", student.studentId);
  if (error) return { ok: false, error };
  return { ok: true, value: null };
}
