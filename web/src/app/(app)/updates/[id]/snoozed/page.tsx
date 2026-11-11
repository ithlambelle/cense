import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SnoozedView } from "@/components/updates/snoozed-view";
import { applicationIdSchema } from "@/lib/api/schemas";
import { snoozedView } from "@/lib/reminders/in-app";
import { loadOneReminder } from "@/lib/reminders/in-app-data";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Snoozed | CENSE" };

// After a snooze (Flow B N4): when it comes back and what dismissing would do
// instead. Read from the saved snooze, so a reload shows the same. Once the
// snooze is over, or for anything not the student's, it is Updates.
export default async function SnoozedPage({ params }: PageProps<"/updates/[id]/snoozed">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) redirect(ROUTES.updates);
  const student = await requireStudent(ROUTES.updates);
  const found = await loadOneReminder(student, id);
  if (!found) redirect(ROUTES.updates);
  const { reminder, card, timeZone } = found;
  const now = new Date();
  if (!reminder.snoozedUntil || new Date(reminder.snoozedUntil) <= now || reminder.dismissedAt) redirect(ROUTES.updates);
  const view = snoozedView(reminder, card, now, timeZone);
  if (!view) redirect(ROUTES.updates);
  return <SnoozedView day={view.day} comesBack={view.comesBack} deadline={view.deadline} />;
}
