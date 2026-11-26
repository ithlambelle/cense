import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ConnectView } from "@/components/safe-to-spend/connect-view";
import { bankOffer } from "@/lib/plaid/offer";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES, safeToSpendSetupPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Link your bank | CENSE" };

// Before Plaid Link (US-12). A student who already linked a bank goes on to
// the questions, or to Your money once they are answered. In production a
// student who cannot link a new bank (not in the pilot, or no room left,
// lib/plaid/pilot.ts) goes Home: Link is not open to them. Your money,
// its questions and Accounts send a student with no bank here, so they land
// Home too.
export default async function SafeToSpendConnectPage() {
  const student = await requireStudent(ROUTES.safeToSpendConnect);
  const offer = await bankOffer(student);
  if (!offer) notFound();
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) throw new Error("Could not read the student's bank link.");
  if (loaded.value) redirect(loaded.value.answered ? ROUTES.safeToSpend : safeToSpendSetupPath());
  if (!offer.canLink) redirect(ROUTES.home);
  return <ConnectView sandbox={offer.sandbox} />;
}
