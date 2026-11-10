// Created with Claude Code (2026-11-08).
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { SpendLimitPick } from "@/components/setup/spend-limit-pick";
import { applicationIdSchema } from "@/lib/api/schemas";
import { suggestedSpendLimitCents, tighterSpendLimitCents } from "@/lib/plan/spend-limit";
import { spendLimitCreditPath, spendLimitOrigin, spendLimitPickPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadCardSetup } from "@/lib/setup/card-setup";

export const metadata: Metadata = { title: "Pick your limit | CENSE" };

// S3, "Pick your limit" (US-04, Figma 477:1149), from S2's "Pick my own".
// Without a credit limit, S1 asks for it first.
export default async function SpendLimitPickPage({ params, searchParams }: PageProps<"/applications/[id]/setup/spend-limit/pick">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const from = spendLimitOrigin((await searchParams).from);
  const student = await requireStudent(spendLimitPickPath(id));
  const setup = await loadCardSetup(student, id);
  if (!setup) notFound();
  const { creditLimitCents, spendLimitCents } = setup.application;
  const suggested = suggestedSpendLimitCents(creditLimitCents);
  if (creditLimitCents === null || suggested === null) redirect(spendLimitCreditPath(id, from));
  return (
    <SpendLimitPick
      applicationId={id}
      creditLimitCents={creditLimitCents}
      suggestedCents={suggested}
      tighterCents={tighterSpendLimitCents(creditLimitCents)}
      savedCents={spendLimitCents}
      from={from}
    />
  );
}
