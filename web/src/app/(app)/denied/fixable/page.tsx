import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FixableView } from "@/components/denied/fixable-view";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationParam } from "@/lib/denied";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Contact the issuer | CENSE" };

export default async function FixablePage({ searchParams }: PageProps<"/denied/fixable">) {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  return <FixableView applicationId={applicationParam((await searchParams).application)} />;
}
