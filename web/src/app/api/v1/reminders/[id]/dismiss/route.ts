import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { reminderFromRow, safeTimeZone, type ReminderRow } from "@/lib/api/reminders";
import { applicationIdSchema } from "@/lib/api/schemas";

// Dismiss a sent reminder for the rest of its billing cycle (Flow B N2). The
// next cycle's reminder is its own row, so it starts fresh. The first time is
// kept; dismiss_reminder() checks the reminder is theirs and sent.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid reminder ID.");

  const { data, error } = await student.supabase.rpc("dismiss_reminder", { p_reminder_id: id });
  if (error?.code === "P0002") return apiError(404, "not_found", "Reminder not found.");
  if (error?.code === "55000") return apiError(409, "not_sent", "This reminder has not been sent yet.");
  if (error) return databaseError("reminder_dismiss", error);

  const profile = await student.supabase.from("profiles").select("time_zone").eq("student_id", student.studentId).maybeSingle();
  const timeZone = safeTimeZone((profile.data as { time_zone: string | null } | null)?.time_zone);
  return Response.json(reminderFromRow(data as ReminderRow, timeZone), { headers: { "Cache-Control": "no-store" } });
}
