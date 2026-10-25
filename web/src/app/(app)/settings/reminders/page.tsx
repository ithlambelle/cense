import type { Metadata } from "next";

import { ReminderSettingsView } from "@/components/account/reminder-settings-view";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadReminderSettings } from "@/lib/student-data";

export const metadata: Metadata = { title: "Reminder settings | CENSE" };

// Read on the server, so the toggles never flash their defaults. A
// signed-out student (from an email's footer link) comes back here after
// signing in.
export default async function ReminderSettingsPage() {
  const student = await requireStudent(ROUTES.reminderSettings);
  const settings = await loadReminderSettings(student);
  return <ReminderSettingsView settings={settings} email={student.email} />;
}
