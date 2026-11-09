import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Reminder emails (spec C2). The server schedules them (refresh_reminders in
// the database); students read theirs, pick the day for the one reapply
// reminder after a denial, and mark a sent one acted on ("I paid it down").
// Once sent, a reminder is also an in-app card in Updates (Flow B): it can be
// marked read, snoozed or dismissed for its billing cycle, and a statement
// reminder gets one follow-up 2 days after the close if it was not marked paid.

export const reminderKindSchema = z.enum(["statement_closing", "payment_due", "check_autopay", "reapply"]);

export const reminderSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  kind: reminderKindSchema,
  // The date the reminder is about: the closing, due or reapply date.
  occurrence: z.iso.date(),
  // The day the email goes out, on the student's calendar.
  remindOn: z.iso.date(),
  dueAt: z.iso.datetime({ offset: true }),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  actedAt: z.iso.datetime({ offset: true }).nullable(),
  // In-app state, all null until the email is sent.
  readAt: z.iso.datetime({ offset: true }).nullable(),
  snoozedUntil: z.iso.datetime({ offset: true }).nullable(),
  dismissedAt: z.iso.datetime({ offset: true }).nullable(),
  // When the one follow-up came (statement_closing only).
  followUpAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
}).openapi("Reminder");

// The snooze sheet's three times, worked out on the student's calendar: 9:00
// tomorrow, 9:00 in 2 days, or 9:00 the day before the reminder's due date.
export const snoozeChoiceSchema = z.enum(["tomorrow", "in_2_days", "day_before_due"]);

export const snoozeReminderSchema = z.strictObject({
  choice: snoozeChoiceSchema,
});

export const markRemindersReadSchema = z.strictObject({
  // How many reminders this marked read.
  marked: z.int().min(0),
}).openapi("MarkRemindersRead");

export type SnoozeChoice = z.infer<typeof snoozeChoiceSchema>;

export const createReapplyReminderSchema = z.strictObject({
  applicationId: z.uuid(),
  remindOn: z.iso.date(),
});

export type Reminder = z.infer<typeof reminderSchema>;

// The answer to setting the reapply reminder: the reminder, and whether its
// confirmation email went out, so the app only says "we emailed you" when it did.
export const confirmationOutcomeSchema = z.enum(["sent", "skipped", "failed"]);
// A flat object rather than an extension of Reminder: an allOf of two strict
// objects would refuse every answer.
export const savedReapplyReminderSchema = z
  .strictObject({ ...reminderSchema.shape, confirmation: confirmationOutcomeSchema })
  .openapi("SavedReapplyReminder");
export type ConfirmationOutcome = z.infer<typeof confirmationOutcomeSchema>;
// The answer to confirming a card's payment reminders by email.
export const reminderConfirmationSchema = z
  .strictObject({ confirmation: confirmationOutcomeSchema })
  .openapi("ReminderConfirmation");

export const REMINDER_FIELDS =
  "id, card_application_id, kind, occurrence, due_at, sent_at, acted_at, read_at, snoozed_until, dismissed_at, follow_up_at, created_at";

export type ReminderRow = {
  id: string;
  card_application_id: string;
  kind: string;
  occurrence: string;
  due_at: string;
  sent_at: string | null;
  acted_at: string | null;
  read_at: string | null;
  snoozed_until: string | null;
  dismissed_at: string | null;
  follow_up_at: string | null;
  created_at: string;
};

const DEFAULT_TIME_ZONE = "America/New_York";

// The student's time zone, or New York when it is missing or not a real
// name, the same fallback the database uses.
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

// An instant as a calendar date (YYYY-MM-DD) in a time zone.
export function calendarDate(instant: string, timeZone: string): string {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

const iso = (value: string) => new Date(value).toISOString();

export function reminderFromRow(row: ReminderRow, timeZone: string): Reminder {
  return {
    id: row.id,
    applicationId: row.card_application_id,
    kind: reminderKindSchema.parse(row.kind),
    occurrence: row.occurrence,
    remindOn: calendarDate(row.due_at, timeZone),
    dueAt: iso(row.due_at),
    sentAt: row.sent_at ? iso(row.sent_at) : null,
    actedAt: row.acted_at ? iso(row.acted_at) : null,
    readAt: row.read_at ? iso(row.read_at) : null,
    snoozedUntil: row.snoozed_until ? iso(row.snoozed_until) : null,
    dismissedAt: row.dismissed_at ? iso(row.dismissed_at) : null,
    followUpAt: row.follow_up_at ? iso(row.follow_up_at) : null,
    createdAt: iso(row.created_at),
  };
}

// The student's reminder settings (profiles): each kind on or off, and
// whether reminder emails are on at all (off after the unsubscribe link).
export const reminderSettingsSchema = z.strictObject({
  emailsOn: z.boolean(),
  statementClosing: z.boolean(),
  paymentDue: z.boolean(),
  checkAutopay: z.boolean(),
}).openapi("ReminderSettings");

export const updateReminderSettingsSchema = z.strictObject({
  emailsOn: z.boolean().optional(),
  statementClosing: z.boolean().optional(),
  paymentDue: z.boolean().optional(),
  checkAutopay: z.boolean().optional(),
}).refine((body) => Object.values(body).some((value) => value !== undefined), {
  message: "Send at least one setting to change.",
});

export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;

export const REMINDER_SETTINGS_FIELDS =
  "reminders_unsubscribed_at, remind_statement_closing, remind_payment_due, remind_check_autopay";

export type ReminderSettingsRow = {
  reminders_unsubscribed_at: string | null;
  remind_statement_closing: boolean;
  remind_payment_due: boolean;
  remind_check_autopay: boolean;
};

export function reminderSettingsFromRow(row: ReminderSettingsRow): ReminderSettings {
  return {
    emailsOn: row.reminders_unsubscribed_at === null,
    statementClosing: row.remind_statement_closing,
    paymentDue: row.remind_payment_due,
    checkAutopay: row.remind_check_autopay,
  };
}
