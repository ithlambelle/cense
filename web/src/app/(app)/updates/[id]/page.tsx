import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FollowUpView } from "@/components/updates/follow-up-view";
import { applicationIdSchema } from "@/lib/api/schemas";
import { followUpView, updateItem } from "@/lib/reminders/in-app";
import { loadOneReminder } from "@/lib/reminders/in-app-data";
import { ROUTES, updatePath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Time to pay off your card | CENSE" };

// The follow-up (Flow B N3), opened from its card in Updates. Anything that
// is not an open follow-up of the student's (another student's id, one
// marked paid or dismissed, snoozed, or past its due date) goes back to
// Updates: the screen shows only while its card's action does.
export default async function FollowUpPage({ params }: PageProps<"/updates/[id]">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) redirect(ROUTES.updates);
  const student = await requireStudent(updatePath(id));
  const found = await loadOneReminder(student, id);
  if (!found) redirect(ROUTES.updates);
  const { reminder, card, timeZone } = found;
  const item = updateItem(reminder, card, new Date(), timeZone);
  if (reminder.kind !== "statement_closing" || !reminder.followUpAt || !item?.action) redirect(ROUTES.updates);
  const view = followUpView(reminder, card);
  const choices = item.snooze;
  return <FollowUpView id={reminder.id} cardName={view.cardName} due={view.due} choices={choices} />;
}
