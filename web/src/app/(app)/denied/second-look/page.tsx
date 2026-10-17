import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SecondLook } from "@/components/denied/second-look";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadApplication } from "@/lib/student-data";

export const metadata: Metadata = { title: "Second look | CENSE" };

export default async function SecondLookPage({ searchParams }: PageProps<"/denied/second-look">) {
  const student = await requireStudent(ROUTES.home);
  const applicationId = applicationParam((await searchParams).application);
  // A second look only applies to a card that is currently rejected.
  if (applicationId) {
    const application = await loadApplication(student, applicationId);
    if (!application || application.status !== "rejected") redirect(ROUTES.home);
  }
  return <SecondLook applicationId={applicationId} />;
}
