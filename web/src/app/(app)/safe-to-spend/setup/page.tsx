import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SetupFlow } from "@/components/safe-to-spend/setup-flow";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES } from "@/lib/routes";
import { SET_ASIDE_STEP } from "@/lib/safe-to-spend/compute";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Who covers what | CENSE" };

// Who covers which bills, then the set-aside (US-12, Figma 222:2090). Opens
// after a bank is linked, and again from How we got this to change answers.
export default async function SafeToSpendSetupPage({ searchParams }: PageProps<"/safe-to-spend/setup">) {
  const student = await requireStudent(ROUTES.safeToSpendSetup);
  if (!plaidConfig()) notFound();
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) throw new Error("Could not read the student's bank link.");
  if (!loaded.value) redirect(ROUTES.safeToSpendConnect);
  // ?step=2 to 6; anything else is the first step.
  const raw = Number((await searchParams).step);
  const step = Number.isInteger(raw) && raw >= 1 && raw <= SET_ASIDE_STEP ? raw : 1;
  return (
    <SetupFlow
      step={step}
      savedBills={loaded.value.bills}
      savedSetAsideCents={loaded.value.setAsideCents}
      answered={loaded.value.answered}
    />
  );
}
