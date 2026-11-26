import type { Metadata } from "next";

import { ReminderSettingsView } from "@/components/account/reminder-settings-view";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadComingUpCards, loadReminderSettings } from "@/lib/student-data";

export const metadata: Metadata = { title: "Reminder settings | CENSE" };

// Read on the server, so the toggles never flash their defaults. A
// signed-out student (from an email's footer link) comes back here after
// signing in.
export default async function ReminderSettingsPage() {
  const student = await requireStudent(ROUTES.reminderSettings);
  // The approved cards, for which ones get no due-date email (autopay on). A
  // failed read only leaves that line as it was.
  const [settings, cards] = await Promise.all([loadReminderSettings(student), loadComingUpCards(student)]);
  return (
    <ReminderSettingsView
      settings={settings}
      email={student.email}
      cards={(cards?.cards ?? []).map((card) => ({ name: card.name, autopayOn: card.autopayStatus === "on" }))}
    />
  );
}
