import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConnectView } from "@/components/safe-to-spend/connect-view";
import { bankOffer } from "@/lib/plaid/offer";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES, safeToSpendSetupPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Link your bank | CENSE" };

// Created with Claude Code (2026-11-19). E1, Link your bank on first sign-in
// (Flow 1, Figma 821:8502), opened by "Let's go" on the welcome. Linking is
// optional (D48): Skip for now opens Your next step without a bank (N3).
// Where the student cannot link a bank (safe to spend is off, or, in
// production, they are not in the bank pilot or have no room left) it goes
// straight to N3. A student who already linked a bank goes where the connect
// screen sends them: the questions, or Your money once answered.
export default async function StartLinkBankPage() {
  const student = await requireStudent(ROUTES.start);
  const offer = await bankOffer(student);
  if (!offer) redirect(ROUTES.startNextStep);
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) throw new Error("Could not read the student's bank link.");
  if (loaded.value) redirect(loaded.value.answered ? ROUTES.safeToSpend : safeToSpendSetupPath());
  if (!offer.canLink) redirect(ROUTES.startNextStep);
  return <ConnectView firstLogin sandbox={offer.sandbox} />;
}
