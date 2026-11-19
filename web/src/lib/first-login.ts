import "server-only";

import type { Student } from "@/lib/api/auth";

// Created with Claude Code (2026-11-19). First sign-in (Flow 1, Figma
// 821:8408): a new student sees the welcome (W1, W2) once, then Link your
// bank (E1). profiles.welcomed_at (20261119100000_profiles_welcomed_at.sql)
// is when they tapped "Let's go"; null means they have not seen it.
//
// Only /start asks. Every sign-in without a `next` lands there, so the
// welcome comes at the first ordinary landing, and a student who signed up
// from an email or an issuer link goes straight to that screen, never trapped
// behind the welcome (they see it the next time they land on /start). The
// flag lives in the database, not the browser, so a new phone or a cleared
// browser never shows it twice.

export const WELCOME_FIELDS = "welcomed_at";
export type WelcomeRow = { welcomed_at: string | null };

// True only when the profile was read and says the welcome is still to come.
// A failed read (the column not there yet, the database unreachable) answers
// false, so a problem here sends the student to their usual screen instead of
// stopping their sign-in.
export async function needsWelcome(student: Student): Promise<boolean> {
  const { data, error } = await student.supabase
    .from("profiles")
    .select(WELCOME_FIELDS)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) {
    console.warn(JSON.stringify({ event: "welcome_read_failed", code: error.code }));
    return false;
  }
  return data !== null && (data as WelcomeRow).welcomed_at === null;
}
