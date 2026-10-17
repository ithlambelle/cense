import type { Metadata } from "next";

import { FixableView } from "@/components/denied/fixable-view";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Contact the issuer | CENSE" };

export default async function FixablePage({ searchParams }: PageProps<"/denied/fixable">) {
  await requireStudent(ROUTES.home);
  return <FixableView applicationId={applicationParam((await searchParams).application)} />;
}
