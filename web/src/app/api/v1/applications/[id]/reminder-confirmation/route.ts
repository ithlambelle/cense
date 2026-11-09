import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { calendarDate, safeTimeZone } from "@/lib/api/reminders";
import { applicationIdSchema } from "@/lib/api/schemas";
import { nextReminders } from "@/lib/reminders/schedule";
import { sendPaymentRemindersConfirmation } from "@/lib/reminders/send-confirmation";

type Params = { params: Promise<{ id: string }> };

type CardRow = {
  status: string;
  card_name: string | null;
  statement_closing_day: number | null;
  payment_due_day: number | null;
  autopay_status: string;
};

type ProfileRow = {
  time_zone: string | null;
  remind_statement_closing: boolean;
  remind_payment_due: boolean;
};

// Emails the student a confirmation of an approved card's payment reminders,
// called by the payment reminder screen after it saves new days. It names
// each reminder that will go out and its day, read here from what is saved,
// so the email always matches the schedule. Sending is idempotent per card
// and pair of days. The answer says whether it was sent, skipped (no reminder
// on, emails off or not set up) or failed; the save itself never depends on it.
export async function POST(_request: Request, context: Params): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid application ID.");

  const [card, profile] = await Promise.all([
    student.supabase
      .from("card_applications")
      .select("status, card_name, statement_closing_day, payment_due_day, autopay_status")
      .eq("id", id)
      .eq("student_id", student.studentId)
      .maybeSingle(),
    student.supabase
      .from("profiles")
      .select("time_zone, remind_statement_closing, remind_payment_due")
      .eq("student_id", student.studentId)
      .maybeSingle(),
  ]);
  if (card.error) return databaseError("application_read", card.error);
  if (profile.error) return databaseError("reminder_settings_read", profile.error);
  const row = card.data as CardRow | null;
  if (!row) return apiError(404, "not_found", "Application not found.");
  if (row.status !== "approved" || row.statement_closing_day === null || row.payment_due_day === null) {
    return apiError(409, "reminders_not_set", "Save the card's statement and due days first.");
  }

  const settings = profile.data as ProfileRow | null;
  const today = calendarDate(new Date().toISOString(), safeTimeZone(settings?.time_zone));
  const days = { statementClosingDay: row.statement_closing_day, paymentDueDay: row.payment_due_day };
  const next = nextReminders(days, today);
  const remindOn = (kind: "statement_closing" | "payment_due") => ({ remindOn: next.find((r) => r.kind === kind)!.remindOn });
  const autopayOn = row.autopay_status === "on";
  // Each reminder's own switch, as the daily job reads them (default on).
  // The due-date email is skipped while autopay is on.
  const statementClosing = settings?.remind_statement_closing === false ? null : remindOn("statement_closing");
  const paymentDue = settings?.remind_payment_due === false || autopayOn ? null : remindOn("payment_due");

  const confirmation =
    statementClosing || paymentDue
      ? await sendPaymentRemindersConfirmation(
          student,
          { applicationId: id, cardName: row.card_name, today, statementClosing, paymentDue, autopayOn },
          days,
        )
      : "skipped";
  return Response.json({ confirmation }, { headers: { "Cache-Control": "no-store" } });
}
