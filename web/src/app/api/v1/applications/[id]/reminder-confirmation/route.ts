import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { calendarDate, safeTimeZone } from "@/lib/api/reminders";
import { applicationIdSchema } from "@/lib/api/schemas";
import { addDays } from "@/lib/reminders/schedule";
import { sendPaymentRemindersConfirmation } from "@/lib/reminders/send-confirmation";

type Params = { params: Promise<{ id: string }> };

type CardRow = {
  status: string;
  source: string;
  card_name: string | null;
  statement_closing_day: number | null;
  payment_due_day: number | null;
  autopay_status: string;
  updated_at: string;
};

type ProfileRow = {
  time_zone: string | null;
  remind_statement_closing: boolean;
  remind_payment_due: boolean;
  remind_check_autopay: boolean;
};

type ReminderRow = { kind: "statement_closing" | "payment_due" | "check_autopay"; occurrence: string; attempts: number };

// Emails the student a confirmation of an approved card's payment reminders,
// called by the payment reminder screen after it saves new days. Saving the
// days makes the database schedule the card's reminders (refresh_reminders),
// so this reads those rows rather than working the dates out again, and keeps
// only the ones the daily job would send (claim_due_reminders): each kind's
// own switch, no due-date or autopay-check email while autopay is on, the
// autopay check only for a card got through Cense. The email names what is
// coming and the card's next dates, never the day an email goes out, which
// the job's one-a-day limit can move. The answer says whether it was sent,
// skipped (no reminder on, emails off or not set up) or failed; the save
// itself never depends on it.
export async function POST(_request: Request, context: Params): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");

  const { id } = await context.params;
  if (!applicationIdSchema.safeParse(id).success) return apiError(400, "invalid_request", "Invalid application ID.");

  const [card, profile, scheduled] = await Promise.all([
    student.supabase
      .from("card_applications")
      .select("status, source, card_name, statement_closing_day, payment_due_day, autopay_status, updated_at")
      .eq("id", id)
      .eq("student_id", student.studentId)
      .maybeSingle(),
    student.supabase
      .from("profiles")
      .select("time_zone, remind_statement_closing, remind_payment_due, remind_check_autopay")
      .eq("student_id", student.studentId)
      .maybeSingle(),
    student.supabase
      .from("reminders")
      .select("kind, occurrence, attempts")
      .eq("card_application_id", id)
      .eq("student_id", student.studentId)
      .in("kind", ["statement_closing", "payment_due", "check_autopay"])
      .is("sent_at", null)
      .order("occurrence", { ascending: true }),
  ]);
  if (card.error) return databaseError("application_read", card.error);
  if (profile.error) return databaseError("reminder_settings_read", profile.error);
  if (scheduled.error) return databaseError("reminders_read", scheduled.error);
  const row = card.data as CardRow | null;
  if (!row) return apiError(404, "not_found", "Application not found.");
  if (row.status !== "approved" || row.statement_closing_day === null || row.payment_due_day === null) {
    return apiError(409, "reminders_not_set", "Save the card's statement and due days first.");
  }

  const settings = profile.data as ProfileRow | null;
  const today = calendarDate(new Date().toISOString(), safeTimeZone(settings?.time_zone));
  // Only rows the daily job could still send (claim_due_reminders): fewer
  // than 3 attempts, a closing or due date not passed, an autopay check at
  // most 3 days after its first close. A failed send is kept, so it is skipped.
  const sendable = (scheduled.data as ReminderRow[]).filter(
    (r) => r.attempts < 3 && r.occurrence >= (r.kind === "check_autopay" ? addDays(today, -3) : today),
  );
  // The card's next date for a kind, or null when none is scheduled (this
  // cycle's email already went, for example).
  const next = (kind: ReminderRow["kind"]) => sendable.find((r) => r.kind === kind)?.occurrence ?? null;
  const autopayOn = row.autopay_status === "on";
  // Whether a monthly reminder is named follows its switch (default on, as in
  // the database) and autopay; the scheduled row only gives the date.
  const statementOn = settings?.remind_statement_closing !== false;
  const dueOn = settings?.remind_payment_due !== false && !autopayOn;
  // The one-time autopay check is named only while one can still go out.
  const autopayCheck =
    settings?.remind_check_autopay !== false && !autopayOn && row.source === "application" && next("check_autopay") !== null;

  const confirmation =
    statementOn || dueOn || autopayCheck
      ? await sendPaymentRemindersConfirmation(
          student,
          {
            applicationId: id,
            cardName: row.card_name,
            today,
            statementClosing: statementOn ? { next: next("statement_closing") } : null,
            paymentDue: dueOn ? { next: next("payment_due") } : null,
            autopayCheck,
            autopayOn,
          },
          // Each save of the days changes updated_at: a new confirmation, while
          // a retry of the same request is still sent once.
          row.updated_at,
        )
      : "skipped";
  return Response.json({ confirmation }, { headers: { "Cache-Control": "no-store" } });
}
