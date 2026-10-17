import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ReminderSavedView } from "@/components/denied/reminder-saved-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { formatIsoDate } from "@/lib/dates";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Reminder saved | CENSE" };

export default async function ReminderSavedPage({ searchParams }: PageProps<"/denied/reminder/saved">) {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  const on = (await searchParams).on;
  const dateLabel = typeof on === "string" ? formatIsoDate(on) : null;
  if (!dateLabel) notFound();
  return <ReminderSavedView dateLabel={dateLabel} />;
}
