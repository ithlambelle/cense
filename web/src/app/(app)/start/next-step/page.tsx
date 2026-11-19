import type { Metadata } from "next";

import { NextStepNoBank } from "@/components/first-login/next-step-no-bank";
import { plaidConfig } from "@/lib/plaid/config";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your next step | CENSE" };

// Created with Claude Code (2026-11-19). N3 (Flow 1, Figma 821:8701), opened
// by Skip for now on first sign-in's Link your bank. Its back arrow returns
// to the screen the student came from; with none behind it (a reload in a new
// tab), to Link your bank, or Home where safe to spend is off.
export default async function StartNextStepPage() {
  await requireStudent(ROUTES.start);
  const canLink = plaidConfig() !== null;
  const back = canLink ? { href: ROUTES.startLinkBank, label: "Link your bank" } : { href: ROUTES.home, label: "Home" };
  return <NextStepNoBank backHref={back.href} backLabel={back.label} canLinkLater={canLink} />;
}
