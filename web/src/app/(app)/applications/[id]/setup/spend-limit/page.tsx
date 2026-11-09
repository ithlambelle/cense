// Created with Claude Code (2026-11-08).
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SpendLimitCredit } from "@/components/setup/spend-limit-credit";
import { applicationIdSchema } from "@/lib/api/schemas";
import { spendLimitCreditPath, spendLimitOrigin } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadCardSetup } from "@/lib/setup/card-setup";

export const metadata: Metadata = { title: "Your credit limit | CENSE" };

// S1, "What is your credit limit?" (US-04, Figma 477:1101): asked before the
// suggestion when the card has no credit limit yet, prefilled when it has one.
export default async function SpendLimitCreditPage({ params, searchParams }: PageProps<"/applications/[id]/setup/spend-limit">) {
  const { id } = await params;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(spendLimitCreditPath(id));
  const setup = await loadCardSetup(student, id);
  if (!setup) notFound();
  return (
    <SpendLimitCredit
      applicationId={id}
      creditLimitCents={setup.application.creditLimitCents}
      from={spendLimitOrigin((await searchParams).from)}
    />
  );
}
