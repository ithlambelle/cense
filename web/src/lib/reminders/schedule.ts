// When each reminder email goes out (the hackathon plan's reminder rules).
//
// - Statement closing soon: 3 days before the statement closes. The statement
//   balance is usually what gets reported to the credit bureaus, so paying
//   down before the close keeps the reported balance low.
// - Payment due: 3 days before the due date.
// - Check autopay: the day after the first statement closes.
//
// Everything here is a calendar date (YYYY-MM-DD) on the student's own
// calendar, so it never shifts with time zones. A card's closing or due day
// can be 29, 30 or 31; in a shorter month it falls on the month's last day,
// the way issuers handle it (day 31 is February 28, or 29 in a leap year).
// The cron job turns a remind-on date into due_at with the student's time zone.

export const DAYS_BEFORE = 3;
export const PAY_DOWN_SHARE = 0.3;

export type ReminderKind = "statement_closing" | "payment_due" | "check_autopay";

export type CardDays = {
  // Day of the month, 1 to 31, from card_applications.
  statementClosingDay: number;
  paymentDueDay: number;
};

export type ScheduledReminder = {
  kind: ReminderKind;
  // The date the reminder is about (the closing or due date). Saved as
  // reminders.occurrence, so each cycle can only be stored once.
  occurrence: string;
  // The day the email should go out.
  remindOn: string;
};

type Ymd = { year: number; month: number; day: number }; // month is 1 to 12

function parse(iso: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`not a calendar date: ${iso}`);
  const ymd = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (ymd.month < 1 || ymd.month > 12 || ymd.day < 1 || ymd.day > daysInMonth(ymd.year, ymd.month)) {
    throw new Error(`not a calendar date: ${iso}`);
  }
  return ymd;
}

function format({ year, month, day }: Ymd): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function checkDay(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error(`day of month must be 1 to 31, got ${day}`);
}

// The card's day in a given month: day 31 in April is April 30.
export function dayInMonth(year: number, month: number, day: number): string {
  checkDay(day);
  return format({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

export function addDays(iso: string, days: number): string {
  const { year, month, day } = parse(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return format({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

// The next date on or after `from` that falls on the card's day.
export function nextOnDay(day: number, from: string): string {
  const start = parse(from);
  const thisMonth = dayInMonth(start.year, start.month, day);
  if (thisMonth >= from) return thisMonth;
  const next = start.month === 12 ? { year: start.year + 1, month: 1 } : { year: start.year, month: start.month + 1 };
  return dayInMonth(next.year, next.month, day);
}

// A reminder about `occurrence`, sent DAYS_BEFORE days earlier. When that day
// has already passed but the occurrence has not, it goes out today instead:
// a late heads-up still helps, a skipped one does not.
function before(kind: ReminderKind, occurrence: string, today: string): ScheduledReminder {
  const ideal = addDays(occurrence, -DAYS_BEFORE);
  return { kind, occurrence, remindOn: ideal < today ? today : ideal };
}

// The next statement-closing and payment-due reminders from today, earliest first.
export function nextReminders(card: CardDays, today: string): ScheduledReminder[] {
  parse(today);
  const reminders = [
    before("statement_closing", nextOnDay(card.statementClosingDay, today), today),
    before("payment_due", nextOnDay(card.paymentDueDay, today), today),
  ];
  return reminders.sort((a, b) => (a.remindOn < b.remindOn ? -1 : a.remindOn > b.remindOn ? 1 : 0));
}

// The one-time autopay check: the day after the first statement closes.
// `setUpOn` is the day the student set up the card in Cense.
export function checkAutopayReminder(card: CardDays, setUpOn: string): ScheduledReminder {
  const firstClose = nextOnDay(card.statementClosingDay, setUpOn);
  return { kind: "check_autopay", occurrence: firstClose, remindOn: addDays(firstClose, 1) };
}

// After a reminder is sent, the same kind for the next cycle: the card's day
// in the month after this occurrence.
export function followingReminder(card: CardDays, sent: ScheduledReminder): ScheduledReminder | null {
  if (sent.kind === "check_autopay") return null;
  const day = sent.kind === "statement_closing" ? card.statementClosingDay : card.paymentDueDay;
  const next = nextOnDay(day, addDays(sent.occurrence, 1));
  return before(sent.kind, next, addDays(sent.occurrence, 1));
}

// The pay-down target in the closing email: 30% of the credit limit, in whole
// cents, rounded down so the target never goes over 30%.
export function payDownTargetCents(creditLimitCents: number): number {
  if (!Number.isInteger(creditLimitCents) || creditLimitCents < 0) {
    throw new Error(`credit limit must be whole cents, got ${creditLimitCents}`);
  }
  return Math.floor(creditLimitCents * PAY_DOWN_SHARE);
}
