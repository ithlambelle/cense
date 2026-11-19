import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WelcomeFlow } from "@/components/first-login/welcome-flow";
import { needsWelcome } from "@/lib/first-login";
import { plaidConfig } from "@/lib/plaid/config";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Welcome | CENSE" };

// Created with Claude Code (2026-11-19). The first sign-in welcome, W1 then W2
// (Flow 1). Only for a student who has not seen it: anyone else, including a
// student who comes back here after "Let's go", goes on to their usual
// screen through /start. "Let's go" opens Link your bank (E1), or Your next
// step without a bank (N3) where safe to spend is off.
export default async function StartWelcomePage() {
  const student = await requireStudent(ROUTES.start);
  if (!(await needsWelcome(student))) redirect(ROUTES.start);
  return <WelcomeFlow next={plaidConfig() ? ROUTES.startLinkBank : ROUTES.startNextStep} />;
}
