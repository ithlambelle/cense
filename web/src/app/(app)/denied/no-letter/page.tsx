import type { Metadata } from "next";

import { NoLetterView } from "@/components/denied/no-letter-view";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Waiting on the letter | CENSE" };

export default async function NoLetterPage({ searchParams }: PageProps<"/denied/no-letter">) {
  await requireStudent(ROUTES.home);
  return <NoLetterView applicationId={applicationParam((await searchParams).application)} />;
}
