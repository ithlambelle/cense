import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DeniedOptionsView } from "@/components/denied/options-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationParam } from "@/lib/denied";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Denial options | CENSE" };

export default async function DeniedPage({ searchParams }: PageProps<"/denied">) {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  return <DeniedOptionsView applicationId={applicationParam((await searchParams).application)} />;
}
