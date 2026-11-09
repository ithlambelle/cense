import { calendarDate, type Reminder } from "@/lib/api/reminders";
import { updateGroups, updateItem, type ReminderCard } from "@/lib/reminders/in-app";

// Profile's Updates section (Flow F, F5, Figma 477:2807): the latest reminder
// that still needs the student, and how many are new. A reminder whose date has
// passed, that was marked paid, dismissed or snoozed is not shown here (Ben,
// 2026-11-09: Profile showed a payment due five days earlier); the Updates
// screen keeps it under Earlier. With none, the section is left out. "New" is the Updates screen's own New group
// (sent, not read since it last came up, not dismissed, still open), so the
// count always matches what Updates shows and "Mark all read" clears it.

export type ProfileUpdate = { title: string; body: string; when: string };

export type ProfileUpdates = { newCount: number; latest: ProfileUpdate | null };

// "Nov 12" for a calendar date (YYYY-MM-DD), never shifted.
function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

// One line each, in the emails' words, shortened.
function updateFor(reminder: Pick<Reminder, "kind" | "occurrence">): Omit<ProfileUpdate, "when"> {
  const day = dayLabel(reminder.occurrence);
  switch (reminder.kind) {
    case "statement_closing":
      return { title: `Statement closes ${day}`, body: "Pay it down before then." };
    case "payment_due":
      return { title: `Payment due ${day}`, body: "Pay the full statement balance." };
    case "check_autopay":
      return { title: "Your first statement is here", body: "Check autopay is set to the full balance." };
    case "reapply":
      return { title: "Time to check your plan", body: "You picked today to think about reapplying." };
  }
}

// "Today" and the day an update was sent are on the student's calendar (their
// time zone), as the reminders themselves are. The latest is the newest sent
// reminder still open on the Updates screen and not snoozed.
export function profileUpdates(
  reminders: Reminder[],
  cards: Map<string, ReminderCard>,
  timeZone: string,
  now: Date = new Date(),
): ProfileUpdates {
  const newCount = updateGroups(reminders, cards, now, timeZone).new.length;
  const first = reminders
    .filter((reminder): reminder is Reminder & { sentAt: string } => {
      if (reminder.sentAt === null) return false;
      const card = cards.get(reminder.applicationId);
      return card !== undefined && updateItem(reminder, card, now, timeZone)?.dismissable === true;
    })
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  if (!first) return { newCount, latest: null };
  const sentDay = calendarDate(first.sentAt, timeZone);
  const today = calendarDate(now.toISOString(), timeZone);
  return { newCount, latest: { ...updateFor(first), when: sentDay === today ? "Today" : dayLabel(sentDay) } };
}
