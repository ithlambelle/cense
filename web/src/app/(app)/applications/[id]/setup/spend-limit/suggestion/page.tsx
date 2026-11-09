// Created with Claude Code (2026-11-08).
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SpendLimitSuggestion } from "@/components/setup/spend-limit-suggestion";
import { applicationIdSchema } from "@/lib/api/schemas";
import { suggestedSpendLimitCents } from "@/lib/plan/spend-limit";
import { spendLimitCreditPath, spendLimitOrigin, spendLimitSuggestionPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadCardSetup } from "@/lib/setup/card-setup";

export const metadata: Metadata = { title: "A limit to try this month | CENSE" };

// S2, "A limit to try this month" (US-04, Figma 477:1043): 30% of the credit
// limit. Without a credit limit, S1 asks for it first.
export default async function SpendLimitSuggestionPage({
  params,
  searchParams,
}: PageProps<"/applications/[id]/setup/spend-limit/suggestion">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const from = spendLimitOrigin((await searchParams).from);
  const student = await requireStudent(spendLimitSuggestionPath(id));
  const setup = await loadCardSetup(student, id);
  if (!setup) notFound();
  const creditLimitCents = setup.application.creditLimitCents;
  const suggested = suggestedSpendLimitCents(creditLimitCents);
  if (creditLimitCents === null || suggested === null) redirect(spendLimitCreditPath(id, from));
  return <SpendLimitSuggestion applicationId={id} creditLimitCents={creditLimitCents} suggestedCents={suggested} from={from} />;
}
