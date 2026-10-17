import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReminderSetup } from "@/components/denied/reminder-setup";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationParam } from "@/lib/denied";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Choose when to check in | CENSE" };

export default async function ReminderPage({ searchParams }: PageProps<"/denied/reminder">) {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  return <ReminderSetup applicationId={applicationParam((await searchParams).application)} />;
}
