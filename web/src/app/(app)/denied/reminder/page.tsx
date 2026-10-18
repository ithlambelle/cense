import type { Metadata } from "next";

import { ReminderSetup } from "@/components/denied/reminder-setup";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Choose when to check in | CENSE" };

export default async function ReminderPage({ searchParams }: PageProps<"/denied/reminder">) {
  await requireStudent(ROUTES.home);
  return <ReminderSetup applicationId={applicationParam((await searchParams).application)} />;
}
