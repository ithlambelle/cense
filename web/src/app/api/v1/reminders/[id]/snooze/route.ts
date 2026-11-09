import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { reminderFromRow, snoozeReminderSchema, type ReminderRow } from "@/lib/api/reminders";
import { applicationIdSchema } from "@/lib/api/schemas";
import { snoozeOptions } from "@/lib/reminders/in-app";
import { loadOneReminder } from "@/lib/reminders/in-app-data";

// Snooze a sent reminder (Flow B N2): tomorrow morning, in 2 days, or the day
// before it is due, each 9:00 on the student's calendar. The server works out
// the time, so a choice past the due date (or one already gone) is refused
// with 409 past_due. snooze_reminder() checks the reminder is theirs, sent
// and still open (not dismissed or marked paid).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid reminder ID.");
  const parsed = snoozeReminderSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  let found;
  try {
    found = await loadOneReminder(student, id);
  } catch {
    return databaseError("reminder_read", { message: "read failed" });
  }
  if (!found) return apiError(404, "not_found", "Reminder not found.");
  const { reminder, card, timeZone } = found;
  if (!reminder.sentAt) return apiError(409, "not_sent", "This reminder has not been sent yet.");
  if (reminder.actedAt || reminder.dismissedAt) return apiError(409, "closed", "This reminder is already done.");

  const option = snoozeOptions(reminder, card, new Date(), timeZone).find((o) => o.choice === parsed.data.choice);
  if (!option) return apiError(409, "past_due", "That time is past the due date. Pick another.");

  const { data, error } = await student.supabase.rpc("snooze_reminder", {
    p_reminder_id: id,
    p_until: option.until.toISOString(),
  });
  if (error?.code === "P0002") return apiError(404, "not_found", "Reminder not found.");
  if (error?.code === "55000") return apiError(409, "closed", "This reminder is already done.");
  if (error?.code === "22023") return apiError(409, "past_due", "That time is past the due date. Pick another.");
  if (error) return databaseError("reminder_snooze", error);
  return Response.json(reminderFromRow(data as ReminderRow, timeZone), { headers: { "Cache-Control": "no-store" } });
}
