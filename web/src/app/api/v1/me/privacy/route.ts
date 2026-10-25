import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { PRIVACY_FIELDS, privacyFromRow, updatePrivacySettingsSchema, type PrivacyRow } from "@/lib/api/privacy";

// The Analytics switch, saved to the profile so it follows the student to
// every device. The browser applies it with PostHog's own opt-out.
export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("profiles")
    .select(PRIVACY_FIELDS)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) return databaseError("privacy_settings_read", error);
  if (!data) return apiError(404, "not_found", "Profile not found.");
  return Response.json(privacyFromRow(data as PrivacyRow), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = updatePrivacySettingsSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  // Keeps the first time it was turned off: a repeat "off" changes nothing.
  const query = student.supabase.from("profiles");
  const { data, error } = parsed.data.analyticsOn
    ? await query.update({ analytics_opted_out_at: null }).eq("student_id", student.studentId).select(PRIVACY_FIELDS).maybeSingle()
    : await query
        .update({ analytics_opted_out_at: new Date().toISOString() })
        .eq("student_id", student.studentId)
        .is("analytics_opted_out_at", null)
        .select(PRIVACY_FIELDS)
        .maybeSingle();
  if (error) return databaseError("privacy_settings_update", error);
  if (data) return Response.json(privacyFromRow(data as PrivacyRow), { headers: { "Cache-Control": "no-store" } });

  // No row changed: already off, or no profile.
  const current = await query.select(PRIVACY_FIELDS).eq("student_id", student.studentId).maybeSingle();
  if (current.error) return databaseError("privacy_settings_read", current.error);
  if (!current.data) return apiError(404, "not_found", "Profile not found.");
  return Response.json(privacyFromRow(current.data as PrivacyRow), { headers: { "Cache-Control": "no-store" } });
}
