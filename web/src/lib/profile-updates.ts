import type { ReminderKind } from "@/lib/routes";

// Profile's Updates section (Flow F, F5, Figma 477:2807): what exists today
// is the reminder emails already sent, so those are the updates. No "new"
// count yet: nothing records when the student saw them until the Updates
// screen exists.

export type SentReminder = { kind: ReminderKind; occurrence: string; sentAt: string };

export type ProfileUpdate = { title: string; body: string; when: string };

export type ProfileUpdates = { latest: ProfileUpdate | null };

// "Nov 12" for a calendar date (YYYY-MM-DD), never shifted.
function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

// One line each, in the emails' words, shortened.
function updateFor(reminder: SentReminder): Omit<ProfileUpdate, "when"> {
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

export function profileUpdates(sent: SentReminder[], now: Date = new Date()): ProfileUpdates {
  const first = [...sent].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  if (!first) return { latest: null };
  const sentDay = first.sentAt.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return { latest: { ...updateFor(first), when: sentDay === today ? "Today" : dayLabel(sentDay) } };
}
