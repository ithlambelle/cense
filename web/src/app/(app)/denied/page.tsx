import type { Metadata } from "next";

import { DeniedOptionsView } from "@/components/denied/options-view";
import { applicationParam } from "@/lib/denied";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Denial options | CENSE" };

export default async function DeniedPage({ searchParams }: PageProps<"/denied">) {
  await requireStudent(ROUTES.home);
  return <DeniedOptionsView applicationId={applicationParam((await searchParams).application)} />;
}
