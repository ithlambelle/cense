import "server-only";

import { cache } from "react";

import type { Student } from "@/lib/api/auth";
import { PRIVACY_FIELDS, privacyFromRow, type PrivacyRow } from "@/lib/api/privacy";

// The student's Analytics switch, read on the server for every signed-in
// page, so the browser knows it before it identifies anyone. Null when it
// could not be read: the browser then keeps whatever it was doing and does
// not link itself to the student. Cached per request: the (app) layout and
// Security and privacy both ask.
export const loadAnalyticsOn = cache(async (student: Student): Promise<boolean | null> => {
  const { data, error } = await student.supabase
    .from("profiles")
    .select(PRIVACY_FIELDS)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error || !data) {
    console.warn(JSON.stringify({ event: "analytics_choice_read_failed", code: error?.code ?? "no_profile" }));
    return null;
  }
  return privacyFromRow(data as PrivacyRow).analyticsOn;
});
