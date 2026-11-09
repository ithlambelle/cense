import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { HowView } from "@/components/safe-to-spend/how-view";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES, safeToSpendSetupPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "How we got this | CENSE" };

// How we got this (US-12). With no bank linked it sends to the consent
// screen; with the questions unanswered, to the questions.
export default async function SafeToSpendPage() {
  const student = await requireStudent(ROUTES.safeToSpend);
  if (!plaidConfig()) notFound();
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) throw new Error("Could not read the student's bank link.");
  if (!loaded.value) redirect(ROUTES.safeToSpendConnect);
  if (!loaded.value.answered) redirect(safeToSpendSetupPath());
  return <HowView data={loaded.value} />;
}
