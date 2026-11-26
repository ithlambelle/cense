import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";

// Created with Claude Code (2026-11-25). "Looks right" after Penny reads a
// new bank (step 3 of the Demo Day flow): the student checked last month's
// budget. Saved to the profile (profiles.budget_checked_at,
// 20261125130000_profiles_budget_checked_at.sql) for Home's next step. Each
// tap saves the latest time.
export async function PUT(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("profiles")
    .update({ budget_checked_at: new Date().toISOString() })
    .eq("student_id", student.studentId)
    .select("student_id")
    .maybeSingle();
  if (error) return databaseError("budget_check_update", error);
  if (!data) return apiError(404, "not_found", "Profile not found.");
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
