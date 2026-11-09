import type { Metadata } from "next";

import { UpdatesView } from "@/components/updates/updates-view";
import { updateGroups } from "@/lib/reminders/in-app";
import { loadInAppReminders } from "@/lib/reminders/in-app-data";
import { REMINDER_PARAM, reminderArrivalPath, reminderKindParam, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Updates | CENSE" };

// Read on the server, so the cards never flash. Opened from a reminder
// email's Open Cense (?reminder=<kind>), it counts the visit; a signed-out
// student comes back to the same address after signing in.
export default async function UpdatesPage({ searchParams }: PageProps<"/updates">) {
  const params = await searchParams;
  const fromReminder = reminderKindParam(params[REMINDER_PARAM]);
  const student = await requireStudent(fromReminder ? reminderArrivalPath(fromReminder) : ROUTES.updates);
  const { reminders, cards, timeZone } = await loadInAppReminders(student);
  return <UpdatesView groups={updateGroups(reminders, cards, new Date(), timeZone)} fromReminder={fromReminder} />;
}
