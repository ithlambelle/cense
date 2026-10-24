import { authenticatedStudent, type Student } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import {
  createReapplyReminderSchema,
  REMINDER_FIELDS,
  reminderFromRow,
  safeTimeZone,
  type ReminderRow,
} from "@/lib/api/reminders";

async function studentTimeZone(student: Student): Promise<string> {
  const { data } = await student.supabase.from("profiles").select("time_zone").eq("student_id", student.studentId).maybeSingle();
  return safeTimeZone((data as { time_zone: string | null } | null)?.time_zone);
}

// The student's reminders, sent and upcoming, earliest first.
export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const [reminders, timeZone] = await Promise.all([
    student.supabase
      .from("reminders")
      .select(REMINDER_FIELDS)
      .eq("student_id", student.studentId)
      .order("due_at", { ascending: true }),
    studentTimeZone(student),
  ]);
  if (reminders.error) return databaseError("reminders_read", reminders.error);

  return Response.json(
    { reminders: (reminders.data as ReminderRow[]).map((row) => reminderFromRow(row, timeZone)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// The reapply reminder after a denial: the student picks the day. The
// database function checks the application is theirs and rejected, and that
// the day is tomorrow to a year out; picking again replaces the unsent one.
export async function POST(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const parsed = createReapplyReminderSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const { data, error } = await student.supabase.rpc("create_reapply_reminder", {
    p_application_id: parsed.data.applicationId,
    p_remind_on: parsed.data.remindOn,
  });
  if (error?.code === "P0002") return apiError(404, "not_found", "Application not found.");
  if (error?.code === "22023") {
    return apiError(400, "invalid_reminder", "Pick a day from tomorrow to a year from now, for a denied application.");
  }
  if (error?.code === "23505") return apiError(409, "already_sent", "That reminder was already sent.");
  if (error) return databaseError("reminder_create", error);

  const timeZone = await studentTimeZone(student);
  return Response.json(reminderFromRow(data as ReminderRow, timeZone), {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
