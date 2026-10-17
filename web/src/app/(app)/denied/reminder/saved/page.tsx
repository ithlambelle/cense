import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ReminderSavedCheck } from "@/components/denied/reminder-saved-check";
import { authenticatedStudent } from "@/lib/api/auth";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Reminder saved | CENSE" };

export default async function ReminderSavedPage({ searchParams }: PageProps<"/denied/reminder/saved">) {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  const application = (await searchParams).application;
  if (typeof application !== "string" || application === "") notFound();
  return <ReminderSavedCheck applicationId={application} />;
}
