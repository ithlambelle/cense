import type { Reminder, SnoozeChoice } from "@/lib/api/reminders";
import { calendarDate } from "@/lib/api/reminders";
import { moneyAmount } from "@/lib/money";
import { applicationPath, cardSetupPath, deniedPath, updatePath } from "@/lib/routes";

import { addDays, nextOnDay, payDownTargetFor } from "./schedule";

// In-app reminders (US-08, Flow B on the Design Edits board, 477:1183). Once
// its email is sent, a reminder is a card in Updates with its one action and a
// Snooze. Everything here is worked out from the reminder row, its card and
// the student's time zone, so the page, the API and the tests agree.
//
// Ruthless brevity: a card is a title and one short line, never the email.

// The card fields a reminder needs: from card_applications.
export type ReminderCard = {
  cardName: string | null;
  creditLimitCents: number | null;
  // The monthly spend limit the student saved: the pay-down target when set.
  spendLimitCents: number | null;
  paymentDueDay: number | null;
  autopayStatus: string;
  // What autopay pays at the issuer ("statement_balance", "minimum",
  // "fixed_amount"), or null when autopay is not on or the type was not saved.
  autopayPaymentType: string | null;
  // The application's status and denial reason: a check-in (heard_back,
  // letter_check) closes once the student has told us.
  status: string;
  denialReason: string | null;
};

// A check-in is still waiting on the student: no decision saved yet
// (heard_back), or still waiting on the denial letter (letter_check).
// Every other kind is not a check-in, so this is true for it.
export function stillWaiting(kind: Reminder["kind"], card: ReminderCard): boolean {
  if (kind === "heard_back") return card.status === "applied";
  if (kind === "letter_check") return card.status === "rejected" && card.denialReason === "no_letter_yet";
  return true;
}

// The follow-up ("Time to pay off your card") counts only when autopay does
// not already pay the full statement balance. The job no longer raises one for
// such a card (20261126140500_follow_up_skips_full_autopay.sql); this also
// covers one raised before autopay was turned on, so the card stays a plain
// closed-statement reminder and never asks "I paid it".
export function followedUp(reminder: Pick<Reminder, "followUpAt">, card: ReminderCard): boolean {
  return reminder.followUpAt !== null && !(card.autopayStatus === "on" && card.autopayPaymentType === "statement_balance");
}

// The follow-up's line when autopay pays only part of the statement.
function autopayPart(card: ReminderCard): string | null {
  if (card.autopayStatus !== "on") return null;
  if (card.autopayPaymentType === "minimum") return "Autopay covers the minimum.";
  if (card.autopayPaymentType === "fixed_amount") return "Autopay pays a set amount.";
  return null;
}

export const SNOOZE_HOUR = 9;

export const SNOOZE_LABELS: Record<SnoozeChoice, string> = {
  tomorrow: "Tomorrow morning",
  in_2_days: "In 2 days",
  day_before_due: "The day before it is due",
};

// A calendar date as "Fri", "Dec 6" or "Sun, Dec 6". Dates are already on the
// student's calendar, so they are formatted as they are, never shifted.
const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const weekdayName = (date: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(utcDate(date));
export const monthDay = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(date));
export const fullDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(date));

// Whole days from `from` to `to`, both calendar dates.
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000);
}

// "Fri" within the coming week (or the one just gone), else "Dec 6".
function nearDay(date: string, today: string): string {
  return Math.abs(daysBetween(today, date)) <= 6 ? weekdayName(date) : monthDay(date);
}

// The instant of HH:00 on a calendar date in a time zone.
export function zonedHour(date: string, hour: number, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour);
  let guess = wanted;
  // Two passes settle the offset, including across a daylight saving change.
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += wanted - shown;
  }
  return new Date(guess);
}

// The payment due after a statement that closes on `closing`.
function dueAfter(closing: string, card: ReminderCard): string | null {
  return card.paymentDueDay ? nextOnDay(card.paymentDueDay, addDays(closing, 1)) : null;
}

