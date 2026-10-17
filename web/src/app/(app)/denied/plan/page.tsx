import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DeniedPlanView } from "@/components/denied/plan-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationParam } from "@/lib/denied";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Your five-step plan | CENSE" };

export default async function DeniedPlanPage({ searchParams }: PageProps<"/denied/plan">) {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  return <DeniedPlanView applicationId={applicationParam((await searchParams).application)} />;
}
