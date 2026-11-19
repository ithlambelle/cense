// Created with Claude Code (2026-11-08).
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AutopayConfirm } from "@/components/setup/autopay-confirm";
import { applicationIdSchema } from "@/lib/api/schemas";
import { autopayConfirmPath, autopayOrigin, cardOrigin } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadCardSetup } from "@/lib/setup/card-setup";

export const metadata: Metadata = { title: "Did you turn on autopay? | CENSE" };

// I3, "Did you turn on autopay?" (US-10): the student says what they set up
// at the issuer. Nothing is picked for them.
// Opened from the card's page (?from=card), its answers return there.
export default async function AutopayConfirmPage({ params, searchParams }: PageProps<"/applications/[id]/setup/autopay/confirm">) {
  const { id } = await params;
  const { from, card_from: cardFrom } = await searchParams;
  if (!applicationIdSchema.safeParse(id).success) notFound();
  const student = await requireStudent(autopayConfirmPath(id));
  const setup = await loadCardSetup(student, id);
  if (!setup) notFound();
  return (
    <AutopayConfirm
      applicationId={id}
      issuerName={setup.issuer?.name ?? setup.brand}
      from={autopayOrigin(from)}
      cardId={setup.application.cardId}
      cardFrom={cardOrigin(cardFrom)}
    />
  );
}
