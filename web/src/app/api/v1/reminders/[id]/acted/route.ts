import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { REMINDER_FIELDS, reminderFromRow, safeTimeZone, type ReminderRow } from "@/lib/api/reminders";
import { applicationIdSchema } from "@/lib/api/schemas";

// The student acted on a sent reminder ("I paid it down"). The first time is
// kept, so tapping again changes nothing. A reminder that has not been sent
// yet cannot be acted on: the in-app reminder only shows once its email went.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid reminder ID.");

  const current = await student.supabase
    .from("reminders")
    .select(REMINDER_FIELDS)
    .eq("id", id)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (current.error) return databaseError("reminder_read", current.error);
  if (!current.data) return apiError(404, "not_found", "Reminder not found.");
  const row = current.data as ReminderRow;
  if (!row.sent_at) return apiError(409, "not_sent", "This reminder has not been sent yet.");

  let saved = row;
  if (!row.acted_at) {
    const updated = await student.supabase
      .from("reminders")
      .update({ acted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("student_id", student.studentId)
      .is("acted_at", null)
      .select(REMINDER_FIELDS)
      .maybeSingle();
    if (updated.error) return databaseError("reminder_acted", updated.error);
    // Null when another tap got there first: keep that time.
    if (updated.data) saved = updated.data as ReminderRow;
  }

  const profile = await student.supabase.from("profiles").select("time_zone").eq("student_id", student.studentId).maybeSingle();
  const timeZone = safeTimeZone((profile.data as { time_zone: string | null } | null)?.time_zone);
  return Response.json(reminderFromRow(saved, timeZone), { headers: { "Cache-Control": "no-store" } });
}
