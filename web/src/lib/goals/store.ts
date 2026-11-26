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
// amount are fixed here, from `today`. Saving the same goal, amount and date
// again (or still no date) keeps the date and monthly amount already saved, so
// they never drift as days pass. Switching an accepted goal to Pay off my card
// releases its set-aside in the database (goals_release_set_aside).
export async function saveGoal(student: Student, goal: SaveGoalBody & { name: string }, today: string): Promise<StoreResult<Goal>> {
  const existing = await student.supabase
    .from("goals")
    .select("preset, amount_cents, target_date, target_date_chosen, monthly_cents")
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error };
  type Before = { preset: string; amount_cents: number | string; target_date: string; target_date_chosen: boolean; monthly_cents: number | string };
  const before = existing.data as Before | null;
  const chosen = goal.targetDate != null;
  const same = before !== null && before.preset === goal.preset && Number(before.amount_cents) === goal.amountCents;
  // Still no date: the 6-month default stays where it was fixed.
  const keepDefault = same && !chosen && !before.target_date_chosen;
  const plan = keepDefault
    ? { targetDate: before.target_date, monthlyCents: Number(before.monthly_cents) }
    : planAtSave({ preset: goal.preset, amountCents: goal.amountCents, targetDate: goal.targetDate ?? null }, today);
  const unchanged = same && before.target_date === plan.targetDate;
  const { data, error } = await student.supabase
    .from("goals")
    .upsert(
      {
        student_id: student.studentId,
        preset: goal.preset,
        name: goal.name,
        amount_cents: goal.amountCents,
        target_date: plan.targetDate,
        target_date_chosen: chosen,
        monthly_cents: unchanged ? Number(before.monthly_cents) : plan.monthlyCents,
      },
      { onConflict: "student_id" },
    )
    .select(GOAL_FIELDS)
    .single();
  if (error) return { ok: false, error };
  return { ok: true, value: goalFromRow(data as GoalRow) };
}

// The step Your plan links for Pay off my card: autopay on the most recently
// changed approved card whose autopay is not on yet, or null when there is none.
export async function autopayApplicationId(student: Student): Promise<StoreResult<string | null>> {
  const { data, error } = await student.supabase
    .from("card_applications")
    .select("id")
    .eq("student_id", student.studentId)
    .eq("status", "approved")
    .neq("autopay_status", "on")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error };
  return { ok: true, value: data ? (data as { id: string }).id : null };
}

// Deletes the student's goal through remove_goal(), which also clears the
// set-aside when it still holds what Accept plan wrote. True when it did.
// Deleting when there is no goal is not an error.
export async function removeGoal(student: Student): Promise<StoreResult<boolean>> {
  const { data, error } = await student.supabase.rpc("remove_goal");
  if (error) return { ok: false, error };
  return { ok: true, value: data === "cleared" };
}