// The date the reminder is about running out on, and what it is called: the
// statement closing until its follow-up comes, then the payment due date.
export function reminderDeadline(reminder: Reminder, card: ReminderCard): { date: string; label: string } | null {
  switch (reminder.kind) {
    case "statement_closing": {
      if (!followedUp(reminder, card)) return { date: reminder.occurrence, label: "Statement closes" };
      const due = dueAfter(reminder.occurrence, card);
      return due ? { date: due, label: "Payment due" } : null;
    }
    case "payment_due":
      return { date: reminder.occurrence, label: "Payment due" };
    case "check_autopay": {
      const due = dueAfter(reminder.occurrence, card);
      return due ? { date: due, label: "Payment due" } : null;
    }
    case "reapply":
    case "heard_back":
    case "letter_check":
      return null;
  }
}

export type SnoozeOption = { choice: SnoozeChoice; label: string; date: string; until: Date };

// The times the snooze sheet offers for one reminder, each 9:00 on a later day
// of the student's calendar: never today (before 9 AM, "the day before it is
// due" could be this morning, a snooze of minutes), never in the past and
// never after the due date. "The day before it is due" is left out when there
// is no due date or it falls on the same day as one of the other two; before a
// statement closes it is the day before the close, and says so.
export function snoozeOptions(reminder: Reminder, card: ReminderCard, now: Date, timeZone: string): SnoozeOption[] {
  const today = calendarDate(now.toISOString(), timeZone);
  const deadline = reminderDeadline(reminder, card);
  const dates: [SnoozeChoice, string | null][] = [
    ["tomorrow", addDays(today, 1)],
    ["in_2_days", addDays(today, 2)],
    ["day_before_due", deadline ? addDays(deadline.date, -1) : null],
  ];
  const options: SnoozeOption[] = [];
  for (const [choice, date] of dates) {
    if (!date || date <= today) continue;
    if (deadline && date > deadline.date) continue;
    const until = zonedHour(date, SNOOZE_HOUR, timeZone);
    if (until.getTime() <= now.getTime()) continue;
    if (choice === "day_before_due" && options.some((o) => o.date === date)) continue;
    const label = choice === "day_before_due" && deadline?.label === "Statement closes"
      ? "The day before it closes"
      : SNOOZE_LABELS[choice];
    options.push({ choice, label, date, until });
  }
  return options;
}

export type UpdateGroup = "new" | "snoozed" | "earlier";

export type UpdateIcon = "bell" | "file" | "calendar";

export type UpdateAction =
  | { type: "paid"; label: string }
  | { type: "link"; label: string; href: string };

export type UpdateItem = {
  id: string;
  kind: Reminder["kind"];
  group: UpdateGroup;
  icon: UpdateIcon;
  title: string;
  description: string;
  // The description shows money (the pay-down target): masked in replay.
  sensitive: boolean;
  // "Now", "3h", "2d", or the day a snoozed card comes back ("Sat").
  time: string;
  // The card's one action and Snooze, only while it can still be acted on.
  action: UpdateAction | null;
  // The snooze sheet's times for it; empty when there is no Snooze.
  snooze: { choice: SnoozeChoice; label: string }[];
  // It can be dismissed for its billing cycle: whenever its action shows,
  // even with no snooze time left (then Dismiss is on the card itself).
  dismissable: boolean;
  // The follow-up's own screen (N3), opened from its title.
  href: string | null;
};

// How long a reminder with no due date (check autopay without a due day,
// reapply) stays actionable after it came up.
const OPEN_DAYS_WITHOUT_DEADLINE = 7;
// Reminders sent longer ago than this are no longer listed (and not read).
export const LIST_DAYS = 45;

const latest = (...instants: (string | null)[]) =>
  instants.filter((v): v is string => v !== null).reduce((a, b) => (a > b ? a : b));

// When the card last came up: the email, the follow-up, or the end of a snooze.
export function surfacedAt(reminder: Reminder, now: Date): string {
  const snoozeOver = reminder.snoozedUntil && new Date(reminder.snoozedUntil) <= now ? reminder.snoozedUntil : null;
  return latest(reminder.sentAt, reminder.followUpAt, snoozeOver);
}

