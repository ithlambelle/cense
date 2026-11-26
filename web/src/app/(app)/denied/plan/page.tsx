import type { Metadata } from "next";

import { DeniedPlanView } from "@/components/denied/plan-view";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { denialPrefersSecured } from "@/lib/rules/fit-tier";
import { requireStudent } from "@/lib/session";
import { loadQuizStanding } from "@/lib/student-data";

export const metadata: Metadata = { title: "Your five-step plan | CENSE" };

// "Build credit another way" offers a secured card only to a student the
// rules point to one after a denial (v1.4: no credit, damaged or not sure).
// Without a quiz answer, or when it cannot be read, it offers cards that fit.
export default async function DeniedPlanPage({ searchParams }: PageProps<"/denied/plan">) {
  const student = await requireStudent(ROUTES.home);
  const standing = await loadQuizStanding(student).catch(() => {
    console.warn(JSON.stringify({ event: "denial_plan_standing_read_failed" }));
    return null;
  });
  return (
    <DeniedPlanView
      applicationId={applicationParam((await searchParams).application)}
      securedFirst={standing !== null && denialPrefersSecured(standing)}
    />
  );
}
