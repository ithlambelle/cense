import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ConnectView } from "@/components/safe-to-spend/connect-view";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES, safeToSpendSetupPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "See what’s safe to spend | CENSE" };

// Before Plaid Link (US-12). A student who already linked a bank goes on to
// the questions, or to How we got this once they are answered.
export default async function SafeToSpendConnectPage() {
  const student = await requireStudent(ROUTES.safeToSpendConnect);
  if (!plaidConfig()) notFound();
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) throw new Error("Could not read the student's bank link.");
  if (loaded.value) redirect(loaded.value.answered ? ROUTES.safeToSpend : safeToSpendSetupPath());
  return <ConnectView />;
}
