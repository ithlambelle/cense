import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SecondLook } from "@/components/denied/second-look";
import { authenticatedStudent } from "@/lib/api/auth";
import { applicationParam } from "@/lib/denied";
import { ROUTES, signInPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Second look | CENSE" };

export default async function SecondLookPage({ searchParams }: PageProps<"/denied/second-look">) {
  const student = await authenticatedStudent();
  if (!student) redirect(signInPath(ROUTES.home));
  return <SecondLook applicationId={applicationParam((await searchParams).application)} />;
}
