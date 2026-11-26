import type { Metadata } from "next";

import { DeniedOptionsView } from "@/components/denied/options-view";
import { ReminderArrival } from "@/components/home/reminder-arrival";
import { applicationParam } from "@/lib/denied";
import { REMINDER_PARAM, reminderKindParam, ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Denial options | CENSE" };

// Opened from the "Has your letter come?" email's button
// (?reminder=letter_check), it counts the visit.
export default async function DeniedPage({ searchParams }: PageProps<"/denied">) {
  await requireStudent(ROUTES.home);
  const params = await searchParams;
  const fromReminder = reminderKindParam(params[REMINDER_PARAM]);
  return (
    <>
      {fromReminder ? <ReminderArrival kind={fromReminder} /> : null}
      <DeniedOptionsView applicationId={applicationParam(params.application)} />
    </>
  );
}
