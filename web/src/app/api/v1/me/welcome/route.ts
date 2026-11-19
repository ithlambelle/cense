import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { WELCOME_FIELDS } from "@/lib/first-login";

// Created with Claude Code (2026-11-19). The first sign-in welcome is done
// ("Let's go" on W2, Flow 1): saved to the profile before the student moves
// on, so /start never sends them to it again, on any device. Keeps the first
// time: a repeat changes nothing and still answers 204.
export async function PUT(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const profiles = student.supabase.from("profiles");
  const { data, error } = await profiles
    .update({ welcomed_at: new Date().toISOString() })
    .eq("student_id", student.studentId)
    .is("welcomed_at", null)
    .select(WELCOME_FIELDS)
    .maybeSingle();
  if (error) return databaseError("welcome_update", error);
  if (data) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  // No row changed: already welcomed, or no profile.
  const current = await profiles.select(WELCOME_FIELDS).eq("student_id", student.studentId).maybeSingle();
  if (current.error) return databaseError("welcome_read", current.error);
  if (!current.data) return apiError(404, "not_found", "Profile not found.");
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
