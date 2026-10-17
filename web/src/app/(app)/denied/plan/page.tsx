import type { Metadata } from "next";

import { DeniedPlanView } from "@/components/denied/plan-view";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your five-step plan | CENSE" };

export default async function DeniedPlanPage({ searchParams }: PageProps<"/denied/plan">) {
  await requireStudent(ROUTES.home);
  return <DeniedPlanView applicationId={applicationParam((await searchParams).application)} />;
}