function ago(instant: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(instant).getTime()) / 60_000));
  if (minutes < 60) return "Now";
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / (24 * 60))}d`;
}

type Copy = { icon: UpdateIcon; title: string; description: string; sensitive?: boolean; action: UpdateAction | null };

function copy(reminder: Reminder, card: ReminderCard, today: string, applicationId: string): Copy {
  switch (reminder.kind) {
    case "statement_closing": {
      if (followedUp(reminder, card)) {
        const due = dueAfter(reminder.occurrence, card);
        const by = due ? monthDay(due) : "the due date";
        const part = autopayPart(card);
        return {
          icon: "file",
          title: "Time to pay off your card",
          description: part
            ? `Statement closed ${nearDay(reminder.occurrence, today)}. ${part} Pay the rest by ${by}.`
            : `Statement closed ${nearDay(reminder.occurrence, today)}. Pay the full balance by ${by}.`,
          action: { type: "paid", label: "I paid it" },
        };
      }
      const closed = reminder.occurrence < today;
      const targetCents = payDownTargetFor(card.creditLimitCents, card.spendLimitCents);
      const target = targetCents === null ? null : moneyAmount(targetCents);
      return {
        icon: "bell",
        title: `Statement ${closed ? "closed" : "closes"} ${nearDay(reminder.occurrence, today)}`,
        description: target ? `Pay down to ${target} or less.` : "Pay it down before it closes.",
        sensitive: target !== null,
        action: { type: "paid", label: "I paid it down" },
      };
    }
    case "payment_due":
      // Once the date has passed it reads as past, with what still helps:
      // issuers report a payment to the credit bureaus once it is 30 days late.
      if (reminder.occurrence < today) {
        return {
          icon: "calendar",
          title: `Payment was due ${monthDay(reminder.occurrence)}`,
          description: "Not paid yet? Pay now, before it’s 30 days late.",
          action: { type: "paid", label: "I paid it" },
        };
      }
      return {
        icon: "calendar",
        title: `Payment due ${monthDay(reminder.occurrence)}`,
        description: card.autopayStatus === "on" ? "Autopay pays it. Check your bank can cover it." : "Pay the full statement balance.",
        action: { type: "paid", label: "I paid it" },
      };
    case "check_autopay":
      return {
        icon: "file",
        title: "Your first statement is here",
        description: "Is autopay set to the full balance?",
        action: { type: "link", label: "Check autopay", href: cardSetupPath(applicationId) },
      };
    case "reapply":
      return {
        icon: "calendar",
        title: "Your reapply day",
        description: "Check your plan before you apply.",
        action: { type: "link", label: "See your plan", href: deniedPath("plan", applicationId) },
      };
    case "heard_back":
      return {
        icon: "bell",
        title: "Heard back yet?",
        description: `${card.cardName ?? "Your card"}: tell us what the issuer decided.`,
        action: { type: "link", label: "Tell us", href: applicationPath(applicationId) },
      };
    case "letter_check":
      return {
        icon: "file",
        title: "Has your letter come?",
        description: `${card.cardName ?? "Your card"}: tell us the reason it gives.`,
        action: { type: "link", label: "I got my letter", href: deniedPath("options", applicationId) },
      };
  }
}

// One sent reminder as an Updates card, or null when it is not shown
// (not sent, dismissed for its cycle, or long gone).
export function updateItem(reminder: Reminder, card: ReminderCard, now: Date, timeZone: string): UpdateItem | null {
  if (!reminder.sentAt || reminder.dismissedAt) return null;
  if (now.getTime() - new Date(reminder.sentAt).getTime() > LIST_DAYS * 86_400_000) return null;
  const today = calendarDate(now.toISOString(), timeZone);
  const surfaced = surfacedAt(reminder, now);
  const deadline = reminderDeadline(reminder, card);
  // A check-in the student has answered (a decision, or the letter's reason)
  // is done, like one marked paid.
  const answered = !stillWaiting(reminder.kind, card);
  const open = reminder.actedAt === null && !answered && (deadline
    ? today <= deadline.date
    : daysBetween(calendarDate(surfaced, timeZone), today) < OPEN_DAYS_WITHOUT_DEADLINE);
  const snoozed = open && reminder.snoozedUntil !== null && new Date(reminder.snoozedUntil) > now;
  const unread = reminder.readAt === null || reminder.readAt < surfaced;
  const group: UpdateGroup = !open ? "earlier" : snoozed ? "snoozed" : unread ? "new" : "earlier";

  const base = copy(reminder, card, today, reminder.applicationId);
  const snoozeDay = snoozed ? calendarDate(reminder.snoozedUntil!, timeZone) : null;
  let description = base.description;
  let sensitive = base.sensitive ?? false;
  if (answered) {
    description = reminder.kind === "heard_back" ? "You told us what they decided." : "You told us your letter came.";
    sensitive = false;
  } else if (reminder.actedAt) {
    // Before the close the button is "I paid it down", so the card says that.
    description = reminder.kind === "statement_closing" && !followedUp(reminder, card)
      ? "You marked it paid down."
      : "You marked it paid.";
    sensitive = false;
  } else if (snoozeDay) {
    description = `Snoozed until ${weekdayName(snoozeDay)}.`;
    sensitive = false;
  }
  return {
    id: reminder.id,
    kind: reminder.kind,
    group,
    icon: base.icon,
    title: base.title,
    description,
    sensitive,
    time: snoozeDay ? weekdayName(snoozeDay) : ago(surfaced, now),
    action: open && !snoozed ? base.action : null,
    snooze: open && !snoozed ? snoozeOptions(reminder, card, now, timeZone).map(({ choice, label }) => ({ choice, label })) : [],
    dismissable: open && !snoozed,
    href: reminder.kind === "statement_closing" && followedUp(reminder, card) && open ? updatePath(reminder.id) : null,
  };
}

// Every card for Updates, grouped New, Snoozed, Earlier, newest first.
export function updateGroups(
  reminders: Reminder[],
  cards: Map<string, ReminderCard>,
  now: Date,
  timeZone: string,
): Record<UpdateGroup, UpdateItem[]> {
  const items = reminders
    .map((reminder) => {
      const card = cards.get(reminder.applicationId);
      return card ? { item: updateItem(reminder, card, now, timeZone), at: surfacedAt(reminder, now) } : null;
    })
    .filter((entry): entry is { item: UpdateItem; at: string } => entry?.item != null)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return {
    new: items.filter((e) => e.item.group === "new").map((e) => e.item),
    snoozed: items.filter((e) => e.item.group === "snoozed").map((e) => e.item),
    earlier: items.filter((e) => e.item.group === "earlier").map((e) => e.item),
  };
}

// The follow-up screen's numbers (N3): the card, the due date.
// `autopay` is the line for autopay that pays only part of it, or null.
export function followUpView(reminder: Reminder, card: ReminderCard): { cardName: string; due: string | null; autopay: string | null } {
  const due = dueAfter(reminder.occurrence, card);
  return { cardName: card.cardName ?? "Your card", due: due ? monthDay(due) : null, autopay: autopayPart(card) };
}

// The Snoozed screen's words (N4): "tomorrow" or the weekday it comes back.
export function snoozedView(reminder: Reminder, card: ReminderCard, now: Date, timeZone: string) {
  if (!reminder.snoozedUntil) return null;
  const today = calendarDate(now.toISOString(), timeZone);
  const back = calendarDate(reminder.snoozedUntil, timeZone);
  const isTomorrow = back === addDays(today, 1);
  const day = isTomorrow ? "tomorrow" : weekdayName(back);
  const deadline = reminderDeadline(reminder, card);
  return {
    day,
    comesBack: `${isTomorrow ? "Tomorrow" : weekdayName(back)}, ${SNOOZE_HOUR} AM`,
    deadline: deadline ? { label: deadline.label, date: fullDate(deadline.date) } : null,
  };
}
