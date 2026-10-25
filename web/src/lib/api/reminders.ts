import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Reminder emails (spec C2). The server schedules them (refresh_reminders in
// the database); students read theirs, pick the day for the one reapply
// reminder after a denial, and mark a sent one acted on ("I paid it down").

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
  createdAt: z.iso.datetime({ offset: true }),
}).openapi("Reminder");

export const createReapplyReminderSchema = z.strictObject({
  applicationId: z.uuid(),
  remindOn: z.iso.date(),
});

export type Reminder = z.infer<typeof reminderSchema>;

export const REMINDER_FIELDS = "id, card_application_id, kind, occurrence, due_at, sent_at, acted_at, created_at";

export type ReminderRow = {
  id: string;
  card_application_id: string;
  kind: string;
  occurrence: string;
  due_at: string;
  sent_at: string | null;
  acted_at: string | null;
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
