import type { Metadata } from "next";

import { DeniedOptionsView } from "@/components/denied/options-view";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplicationDetail } from "@/lib/student-data";

export const metadata: Metadata = { title: "Denial options | CENSE" };

export default async function DeniedPage({ searchParams }: PageProps<"/denied">) {
  const student = await requireStudent(ROUTES.home);
  const applicationId = applicationParam((await searchParams).application);
  // Only hides an answer already given, so a failed read still shows the screen.
  const application = applicationId ? await loadApplicationDetail(student, applicationId).catch(() => null) : null;
  return <DeniedOptionsView applicationId={applicationId} waitingOnLetter={application?.denialReason === "no_letter_yet"} />;
}
