import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import {
  REMINDER_SETTINGS_FIELDS,
  reminderSettingsFromRow,
  updateReminderSettingsSchema,
  type ReminderSettingsRow,
} from "@/lib/api/reminders";

// The Reminder settings toggles. Turning a kind off removes its unsent
// reminders and turning it back on schedules them again (a trigger in the
// database); emailsOn false stops every reminder email.
export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { data, error } = await student.supabase
    .from("profiles")
    .select(REMINDER_SETTINGS_FIELDS)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) return databaseError("reminder_settings_read", error);
  if (!data) return apiError(404, "not_found", "Profile not found.");
  return Response.json(reminderSettingsFromRow(data as ReminderSettingsRow), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = updateReminderSettingsSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { emailsOn, statementClosing, paymentDue, checkAutopay } = parsed.data;

  const set: Record<string, unknown> = {};
  if (statementClosing !== undefined) set.remind_statement_closing = statementClosing;
  if (paymentDue !== undefined) set.remind_payment_due = paymentDue;
  if (checkAutopay !== undefined) set.remind_check_autopay = checkAutopay;

  if (emailsOn !== undefined) {
    // Keep the first unsubscribe time: only change it when the answer changes.
    const current = await student.supabase
      .from("profiles")
      .select("reminders_unsubscribed_at")
      .eq("student_id", student.studentId)
      .maybeSingle();
    if (current.error) return databaseError("reminder_settings_read", current.error);
    if (!current.data) return apiError(404, "not_found", "Profile not found.");
    const unsubscribed = (current.data as { reminders_unsubscribed_at: string | null }).reminders_unsubscribed_at !== null;
    if (emailsOn && unsubscribed) set.reminders_unsubscribed_at = null;
    if (!emailsOn && !unsubscribed) set.reminders_unsubscribed_at = new Date().toISOString();
  }

  const query = student.supabase.from("profiles");
  const { data, error } = Object.keys(set).length === 0
    ? await query.select(REMINDER_SETTINGS_FIELDS).eq("student_id", student.studentId).maybeSingle()
    : await query.update(set).eq("student_id", student.studentId).select(REMINDER_SETTINGS_FIELDS).maybeSingle();
  if (error) return databaseError("reminder_settings_update", error);
  if (!data) return apiError(404, "not_found", "Profile not found.");
  return Response.json(reminderSettingsFromRow(data as ReminderSettingsRow), { headers: { "Cache-Control": "no-store" } });
}
