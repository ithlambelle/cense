import "server-only";

import type { Student } from "@/lib/api/auth";
import {
  REMINDER_FIELDS,
  reminderFromRow,
  safeTimeZone,
  type Reminder,
  type ReminderRow,
} from "@/lib/api/reminders";

import type { ReminderCard } from "./in-app";

// The reads behind Updates (Flow B), with the student's own session: RLS
// limits every read to their rows. Only sent reminders are in-app.

export type InAppData = {
  reminders: Reminder[];
  cards: Map<string, ReminderCard>;
  timeZone: string;
};

type CardRow = {
  id: string;
  card_name: string | null;
  credit_limit_cents: number | null;
  payment_due_day: number | null;
  autopay_status: string;
};

const CARD_FIELDS = "id, card_name, credit_limit_cents, payment_due_day, autopay_status";

const cardFromRow = (row: CardRow): ReminderCard => ({
  cardName: row.card_name,
  creditLimitCents: row.credit_limit_cents,
  paymentDueDay: row.payment_due_day,
  autopayStatus: row.autopay_status,
});

async function timeZoneOf(student: Student): Promise<string> {
  const { data, error } = await student.supabase
    .from("profiles")
    .select("time_zone")
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (error) throw new Error("Could not read the student's time zone.");
  return safeTimeZone((data as { time_zone: string | null } | null)?.time_zone);
}

// Every sent reminder, with its card and the student's time zone.
export async function loadInAppReminders(student: Student): Promise<InAppData> {
  const [reminders, cards, timeZone] = await Promise.all([
    student.supabase
      .from("reminders")
      .select(REMINDER_FIELDS)
      .eq("student_id", student.studentId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false }),
    student.supabase.from("card_applications").select(CARD_FIELDS).eq("student_id", student.studentId),
    timeZoneOf(student),
  ]);
  if (reminders.error) throw new Error("Could not read the student's reminders.");
  if (cards.error) throw new Error("Could not read the student's cards.");
  return {
    reminders: (reminders.data as ReminderRow[]).map((row) => reminderFromRow(row, timeZone)),
    cards: new Map((cards.data as CardRow[]).map((row) => [row.id, cardFromRow(row)])),
    timeZone,
  };
}

export type OneReminder = { reminder: Reminder; card: ReminderCard; timeZone: string };

// One of the student's reminders with its card. Null when it is not theirs or
// does not exist. Throws when the database cannot be read.
export async function loadOneReminder(student: Student, reminderId: string): Promise<OneReminder | null> {
  const [row, timeZone] = await Promise.all([
    student.supabase
      .from("reminders")
      .select(REMINDER_FIELDS)
      .eq("id", reminderId)
      .eq("student_id", student.studentId)
      .maybeSingle(),
    timeZoneOf(student),
  ]);
  if (row.error) throw new Error("Could not read the reminder.");
  if (!row.data) return null;
  const reminder = reminderFromRow(row.data as ReminderRow, timeZone);
  const card = await student.supabase
    .from("card_applications")
    .select(CARD_FIELDS)
    .eq("id", reminder.applicationId)
    .eq("student_id", student.studentId)
    .maybeSingle();
  if (card.error) throw new Error("Could not read the reminder's card.");
  if (!card.data) return null;
  return { reminder, card: cardFromRow(card.data as CardRow), timeZone };
}
