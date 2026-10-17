import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReminderSavedCheck } from "@/components/denied/reminder-saved-check";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Reminder saved | CENSE" };

export default async function ReminderSavedPage({ searchParams }: PageProps<"/denied/reminder/saved">) {
  await requireStudent(ROUTES.home);
  const application = (await searchParams).application;
  if (typeof application !== "string" || application === "") notFound();
  return <ReminderSavedCheck applicationId={application} />;
}
